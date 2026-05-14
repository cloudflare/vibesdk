/**
 * Unit tests for pure-function exports of EvalGate.ts:
 *   - computeCompositeEvalScore
 *   - decide
 *
 * These functions have no Cloudflare bindings and no I/O — they run in any
 * Vitest environment without special configuration.
 */

import { describe, it, expect } from 'vitest';
import {
    computeCompositeEvalScore,
    decide,
    FAITHFULNESS_FLOOR,
    HALLUCINATION_CEILING,
} from './EvalGate';
import type { EvalScores } from './EvalGate';

// ── Helpers ────────────────────────────────────────────────────────────────

function scores(
    faithfulness: number,
    answerRelevancy: number,
    toolCorrectness: number,
    hallucinationRisk: number,
): EvalScores {
    return { faithfulness, answerRelevancy, toolCorrectness, hallucinationRisk };
}

// ── computeCompositeEvalScore ──────────────────────────────────────────────

describe('computeCompositeEvalScore', () => {
    it('returns mean of 4 metrics with hallucinationRisk inverted', () => {
        // (0.8 + 0.7 + 0.9 + (1 - 0.1)) / 4 = (0.8 + 0.7 + 0.9 + 0.9) / 4 = 3.3 / 4 = 0.825
        const s = scores(0.8, 0.7, 0.9, 0.1);
        expect(computeCompositeEvalScore(s)).toBeCloseTo(0.825, 6);
    });

    it('returns 1.0 for perfect scores (hallucinationRisk = 0)', () => {
        const s = scores(1, 1, 1, 0);
        expect(computeCompositeEvalScore(s)).toBe(1);
    });

    it('returns 0.0 for worst scores (hallucinationRisk = 1)', () => {
        const s = scores(0, 0, 0, 1);
        expect(computeCompositeEvalScore(s)).toBe(0);
    });

    it('is symmetric — uniform scores yield that value (excluding hallucination)', () => {
        // All non-hallucination scores = 0.5, hallucinationRisk = 0.5 (inverted → 0.5)
        // composite = (0.5 + 0.5 + 0.5 + 0.5) / 4 = 0.5
        const s = scores(0.5, 0.5, 0.5, 0.5);
        expect(computeCompositeEvalScore(s)).toBe(0.5);
    });

    it('matches the formula used by the Mastra scorer and phasic monolith path', () => {
        // Reference values cross-checked with manual calculation.
        const s = scores(0.7, 0.8, 0.6, 0.15);
        // (0.7 + 0.8 + 0.6 + 0.85) / 4 = 2.95 / 4 = 0.7375
        expect(computeCompositeEvalScore(s)).toBeCloseTo(0.7375, 6);
    });
});

// ── decide ─────────────────────────────────────────────────────────────────

describe('decide', () => {
    it('passes when faithfulness ≥ floor and hallucinationRisk ≤ ceiling', () => {
        const s = scores(FAITHFULNESS_FLOOR, 0.8, 0.8, HALLUCINATION_CEILING);
        const verdict = decide(s, 'looks good');
        expect(verdict.passed).toBe(true);
        expect(verdict.blockedReason).toBeNull();
    });

    it('blocks when faithfulness is below floor', () => {
        const s = scores(FAITHFULNESS_FLOOR - 0.01, 0.9, 0.9, 0.1);
        const verdict = decide(s, 'spec drift');
        expect(verdict.passed).toBe(false);
        expect(verdict.blockedReason).toMatch(/faithfulness/);
    });

    it('blocks when hallucinationRisk is above ceiling', () => {
        const s = scores(0.9, 0.9, 0.9, HALLUCINATION_CEILING + 0.01);
        const verdict = decide(s, 'hallucinated imports');
        expect(verdict.passed).toBe(false);
        expect(verdict.blockedReason).toMatch(/hallucinationRisk/);
    });

    it('truncates comments to 240 characters', () => {
        const s = scores(0.9, 0.9, 0.9, 0.1);
        const longComment = 'x'.repeat(300);
        const verdict = decide(s, longComment);
        expect(verdict.comments.length).toBe(240);
    });

    it('faithfulness block takes priority over hallucination block', () => {
        // Both metrics in violation — expect faithfulness error first.
        const s = scores(FAITHFULNESS_FLOOR - 0.1, 0.9, 0.9, HALLUCINATION_CEILING + 0.1);
        const verdict = decide(s, '');
        expect(verdict.blockedReason).toMatch(/faithfulness/);
    });

    it('accepts optional judgeTokens and includes them in verdict', () => {
        const s = scores(0.9, 0.9, 0.9, 0.1);
        const tokens = { input: 150, output: 60 };
        const verdict = decide(s, '', tokens);
        expect(verdict.judgeTokens).toEqual(tokens);
    });

    it('defaults judgeTokens to {input:0, output:0} when omitted', () => {
        const s = scores(0.9, 0.9, 0.9, 0.1);
        const verdict = decide(s, '');
        expect(verdict.judgeTokens).toEqual({ input: 0, output: 0 });
    });
});
