/**
 * generationGuard — static plan-based rate limit for session creation.
 *
 * Runs BEFORE the codegen route mounts a new CodeGeneratorAgent DO, so we fail
 * fast + cheap. Atomic D1 UPDATE...WHERE...RETURNING ensures no TOCTOU even
 * w/ concurrent tabs.
 *
 * Guardrails enforced here (tier-agnostic — applies to everyone):
 *   1. Monthly generation counter (per subscription_tiers.generations_limit)
 *   2. Soft burst cap: max 3 concurrent session starts within 60s per user
 *      (protects against runaway loops during dev)
 *
 * Tier-specific guards (parallel agents, Critic access, etc.) happen later
 * inside TeamLeadCoordinator via `canSpawnParallelAgents` + `canUseCritic`.
 *
 * Razorpay integration is OFF-PATH — this guard is sufficient for local QA
 * and owner's self-hosted usage. Razorpay webhook flips `subscription_tiers.tier`
 * later when billing is turned on.
 */

import { claimGenerationSlot } from '../../services/entitlements/entitlements';
import { createLogger } from '../../logger';

const logger = createLogger('generationGuard');

const BURST_WINDOW_SEC = 60;
const BURST_MAX = 3;

export interface GuardContext {
    readonly env: Env;
    readonly userId: string;
}

export type GuardOutcome =
    | { readonly ok: true; readonly newUsed: number; readonly limit: number }
    | { readonly ok: false; readonly code: 'over-limit' | 'burst-cap' | 'no-subscription'; readonly message: string; readonly used?: number; readonly limit?: number };

/**
 * Ensure the user has a subscription_tiers row (auto-create at Free tier).
 * Separate from the actual counter-increment so we can split the DB round-trips.
 */
async function ensureRow(d1: D1Database, userId: string): Promise<void> {
    await d1
        .prepare(
            `INSERT OR IGNORE INTO subscription_tiers
               (user_id, tier, billing_cycle, generations_limit, generations_used_this_period,
                period_started_at, period_ends_at, active)
             VALUES (?, 'free', 'monthly', 5, 0, strftime('%s','now'), strftime('%s','now','+30 days'), 1)`,
        )
        .bind(userId)
        .run();
}

/**
 * Concurrency burst guard using `agent_budgets` created_at as a cheap
 * sliding-window signal (no separate rate-limit table needed for v1).
 * Returns true if burst cap exceeded.
 */
async function burstCapExceeded(d1: D1Database, userId: string): Promise<boolean> {
    const row = await d1
        .prepare(
            `SELECT COUNT(*) AS n FROM agent_budgets
             WHERE user_id = ? AND created_at > strftime('%s','now','-${BURST_WINDOW_SEC} seconds')`,
        )
        .bind(userId)
        .first<{ n: number }>();
    return (row?.n ?? 0) >= BURST_MAX;
}

/**
 * Main entry — called by the codegen session-start route.
 * Returns OK decision + incremented counter on success, or structured
 * refusal the route can turn into a 402/429 w/ upgrade CTA.
 */
export async function checkGenerationGuard(ctx: GuardContext): Promise<GuardOutcome> {
    const d1 = ctx.env.DB as unknown as D1Database;
    try {
        await ensureRow(d1, ctx.userId);

        if (await burstCapExceeded(d1, ctx.userId)) {
            logger.warn('Burst cap hit', { userId: ctx.userId });
            return {
                ok: false,
                code: 'burst-cap',
                message: `Too many generations started in the last ${BURST_WINDOW_SEC}s (max ${BURST_MAX}). Wait a moment and retry.`,
            };
        }

        const claim = await claimGenerationSlot(d1, ctx.userId);
        if (!claim.decision.allowed) {
            return {
                ok: false,
                code: claim.decision.reason === 'tier-generation-limit' ? 'over-limit' : 'no-subscription',
                message: claim.decision.message ?? 'Generation limit reached.',
                used: claim.newUsed,
                limit: claim.limit,
            };
        }
        return { ok: true, newUsed: claim.newUsed ?? 0, limit: claim.limit ?? 0 };
    } catch (err) {
        logger.error('generationGuard DB error', {
            error: err instanceof Error ? err.message : String(err),
            userId: ctx.userId,
        });
        // Fail-open on DB errors during dev so local QA isn't blocked.
        // Production override: set GENERATION_GUARD_STRICT env var and fail-closed here.
        // Strict mode is an optional env var — read via loose lookup so we
        // don't have to regenerate Cloudflare.Env types for every ops flag.
        const strict = (ctx.env as unknown as Record<string, string | undefined>).GENERATION_GUARD_STRICT;
        if (strict === 'true') {
            return { ok: false, code: 'no-subscription', message: 'Could not verify your plan. Try again.' };
        }
        logger.warn('generationGuard fail-open (dev)', { userId: ctx.userId });
        return { ok: true, newUsed: -1, limit: -1 };
    }
}

/**
 * Compensation — if the downstream session creation throws AFTER we claimed
 * a slot, roll back the counter so the user isn't penalised for our bug.
 * Call this in the catch block of the session-start route.
 */
export async function rollbackGenerationSlot(env: Env, userId: string): Promise<void> {
    const d1 = env.DB as unknown as D1Database;
    try {
        await d1
            .prepare(
                `UPDATE subscription_tiers
                 SET generations_used_this_period = MAX(0, generations_used_this_period - 1),
                     updated_at = strftime('%s','now')
                 WHERE user_id = ?`,
            )
            .bind(userId)
            .run();
    } catch (err) {
        logger.warn('rollbackGenerationSlot failed (non-fatal)', {
            userId,
            error: err instanceof Error ? err.message : String(err),
        });
    }
}
