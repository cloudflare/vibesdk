/**
 * Unit tests for runMastraEvalScorer (worker/services/mastra/evalGate.ts).
 *
 * Tests the composite score calculation, gate pass/fail logic, and the
 * permissive fallback when EvalGate throws.  Only runEvalGate is mocked
 * (calls claudeDirect); constants and computeCompositeEvalScore use real
 * implementations via importOriginal — no Cloudflare bindings needed.
 *
 * Note: These tests require `@cloudflare/vitest-pool-workers` which needs the
 * platform-specific workerd binary.  On Windows dev machines the binary may
 * be absent; run via `npm test` in CI (Linux/macOS) where it is available.
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

// ── Mock EvalGate ──────────────────────────────────────────────────────────
//
// Only mock `runEvalGate` — it calls claudeDirect (needs API key + CF bindings).
// All other exports are provided manually in the factory:
//   - constants: literal values (0.6, 0.2)
//   - computeCompositeEvalScore: real 4-metric mean formula (pure function)
//
// Why no importOriginal?  bun's vitest compat passes `undefined` for the
// importOriginal parameter, so calling it throws at runtime.  Manual provision
// of each export sidesteps the limitation without duplicating meaningful logic.
//
// Pattern: declare vi.fn() at module scope; wrap in arrow function inside the
// factory so the reference is resolved lazily (at call time, not factory time).
// This avoids vi.hoisted() which is also unsupported in bun's vitest compat.
const mockRunEvalGate = vi.fn();

vi.mock('../../agents/operations/EvalGate', () => ({
    // Threshold constants (same literal values as EvalGate source)
    FAITHFULNESS_FLOOR: 0.6,
    HALLUCINATION_CEILING: 0.2,
    // Real formula: arithmetic mean of 4 metrics (hallucinationRisk inverted).
    // Mirrors computeCompositeEvalScore in EvalGate.ts exactly.
    computeCompositeEvalScore: (scores: {
        faithfulness: number;
        answerRelevancy: number;
        toolCorrectness: number;
        hallucinationRisk: number;
    }) =>
        (scores.faithfulness +
            scores.answerRelevancy +
            scores.toolCorrectness +
            (1 - scores.hallucinationRisk)) /
        4,
    // Mocked — runEvalGate resolved lazily via closure (vi.fn() assigned before call)
    runEvalGate: (...args: unknown[]) => mockRunEvalGate(...args),
}));

// Logger mock — suppress console output during tests.
vi.mock('../../logger', () => ({
    createLogger: () => ({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    }),
}));

import { runMastraEvalScorer, FAITHFULNESS_FLOOR, HALLUCINATION_CEILING } from './evalGate';
import type { EvalInput } from '../../agents/operations/EvalGate';

// ── Test fixtures ──────────────────────────────────────────────────────────

function makeInput(overrides: Partial<EvalInput> = {}): EvalInput {
    return {
        sessionId: 'sess-test',
        userId: 'user-test',
        phase: { name: 'TestPhase', description: '', files: [] } as any,
        implementation: null,
        userQuery: 'build me a todo app',
        ...overrides,
    };
}

function makeVerdict(scores: {
    faithfulness?: number;
    answerRelevancy?: number;
    toolCorrectness?: number;
    hallucinationRisk?: number;
}, opts: { passed?: boolean; blockedReason?: string | null } = {}) {
    const s = {
        faithfulness: 0.8,
        answerRelevancy: 0.9,
        toolCorrectness: 0.85,
        hallucinationRisk: 0.1,
        ...scores,
    };
    const passed = opts.passed ?? (s.faithfulness >= FAITHFULNESS_FLOOR && s.hallucinationRisk <= HALLUCINATION_CEILING);
    return {
        scores: s,
        passed,
        blockedReason: opts.blockedReason ?? (passed ? null : 'below faithfulness floor'),
        comments: 'Test judge comment.',
        judgeTokens: { input: 100, output: 50 },
    };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('runMastraEvalScorer', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('computes composite score as arithmetic mean (hallucination inverted)', async () => {
        const verdict = makeVerdict({
            faithfulness: 0.8,
            answerRelevancy: 0.7,
            toolCorrectness: 0.9,
            hallucinationRisk: 0.1,  // inverted → 0.9
        });
        // composite = (0.8 + 0.7 + 0.9 + 0.9) / 4 = 0.825
        mockRunEvalGate.mockResolvedValue(verdict);

        const result = await runMastraEvalScorer({} as any, makeInput());

        expect(result.score).toBeCloseTo(0.825, 3);
        expect(result.passed).toBe(true);
    });

    it('rounds composite score to 3 decimal places', async () => {
        const verdict = makeVerdict({
            faithfulness: 0.7,
            answerRelevancy: 0.8,
            toolCorrectness: 0.6,
            hallucinationRisk: 0.15,  // inverted → 0.85
        });
        // composite = (0.7 + 0.8 + 0.6 + 0.85) / 4 = 0.7375
        mockRunEvalGate.mockResolvedValue(verdict);

        const result = await runMastraEvalScorer({} as any, makeInput());

        expect(result.score).toBe(0.738); // Math.round(0.7375 * 1000) / 1000
    });

    it('reports gate passed when faithfulness ≥ floor and hallucination ≤ ceiling', async () => {
        const verdict = makeVerdict({ faithfulness: 0.6, hallucinationRisk: 0.2 }, { passed: true });
        mockRunEvalGate.mockResolvedValue(verdict);

        const result = await runMastraEvalScorer({} as any, makeInput());

        expect(result.passed).toBe(true);
        expect(result.reason).toMatch(/Gate passed/);
    });

    it('reports gate blocked when faithfulness < floor', async () => {
        const verdict = makeVerdict(
            { faithfulness: 0.59, hallucinationRisk: 0.1 },
            { passed: false, blockedReason: 'faithfulness 0.59 < floor 0.6' },
        );
        mockRunEvalGate.mockResolvedValue(verdict);

        const result = await runMastraEvalScorer({} as any, makeInput());

        expect(result.passed).toBe(false);
        expect(result.reason).toMatch(/Gate blocked/);
        expect(result.metadata.blockedReason).toBe('faithfulness 0.59 < floor 0.6');
    });

    it('reports gate blocked when hallucinationRisk > ceiling', async () => {
        const verdict = makeVerdict(
            { faithfulness: 0.8, hallucinationRisk: 0.21 },
            { passed: false, blockedReason: 'hallucination 0.21 > ceiling 0.2' },
        );
        mockRunEvalGate.mockResolvedValue(verdict);

        const result = await runMastraEvalScorer({} as any, makeInput());

        expect(result.passed).toBe(false);
        expect(result.metadata.hallucinationRisk).toBeCloseTo(0.21);
    });

    it('populates full metadata from verdict scores + judgeTokens', async () => {
        const verdict = makeVerdict({
            faithfulness: 0.75,
            answerRelevancy: 0.85,
            toolCorrectness: 0.65,
            hallucinationRisk: 0.05,
        });
        verdict.judgeTokens = { input: 200, output: 80 };
        mockRunEvalGate.mockResolvedValue(verdict);

        const result = await runMastraEvalScorer({} as any, makeInput());

        expect(result.metadata.faithfulness).toBe(0.75);
        expect(result.metadata.answerRelevancy).toBe(0.85);
        expect(result.metadata.toolCorrectness).toBe(0.65);
        expect(result.metadata.hallucinationRisk).toBe(0.05);
        expect(result.metadata.judgeInputTokens).toBe(200);
        expect(result.metadata.judgeOutputTokens).toBe(80);
        expect(result.metadata.blockedReason).toBeNull();
    });

    it('returns permissive score (1.0 passed) when EvalGate throws', async () => {
        mockRunEvalGate.mockRejectedValue(new Error('network timeout'));

        const result = await runMastraEvalScorer({} as any, makeInput());

        expect(result.score).toBe(1);
        expect(result.passed).toBe(true);
        expect(result.reason).toMatch(/eval-gate-error/);
        expect(result.metadata.faithfulness).toBe(1);
        expect(result.metadata.hallucinationRisk).toBe(0);
        expect(result.metadata.judgeInputTokens).toBe(0);
    });

    it('re-exports FAITHFULNESS_FLOOR and HALLUCINATION_CEILING from EvalGate', () => {
        expect(FAITHFULNESS_FLOOR).toBe(0.6);
        expect(HALLUCINATION_CEILING).toBe(0.2);
    });
});
