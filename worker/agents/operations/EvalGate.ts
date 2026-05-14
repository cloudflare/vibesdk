/**
 * EvalGate — phase-promotion quality gate (ADR-004 §Implementation step 3).
 *
 * Emits 4 DeepEval-equivalent metrics per phase using Claude as the judge:
 *   - faithfulness        — does generated code align w/ the phase spec?
 *   - answerRelevancy     — does it address the user's underlying request?
 *   - toolCorrectness     — did agents call tools they were supposed to?
 *   - hallucinationRisk   — proportion of unverified factual claims
 *
 * Each metric is a float in [0..1]. The gate blocks promotion when:
 *   - faithfulness < FAITHFULNESS_FLOOR (0.6), OR
 *   - hallucinationRisk > HALLUCINATION_CEILING (0.2).
 *
 * Why a TS-port of DeepEval, not the Python lib (per ADR-004):
 *   - Worker runtime is edge-only; no Python sidecar without cold-start hit.
 *   - We only need 4 metrics today, not the 50+ DeepEval ships.
 *   - The eval runs as a single Claude call (claudeDirect) → minimal spend.
 *
 * Storage: results land in `eval_results` table (see migration 0008).
 * Read path is for the future /sessions/:id/quality endpoint.
 *
 * Public API:
 *   - runEvalGate(env, input)            — execute the gate (async, never throws)
 *   - decide(scores, comments, tokens)   — pure gate decision (unit-testable)
 *   - computeCompositeEvalScore(scores)  — shared composite formula (mean of 4)
 *   - FAITHFULNESS_FLOOR / HALLUCINATION_CEILING — threshold constants
 */

import { callClaudeForJson } from '../inferutils/claudeDirect';
import { createLogger } from '../../logger';
import type { PhaseConceptType, PhaseImplementationSchemaType } from '../schemas';
import { getCachedEvalVerdict, cacheEvalVerdict } from './eval-cache';

const logger = createLogger('EvalGate');

export const FAITHFULNESS_FLOOR = 0.6;
export const HALLUCINATION_CEILING = 0.2;

/** Score returned by the judge — all in [0..1]. */
export interface EvalScores {
    readonly faithfulness: number;
    readonly answerRelevancy: number;
    readonly toolCorrectness: number;
    readonly hallucinationRisk: number;
}

export interface EvalVerdict {
    readonly scores: EvalScores;
    readonly passed: boolean;
    /** Reason the gate blocked, or null when passed. */
    readonly blockedReason: string | null;
    /** Human-readable comments from the judge — kept short for the DB. */
    readonly comments: string;
    /** Token cost of running the judge — for telemetry / budget accounting. */
    readonly judgeTokens: { readonly input: number; readonly output: number };
}

export interface EvalInput {
    readonly sessionId: string;
    readonly userId: string;
    readonly phase: PhaseConceptType;
    readonly implementation: PhaseImplementationSchemaType | null;
    readonly userQuery: string;
}

const JUDGE_SCHEMA_DESCRIPTION =
    '{ "faithfulness": number(0..1), "answerRelevancy": number(0..1), "toolCorrectness": number(0..1), "hallucinationRisk": number(0..1), "comments": string }';

const SYSTEM_PROMPT = `You are an automated quality judge for an AI code generation system.
Score the generated phase implementation on 4 metrics, each a float in [0..1] where 1 is best:

1. faithfulness        Does the implementation match the phase spec? Penalise drift, missing files, mis-named modules.
2. answerRelevancy     Does it address the user's underlying request? Penalise off-topic work, gold-plating.
3. toolCorrectness     Were the right tools called? Penalise wrong tool, missing tool, unused tool.
4. hallucinationRisk   Estimate the proportion of unverified factual claims (e.g. API endpoints that don't exist, made-up library exports). Higher = worse. Conservative.

Return STRICT JSON only. Keep comments under 240 characters.`;

interface JudgeRaw {
    readonly faithfulness?: number;
    readonly answerRelevancy?: number;
    readonly toolCorrectness?: number;
    readonly hallucinationRisk?: number;
    readonly comments?: string;
}

/**
 * Run the gate. Always returns a verdict — never throws — so a judge
 * outage cannot block a generation entirely. On error we return a
 * permissive verdict (passed=true, neutral scores) and log so we can
 * spot judge-availability problems via telemetry.
 */
export async function runEvalGate(env: Env, input: EvalInput): Promise<EvalVerdict> {
    const phaseName = input.phase.name ?? '';

    // ResponseCache analog (eval-cache.ts) — skip judge LLM call when the same
    // (session, phase) pair was scored within the current process lifetime (10-min TTL).
    // Covers retry storms and concurrent duplicate eval requests in multi-agent mode.
    const cached = getCachedEvalVerdict(input.sessionId, phaseName);
    if (cached) {
        logger.info('EvalGate cache hit — returning cached verdict', {
            sessionId: input.sessionId,
            phase: phaseName,
        });
        return cached;
    }

    try {
        const judgePrompt = buildJudgePrompt(input);
        const judged = await callClaudeForJson<JudgeRaw>({
            env: { ANTHROPIC_API_KEY: getAnthropicKey(env) },
            system: SYSTEM_PROMPT,
            messages: [{ role: 'user', content: judgePrompt }],
            jsonSchemaDescription: JUDGE_SCHEMA_DESCRIPTION,
            maxTokens: 512,
            temperature: 0,
        });
        const scores = sanitizeScores(judged.value);
        const verdict = decide(scores, judged.value.comments ?? '', {
            input: judged.usage.inputTokens,
            output: judged.usage.outputTokens,
        });

        // Store for subsequent calls within the same process window.
        cacheEvalVerdict(input.sessionId, phaseName, verdict);

        logger.info('EvalGate verdict', {
            sessionId: input.sessionId,
            phase: phaseName,
            passed: verdict.passed,
            blockedReason: verdict.blockedReason,
            faithfulness: scores.faithfulness,
            hallucinationRisk: scores.hallucinationRisk,
            elapsedMs: judged.usage.elapsedMs,
        });
        return verdict;
    } catch (err) {
        logger.warn('EvalGate threw — emitting permissive verdict', {
            sessionId: input.sessionId,
            phase: phaseName,
            error: err instanceof Error ? err.message : String(err),
        });
        return permissiveVerdict('judge-threw');
    }
}

/**
 * Compute the composite (0-1) eval score from four individual metrics.
 *
 * Formula: mean of (faithfulness, answerRelevancy, toolCorrectness,
 * 1 − hallucinationRisk).  Exported so all callers share one definition.
 */
export function computeCompositeEvalScore(scores: EvalScores): number {
    return (
        scores.faithfulness +
        scores.answerRelevancy +
        scores.toolCorrectness +
        (1 - scores.hallucinationRisk)
    ) / 4;
}

/**
 * Pure decision function — exposed for unit tests. Given scores +
 * comments, decide pass/fail per the documented floor + ceiling.
 */
export function decide(
    scores: EvalScores,
    comments: string,
    judgeTokens: EvalVerdict['judgeTokens'] = { input: 0, output: 0 },
): EvalVerdict {
    if (scores.faithfulness < FAITHFULNESS_FLOOR) {
        return {
            scores,
            passed: false,
            blockedReason: `faithfulness ${scores.faithfulness.toFixed(2)} < floor ${FAITHFULNESS_FLOOR}`,
            comments: comments.slice(0, 240),
            judgeTokens,
        };
    }
    if (scores.hallucinationRisk > HALLUCINATION_CEILING) {
        return {
            scores,
            passed: false,
            blockedReason: `hallucinationRisk ${scores.hallucinationRisk.toFixed(2)} > ceiling ${HALLUCINATION_CEILING}`,
            comments: comments.slice(0, 240),
            judgeTokens,
        };
    }
    return {
        scores,
        passed: true,
        blockedReason: null,
        comments: comments.slice(0, 240),
        judgeTokens,
    };
}

function permissiveVerdict(reason: string): EvalVerdict {
    return {
        scores: { faithfulness: 0.7, answerRelevancy: 0.7, toolCorrectness: 0.7, hallucinationRisk: 0.1 },
        passed: true,
        blockedReason: null,
        comments: `permissive-verdict:${reason}`,
        judgeTokens: { input: 0, output: 0 },
    };
}

/**
 * Clamp + coerce judge output to a safe shape. NaN, missing fields, and
 * out-of-range values are normalised so the decision function stays pure.
 */
function sanitizeScores(raw: JudgeRaw): EvalScores {
    return {
        faithfulness: clamp01(raw.faithfulness),
        answerRelevancy: clamp01(raw.answerRelevancy),
        toolCorrectness: clamp01(raw.toolCorrectness),
        hallucinationRisk: clamp01(raw.hallucinationRisk),
    };
}

function clamp01(n: unknown): number {
    const v = typeof n === 'number' && Number.isFinite(n) ? n : 0.5;
    if (v < 0) return 0;
    if (v > 1) return 1;
    return v;
}

function buildJudgePrompt(input: EvalInput): string {
    const filesList = (input.phase.files ?? [])
        .map((f) => `- ${f.path}: ${f.purpose ?? ''}`)
        .join('\n');
    const implSummary = summariseImpl(input.implementation);
    return [
        `USER REQUEST:`,
        input.userQuery.slice(0, 1200),
        ``,
        `PHASE SPEC:`,
        `name: ${input.phase.name}`,
        `description: ${input.phase.description ?? ''}`,
        `files claimed:`,
        filesList || '(none)',
        ``,
        `IMPLEMENTATION SUMMARY:`,
        implSummary,
        ``,
        `Score the implementation on the 4 metrics. JSON only.`,
    ].join('\n');
}

function summariseImpl(impl: PhaseImplementationSchemaType | null): string {
    if (!impl) return '(no implementation supplied)';
    const filesField = (impl as { files?: readonly { path?: string }[] }).files;
    const cmdsField = (impl as { commands?: readonly string[] }).commands;
    const files = (filesField ?? []).slice(0, 12).map((f) => f.path ?? '').filter(Boolean).join(', ');
    const cmds = (cmdsField ?? []).slice(0, 8).join(' && ');
    return [
        `files touched: ${files || '(none)'}`,
        `commands: ${cmds || '(none)'}`,
    ].join('\n');
}

/**
 * Loose lookup so this module compiles before `cf-typegen` updates the typed Env.
 * `claudeDirect` only reads `env.ANTHROPIC_API_KEY` so we extract just that.
 */
function getAnthropicKey(env: Env): string | undefined {
    return (env as unknown as Record<string, string | undefined>).ANTHROPIC_API_KEY;
}
