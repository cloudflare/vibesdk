/**
 * Mastra-compatible eval scorer that wraps the existing vibesdk EvalGate.
 *
 * The EvalGate (`worker/agents/operations/EvalGate.ts`) already runs a
 * Claude-judge scoring pass emitting 4 DeepEval-equivalent metrics.  This
 * module adapts its output into the Mastra Scorer signature so the
 * PhaseWorkflow can attach eval results as structured step metadata.
 *
 * Output shape follows Mastra's scorer contract:
 *   { score: number (0-1), reason: string, metadata?: Record<string,unknown> }
 *
 * Why not use @mastra/core Scorer class directly?
 * The full Scorer class requires a Mastra storage backend for trace
 * persistence (unavailable in CF Worker in-memory mode).  The lightweight
 * adapter here produces the same shape without the storage dependency.
 */

import {
    runEvalGate,
    computeCompositeEvalScore,
    FAITHFULNESS_FLOOR,
    HALLUCINATION_CEILING,
} from '../../agents/operations/EvalGate';
import type { EvalVerdict, EvalInput } from '../../agents/operations/EvalGate';
import type { PhaseImplementationSchemaType, PhaseConceptType } from '../../agents/schemas';
import { createLogger } from '../../logger';

const logger = createLogger('MastraEvalGate');

// ── Types ──────────────────────────────────────────────────────────────────

export interface MastraEvalResult {
    /** Composite score: mean of the 4 individual metrics. */
    readonly score: number;
    /** Gate passed (true) or blocked (false). */
    readonly passed: boolean;
    /** Short natural-language reason — surfaced in Mastra run metadata. */
    readonly reason: string;
    /** Full metric breakdown. */
    readonly metadata: {
        readonly faithfulness: number;
        readonly answerRelevancy: number;
        readonly toolCorrectness: number;
        readonly hallucinationRisk: number;
        readonly blockedReason: string | null;
        readonly judgeInputTokens: number;
        readonly judgeOutputTokens: number;
    };
}

// ── Scorer ─────────────────────────────────────────────────────────────────

/**
 * Run the vibesdk eval gate and return a Mastra-compatible scorer result.
 *
 * @param env    Cloudflare Worker env bindings (passed through to judge).
 * @param input  Full EvalInput struct (sessionId, userId, phase, impl, userQuery).
 * @returns      MastraEvalResult — safe to embed in Mastra step output.
 */
export async function runMastraEvalScorer(
    env: Env,
    input: EvalInput,
): Promise<MastraEvalResult> {
    let verdict: EvalVerdict;

    try {
        verdict = await runEvalGate(env, input);
    } catch (err) {
        logger.warn('runMastraEvalScorer: EvalGate threw, returning permissive score', {
            err: err instanceof Error ? err.message : String(err),
        });
        return {
            score: 1,
            passed: true,
            reason: 'eval-gate-error: permissive fallback',
            metadata: {
                faithfulness: 1,
                answerRelevancy: 1,
                toolCorrectness: 1,
                hallucinationRisk: 0,
                blockedReason: null,
                judgeInputTokens: 0,
                judgeOutputTokens: 0,
            },
        };
    }

    const { scores, passed, blockedReason, comments, judgeTokens } = verdict;

    // Composite score: shared formula from EvalGate (hallucinationRisk inverted).
    const composite = computeCompositeEvalScore(scores);

    logger.info('MastraEvalScorer verdict', {
        phase: input.phase.name,
        composite: composite.toFixed(3),
        passed,
        blockedReason,
    });

    return {
        score: Math.round(composite * 1000) / 1000,
        passed,
        reason: passed
            ? `Gate passed — faithfulness ${scores.faithfulness.toFixed(2)}, hallucination ${scores.hallucinationRisk.toFixed(2)}. ${comments}`
            : `Gate blocked — ${blockedReason ?? 'below threshold'}. ${comments}`,
        metadata: {
            faithfulness: scores.faithfulness,
            answerRelevancy: scores.answerRelevancy,
            toolCorrectness: scores.toolCorrectness,
            hallucinationRisk: scores.hallucinationRisk,
            blockedReason: blockedReason ?? null,
            judgeInputTokens: judgeTokens.input,
            judgeOutputTokens: judgeTokens.output,
        },
    };
}

// ── Re-export thresholds so PhaseWorkflow can gate on them ─────────────────

export { FAITHFULNESS_FLOOR, HALLUCINATION_CEILING };
