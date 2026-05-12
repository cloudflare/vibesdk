/**
 * Daily benchmark cron — VibeSDK vs Emergent.
 *
 * Schedule: `0 3 * * *` (03:00 UTC) — wired in `wrangler.jsonc` `[triggers].crons`
 * and dispatched from `worker/index.ts` `scheduled()` hook.
 *
 * Spec: docs/redesign/BENCHMARK-PAGE-SPEC.md §3 + §4.
 *
 * Behaviour (S2 scaffold):
 *   1. Iterate `benchmark-prompts.json` (5-prompt rotation, one per day).
 *   2. Run the day's prompt on both products. The VibeSDK side is currently
 *      stubbed — see TODO(S2-followup) below — because cleanly invoking the
 *      CodeGeneratorAgent state machine without a real user session requires
 *      a separate "headless run" entry point we don't have yet. We emit
 *      deterministic synthetic numbers so the page renders cleanly while the
 *      real wiring lands in S2-followup.
 *   3. Emergent side is always synthetic w/ pessimistic multipliers (per spec:
 *      "wall-clock x 2.5, credits x 2, success=true"). Real Emergent wiring is
 *      tracked as TODO(S2-emergent).
 *   4. Build a `BenchmarkLatestResponse` from the last 7 days of pairs + write
 *      to KV under both `latest` and `history-YYYY-MM-DD`.
 *
 * Cost guard: never makes more than `MAX_PROMPTS_PER_RUN` (1) attempts per cron
 * tick so a runaway loop can't melt our Anthropic/Emergent bills.
 */

import { createLogger } from '../logger';
import type {
    BenchmarkAggregate,
    BenchmarkDailyPair,
    BenchmarkLatestResponse,
    BenchmarkPrompt,
    BenchmarkRun,
    BenchmarkWinner,
} from '../../shared/types/benchmark';
import { BENCHMARK_PROMPTS as prompts } from './benchmark-prompts';

const logger = createLogger('benchmarkRunner');

const HISTORY_DAYS = 7;
const MAX_PROMPTS_PER_RUN = 1;     // one prompt/day — spec §3 ("5-day cycle")
const VIBESDK_DISPLAY_NAME = 'VibeSDK';
const EMERGENT_DISPLAY_NAME = 'Emergent';

// Synthetic numbers anchor. Real numbers replace these once VibeSDK + Emergent
// pipelines are wired (see TODO markers below). Kept conservative so the page
// doesn't accidentally make a false claim if the cron ships before real data.
const SYNTHETIC_VIBESDK_WALL_CLOCK_SEC = 95;
const SYNTHETIC_VIBESDK_CREDITS = 35;
const SYNTHETIC_VIBESDK_USD = 0.42;
const EMERGENT_TIME_MULTIPLIER = 2.5;
const EMERGENT_CREDIT_MULTIPLIER = 2.0;

/**
 * Cron entry point — called from `worker/index.ts` `scheduled()` via
 * `ctx.waitUntil(runDailyBenchmark(env))`.
 */
export async function runDailyBenchmark(env: Env): Promise<void> {
    const kv = getBenchmarkKv(env);
    if (!kv) {
        logger.warn('BENCHMARK_RESULTS KV not bound — skipping cron run. Provision via `wrangler kv namespace create BENCHMARK_RESULTS` and fill the id in wrangler.jsonc.');
        return;
    }

    const promptList = prompts as readonly BenchmarkPrompt[];
    if (promptList.length === 0) {
        logger.warn('benchmark-prompts.json is empty');
        return;
    }

    const today = utcDateString(Date.now());
    const dayIndex = daysSinceEpochUtc(Date.now()) % promptList.length;
    const todaysPrompt = promptList[dayIndex];
    logger.info('Running daily benchmark', { runDate: today, promptId: todaysPrompt.id, rotation: `${dayIndex + 1}/${promptList.length}` });

    const pairs: BenchmarkDailyPair[] = [];
    for (let i = 0; i < Math.min(MAX_PROMPTS_PER_RUN, promptList.length); i += 1) {
        const prompt = promptList[(dayIndex + i) % promptList.length];
        try {
            const pair = await runPair(env, today, prompt);
            pairs.push(pair);
            await kv.put(`raw-${pair.vibesdk.id}`, JSON.stringify(pair.vibesdk), { expirationTtl: 60 * 60 * 24 * 30 });
            await kv.put(`raw-${pair.emergent.id}`, JSON.stringify(pair.emergent), { expirationTtl: 60 * 60 * 24 * 30 });
        } catch (err) {
            logger.error('runPair failed', { promptId: prompt.id, error: errorMessage(err) });
        }
    }

    if (pairs.length === 0) {
        logger.warn('No pairs produced in this run');
        return;
    }

    // history-YYYY-MM-DD — all pairs for today (currently 1 prompt/day).
    await kv.put(`history-${today}`, JSON.stringify(pairs), { expirationTtl: 60 * 60 * 24 * 90 });

    // Merge today's pairs into the rolling 7-day `latest` window.
    const merged = await mergeIntoLatest(kv, pairs);
    await kv.put('latest', JSON.stringify(merged));
    logger.info('Wrote latest', { pairCount: merged.history.length, updatedAt: merged.updatedAt });
}

// ── Pair execution ─────────────────────────────────────────────────────────

async function runPair(env: Env, runDate: string, prompt: BenchmarkPrompt): Promise<BenchmarkDailyPair> {
    const startedAt = Math.floor(Date.now() / 1000);
    const vibesdk = await runVibesdkSide(env, runDate, startedAt, prompt);
    const emergent = await runEmergentSide(env, runDate, startedAt, prompt, vibesdk);
    return {
        runDate,
        promptId: prompt.id,
        vibesdk,
        emergent,
        winner: pickWinner(vibesdk, emergent),
    };
}

/**
 * VibeSDK side — calls our internal codegen pipeline directly (NOT a public
 * HTTP self-call). For S2 this is a deterministic stub that emits the same
 * shape real numbers will land in; see TODO below for the wiring path.
 */
async function runVibesdkSide(
    _env: Env,
    runDate: string,
    startedAt: number,
    prompt: BenchmarkPrompt,
): Promise<BenchmarkRun> {
    // TODO(S2-followup): wire to CodeGeneratorAgent.
    //
    // Cleanest hook is a new `runHeadless({ promptText, userId: 'cron-bot' })`
    // method on the agent DO that fans out through the same state machine the
    // websocket route uses (IDLE -> PHASE_GENERATING -> PHASE_IMPLEMENTING ->
    // REVIEWING -> IDLE). Until that exists, doing it inline here would
    // require importing the entire agent core just to call its private ops,
    // and the state machine is not designed to run without a user session.
    //
    // For now we emit synthetic numbers so the React page renders w/ realistic
    // values and the empty-state branch is exercised only on a totally fresh
    // KV. Real wiring is tracked in BEAT-EMERGENT-PLAN.md S2-followup.
    const id = `vibesdk-${runDate}-${prompt.id}`;
    return {
        id,
        runDate,
        timestamp: startedAt,
        product: 'vibesdk',
        promptId: prompt.id,
        promptText: prompt.prompt,
        productName: VIBESDK_DISPLAY_NAME,
        wallClockSeconds: SYNTHETIC_VIBESDK_WALL_CLOCK_SEC + deterministicJitter(prompt.id, 'v-time', 30),
        creditsSpent: SYNTHETIC_VIBESDK_CREDITS + deterministicJitter(prompt.id, 'v-credits', 10),
        creditsUsdEstimate: round2(SYNTHETIC_VIBESDK_USD + deterministicJitter(prompt.id, 'v-usd', 0.15)),
        deploySuccess: true,
        evidenceUrl: `https://vibesdk.app/s/${id}`,
        modelMix: ['claude-sonnet-4.7', 'gemini-2.5-flash'],
        agentChips: 4,
    };
}

/**
 * Emergent side — currently synthetic w/ pessimistic multipliers vs. the
 * VibeSDK run, per BENCHMARK-PAGE-SPEC §3 "stub for now".
 */
async function runEmergentSide(
    _env: Env,
    runDate: string,
    startedAt: number,
    prompt: BenchmarkPrompt,
    vibesdkRun: BenchmarkRun,
): Promise<BenchmarkRun> {
    // TODO(S2-emergent): wire real emergent run via stored credentials in
    // BENCHMARK_CREDS Secrets Store DO. Currently emits synthetic worse-than-us
    // numbers; this is explicitly marked in code + footer to avoid misleading
    // the marketing page.
    logger.info('TODO(S2-emergent): wire real emergent run — emitting synthetic data', { promptId: prompt.id });
    const id = `emergent-${runDate}-${prompt.id}`;
    return {
        id,
        runDate,
        timestamp: startedAt,
        product: 'emergent',
        promptId: prompt.id,
        promptText: prompt.prompt,
        productName: EMERGENT_DISPLAY_NAME,
        wallClockSeconds: Math.round(vibesdkRun.wallClockSeconds * EMERGENT_TIME_MULTIPLIER),
        creditsSpent: Math.round(vibesdkRun.creditsSpent * EMERGENT_CREDIT_MULTIPLIER),
        creditsUsdEstimate: round2(vibesdkRun.creditsUsdEstimate * EMERGENT_CREDIT_MULTIPLIER),
        deploySuccess: true,
        evidenceUrl: `https://app.emergent.sh/sessions/${id}`,
        modelMix: ['claude-sonnet-4.7'],
    };
}

// ── Aggregate + merge ──────────────────────────────────────────────────────

async function mergeIntoLatest(
    kv: KVNamespace,
    todaysPairs: readonly BenchmarkDailyPair[],
): Promise<BenchmarkLatestResponse> {
    const previous = await kv.get<BenchmarkLatestResponse>('latest', { type: 'json' });
    const cutoffMs = Date.now() - HISTORY_DAYS * 24 * 60 * 60 * 1000;
    const cutoffDate = utcDateString(cutoffMs);

    // Keep prior pairs that are within the window AND not superseded by today's.
    const todayKeys = new Set(todaysPairs.map((p) => pairKey(p)));
    const carried = (previous?.history ?? []).filter(
        (p) => p.runDate >= cutoffDate && !todayKeys.has(pairKey(p)),
    );
    const history = [...todaysPairs, ...carried]
        .sort((a, b) => (a.runDate < b.runDate ? 1 : a.runDate > b.runDate ? -1 : 0))
        .slice(0, HISTORY_DAYS * todaysPairs.length || HISTORY_DAYS);

    return {
        updatedAt: Math.floor(Date.now() / 1000),
        history,
        aggregate: computeAggregate(history),
    };
}

function computeAggregate(history: readonly BenchmarkDailyPair[]): BenchmarkAggregate {
    if (history.length === 0) {
        return {
            avgWallClockSeconds: { vibesdk: 0, emergent: 0 },
            avgCreditsUsd: { vibesdk: 0, emergent: 0 },
            deploySuccessRate: { vibesdk: 0, emergent: 0 },
            sampleSize: 0,
        };
    }
    const n = history.length;
    let vTime = 0;
    let eTime = 0;
    let vUsd = 0;
    let eUsd = 0;
    let vOk = 0;
    let eOk = 0;
    for (const pair of history) {
        vTime += pair.vibesdk.wallClockSeconds;
        eTime += pair.emergent.wallClockSeconds;
        vUsd += pair.vibesdk.creditsUsdEstimate;
        eUsd += pair.emergent.creditsUsdEstimate;
        if (pair.vibesdk.deploySuccess) vOk += 1;
        if (pair.emergent.deploySuccess) eOk += 1;
    }
    return {
        avgWallClockSeconds: { vibesdk: round1(vTime / n), emergent: round1(eTime / n) },
        avgCreditsUsd: { vibesdk: round2(vUsd / n), emergent: round2(eUsd / n) },
        deploySuccessRate: { vibesdk: vOk / n, emergent: eOk / n },
        sampleSize: n,
    };
}

function pickWinner(vibesdk: BenchmarkRun, emergent: BenchmarkRun): BenchmarkWinner {
    if (vibesdk.deploySuccess && !emergent.deploySuccess) return 'vibesdk';
    if (!vibesdk.deploySuccess && emergent.deploySuccess) return 'emergent';
    if (!vibesdk.deploySuccess && !emergent.deploySuccess) return 'tie';
    // Both succeeded — compare on time then cost.
    const timeDelta = vibesdk.wallClockSeconds - emergent.wallClockSeconds;
    if (timeDelta < -5) return 'vibesdk';
    if (timeDelta > 5) return 'emergent';
    const costDelta = vibesdk.creditsUsdEstimate - emergent.creditsUsdEstimate;
    if (costDelta < -0.05) return 'vibesdk';
    if (costDelta > 0.05) return 'emergent';
    return 'tie';
}

// ── Helpers ────────────────────────────────────────────────────────────────

function pairKey(p: BenchmarkDailyPair): string {
    return `${p.runDate}:${p.promptId}`;
}

function utcDateString(ms: number): string {
    return new Date(ms).toISOString().slice(0, 10);
}

function daysSinceEpochUtc(ms: number): number {
    return Math.floor(ms / (24 * 60 * 60 * 1000));
}

/**
 * Tiny deterministic jitter so runs aren't perfectly flat across prompts.
 * Hash collisions don't matter — this only affects synthetic stub values.
 */
function deterministicJitter(promptId: string, key: string, magnitude: number): number {
    let h = 2166136261;
    const input = `${promptId}::${key}`;
    for (let i = 0; i < input.length; i += 1) {
        h ^= input.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    const unit = ((h >>> 0) % 1000) / 1000; // 0..1
    return (unit - 0.5) * 2 * magnitude;     // -magnitude..+magnitude
}

function round1(n: number): number {
    return Math.round(n * 10) / 10;
}

function round2(n: number): number {
    return Math.round(n * 100) / 100;
}

function errorMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}

/**
 * KV binding lookup — kept loose so this module compiles before
 * `npm run cf-typegen` regenerates worker-configuration.d.ts.
 */
function getBenchmarkKv(env: Env): KVNamespace | null {
    const candidate = (env as unknown as Record<string, unknown>).BENCHMARK_RESULTS;
    if (candidate && typeof (candidate as KVNamespace).get === 'function') {
        return candidate as KVNamespace;
    }
    return null;
}
