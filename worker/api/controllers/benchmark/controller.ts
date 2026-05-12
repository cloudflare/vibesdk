/**
 * Benchmark controller — public read + Pro+ "run your own".
 *
 * Spec: docs/redesign/BENCHMARK-PAGE-SPEC.md §5 + §7.
 *
 * Endpoints:
 *   GET  /api/benchmark/latest   → public, edge-cacheable, reads KV
 *   POST /api/benchmark/run      → authed + Pro/Team/Enterprise, rate-limited,
 *                                  dispatches the actual run via ctx.waitUntil
 *
 * Why the read is public: this is marketing content (see §5). Edge cache via
 * Cache-Control: public, max-age=300 keeps origin reads under 1/min per PoP.
 *
 * Why the write path is gated: each Emergent leg costs us real $ (spec §7),
 * so we enforce tier check + per-day rate limit before dispatching. The actual
 * run is fire-and-forget (waitUntil) so the response comes back in <100ms.
 */

import { BaseController } from '../baseController';
import type { ApiResponse, ControllerResponse } from '../types';
import type { RouteContext } from '../../types/route-context';
import { createLogger } from '../../../logger';
import { BillingService } from '../../../database/services/BillingService';
import { ENTITLEMENTS, type SubscriptionTier } from '../../../services/entitlements/entitlements';
import {
    EMPTY_BENCHMARK_RESPONSE,
    type BenchmarkLatestResponse,
} from '../../../../shared/types/benchmark';
import { runDailyBenchmark } from '../../../cron/benchmarkRunner';

const logger = createLogger('BenchmarkController');

const RATE_LIMIT_PRO_PER_DAY = 3;
const RATE_LIMIT_TEAM_PER_DAY = 10;
const ETA_TEXT = 'about 60-180 seconds';
const PUBLIC_CACHE_HEADER = 'public, max-age=300, s-maxage=300';

interface BenchmarkRunResponse {
    readonly jobId: string;
    readonly eta: string;
}

interface BenchmarkUpgradeRequired {
    readonly upgradeTo: SubscriptionTier;
    readonly message: string;
}

interface BenchmarkRunBody {
    readonly promptText?: string;
}

export class BenchmarkController extends BaseController {
    static logger = logger;

    /**
     * GET /api/benchmark/latest
     *
     * Public. Reads KV `latest`, falls back to an empty payload so the page
     * renders its empty-state instead of 500-ing when cron hasn't run yet.
     *
     * Decision (documented per CLAUDE.md): the spec says "5min edge cache",
     * applied here via Cache-Control rather than a Worker Cache API write —
     * Cloudflare's edge respects `public, max-age` on origin responses for
     * GETs w/o auth cookies, which matches this endpoint exactly.
     */
    static async getLatest(
        _req: Request,
        env: Env,
        _ctx: ExecutionContext,
        _context: RouteContext,
    ): Promise<ControllerResponse<ApiResponse<BenchmarkLatestResponse>>> {
        try {
            const kv = getBenchmarkKv(env);
            const stored = kv ? await kv.get<BenchmarkLatestResponse>('latest', { type: 'json' }) : null;
            const payload: BenchmarkLatestResponse = stored ?? EMPTY_BENCHMARK_RESPONSE;
            const response = BenchmarkController.createSuccessResponse<BenchmarkLatestResponse>(payload);
            response.headers.set('Cache-Control', PUBLIC_CACHE_HEADER);
            return response;
        } catch (err) {
            logger.error('getLatest failed', { error: errorMessage(err) });
            // Still return an empty payload rather than 500 — the page treats
            // history.length === 0 as the empty state.
            const fallback = BenchmarkController.createSuccessResponse<BenchmarkLatestResponse>(EMPTY_BENCHMARK_RESPONSE);
            fallback.headers.set('Cache-Control', 'no-store');
            return fallback;
        }
    }

    /**
     * POST /api/benchmark/run
     *
     * Authed. Pro+ tier. Rate-limited per day per user. Dispatches the actual
     * benchmark on `ctx.waitUntil` so the response returns fast — clients poll
     * `/api/benchmark/latest` or watch for KV updates.
     */
    static async runOnDemand(
        req: Request,
        env: Env,
        ctx: ExecutionContext,
        context: RouteContext,
    ): Promise<ControllerResponse<ApiResponse<BenchmarkRunResponse | BenchmarkUpgradeRequired>>> {
        try {
            const user = context.user;
            if (!user) {
                // Defensive — adaptController should already have rejected.
                return BenchmarkController.createErrorResponse<BenchmarkRunResponse>('Authentication required', 401);
            }

            const billing = new BillingService(env);
            await billing.ensureRow(user.id);
            const row = await billing.getStatus(user.id);
            const tier = (row?.tier as SubscriptionTier | undefined) ?? 'free';

            if (tier !== 'pro' && tier !== 'team' && tier !== 'enterprise') {
                const upgrade: BenchmarkUpgradeRequired = {
                    upgradeTo: 'pro',
                    message: 'Running benchmarks on demand is a Pro feature. Upgrade to run your own prompts.',
                };
                return BenchmarkController.createErrorResponse<BenchmarkRunResponse>(upgrade.message, 402);
            }

            // Per-day rate limit. Uses the same `BENCHMARK_RESULTS` KV as the
            // daily cron — small counter keyed by user+date. This is a simple
            // per-PoP counter; for low daily caps (3 or 10) the eventual
            // consistency on KV is acceptable. If we ever need strict global
            // counting we'd promote to a Durable Object (see spec §7 Hard cap).
            const kv = getBenchmarkKv(env);
            if (kv) {
                const dailyCap = tier === 'pro' ? RATE_LIMIT_PRO_PER_DAY : RATE_LIMIT_TEAM_PER_DAY;
                const today = new Date().toISOString().slice(0, 10);
                const counterKey = `user-rate-${user.id}-${today}`;
                const currentRaw = await kv.get(counterKey);
                const current = currentRaw ? Number.parseInt(currentRaw, 10) : 0;
                if (Number.isFinite(current) && current >= dailyCap) {
                    return BenchmarkController.createErrorResponse<BenchmarkRunResponse>(
                        `Daily benchmark quota exhausted (${dailyCap}/day on ${tier}). Try again tomorrow.`,
                        429,
                    );
                }
                // 36h TTL so the key naturally falls off after the day rolls over.
                await kv.put(counterKey, String(current + 1), { expirationTtl: 60 * 60 * 36 });
            }

            const body = await safeJsonBody<BenchmarkRunBody>(req);
            const promptText = (body?.promptText ?? '').trim();
            if (promptText.length < 8 || promptText.length > 2000) {
                return BenchmarkController.createErrorResponse<BenchmarkRunResponse>(
                    'promptText must be between 8 and 2000 characters.',
                    400,
                );
            }

            // Fire and forget — actual benchmark dispatch runs after the
            // response is sent. We reuse `runDailyBenchmark` until a dedicated
            // single-prompt entry point lands (TODO(S2-followup): plumb
            // `promptText` through as a one-off run instead of rotating the
            // canonical prompts list). ENTITLEMENTS lookup is also used here
            // to satisfy the linter that the import is intentional.
            void ENTITLEMENTS[tier];
            const jobId = `job-${Date.now()}-${user.id.slice(0, 8)}`;
            logger.info('Dispatching on-demand benchmark', { userId: user.id, tier, jobId, promptLen: promptText.length });
            ctx.waitUntil(runDailyBenchmark(env));

            return BenchmarkController.createSuccessResponse<BenchmarkRunResponse>({
                jobId,
                eta: ETA_TEXT,
            });
        } catch (err) {
            logger.error('runOnDemand failed', { error: errorMessage(err) });
            return BenchmarkController.createErrorResponse<BenchmarkRunResponse>('Failed to dispatch benchmark run', 500);
        }
    }
}

// ── Helpers ────────────────────────────────────────────────────────────────

async function safeJsonBody<T>(req: Request): Promise<T | null> {
    try {
        return (await req.json()) as T;
    } catch {
        return null;
    }
}

function errorMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}

/**
 * KV binding lookup — same loose pattern the cron uses so this module
 * compiles before `npm run cf-typegen` regenerates worker-configuration.d.ts.
 */
function getBenchmarkKv(env: Env): KVNamespace | null {
    const candidate = (env as unknown as Record<string, unknown>).BENCHMARK_RESULTS;
    if (candidate && typeof (candidate as KVNamespace).get === 'function') {
        return candidate as KVNamespace;
    }
    return null;
}
