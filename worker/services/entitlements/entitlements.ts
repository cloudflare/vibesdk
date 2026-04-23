/**
 * Entitlements — tier-based feature gating for the multi-agent system.
 *
 * Called by TeamLeadAgent before spawning sub-agents and by the API
 * middleware to reject over-tier requests. Single-writer counter updates
 * use D1 UPDATE ... WHERE ... RETURNING to avoid TOCTOU race (see
 * CRITIQUE.md C4).
 */

export type SubscriptionTier = 'free' | 'pro' | 'team' | 'enterprise';

export type ModelTier =
    | 'haiku'
    | 'sonnet-low'
    | 'sonnet-med'
    | 'sonnet-high'
    | 'opus';

export interface TierEntitlements {
    readonly tier: SubscriptionTier;
    readonly maxGenerationsPerMonth: number;
    readonly maxParallelAgents: 1 | 4 | 8;
    readonly allowedModelTiers: readonly ModelTier[];
    readonly criticEnabled: boolean;
    readonly customDomainDeploy: boolean;
    readonly teamWorkspaces: boolean;
    readonly ssoEnabled: boolean;
    readonly supportSla: 'community' | 'email' | 'priority' | 'dedicated';
}

export const ENTITLEMENTS: Readonly<Record<SubscriptionTier, TierEntitlements>> = {
    free: {
        tier: 'free',
        maxGenerationsPerMonth: 5,
        maxParallelAgents: 1,
        allowedModelTiers: ['haiku', 'sonnet-low'],
        criticEnabled: false,
        customDomainDeploy: false,
        teamWorkspaces: false,
        ssoEnabled: false,
        supportSla: 'community',
    },
    pro: {
        tier: 'pro',
        maxGenerationsPerMonth: 100,
        maxParallelAgents: 4,
        allowedModelTiers: ['haiku', 'sonnet-low', 'sonnet-med', 'sonnet-high'],
        criticEnabled: true,
        customDomainDeploy: true,
        teamWorkspaces: false,
        ssoEnabled: false,
        supportSla: 'email',
    },
    team: {
        tier: 'team',
        maxGenerationsPerMonth: 500,
        maxParallelAgents: 4,
        allowedModelTiers: ['haiku', 'sonnet-low', 'sonnet-med', 'sonnet-high', 'opus'],
        criticEnabled: true,
        customDomainDeploy: true,
        teamWorkspaces: true,
        ssoEnabled: false,
        supportSla: 'priority',
    },
    enterprise: {
        tier: 'enterprise',
        // Token-capped, not unlimited — resolves CRITIQUE C7 (Enterprise margin).
        // Actual token cap is set at contract sign in `subscription_tiers.generations_limit`.
        maxGenerationsPerMonth: Number.MAX_SAFE_INTEGER,
        maxParallelAgents: 8,
        allowedModelTiers: ['haiku', 'sonnet-low', 'sonnet-med', 'sonnet-high', 'opus'],
        criticEnabled: true,
        customDomainDeploy: true,
        teamWorkspaces: true,
        ssoEnabled: true,
        supportSla: 'dedicated',
    },
} as const;

export type EntitlementReason =
    | 'ok'
    | 'tier-generation-limit'
    | 'tier-parallel-agents'
    | 'tier-model-locked'
    | 'tier-critic-locked'
    | 'tier-custom-domain-locked'
    | 'tier-sso-locked';

export interface EntitlementDecision {
    readonly allowed: boolean;
    readonly reason: EntitlementReason;
    readonly upgradeTo?: SubscriptionTier;
    readonly message?: string;
}

const OK: EntitlementDecision = { allowed: true, reason: 'ok' };

/**
 * Check whether a user can spawn N parallel sub-agents.
 * Called by TeamLeadAgent before fan-out.
 */
export function canSpawnParallelAgents(
    tier: SubscriptionTier,
    requested: number,
): EntitlementDecision {
    const ent = ENTITLEMENTS[tier];
    if (requested <= ent.maxParallelAgents) return OK;
    return {
        allowed: false,
        reason: 'tier-parallel-agents',
        upgradeTo: nextTier(tier, 'maxParallelAgents', requested),
        message: `${tier} plan allows ${ent.maxParallelAgents} parallel agents; requested ${requested}.`,
    };
}

export function canUseModelTier(
    tier: SubscriptionTier,
    model: ModelTier,
): EntitlementDecision {
    const ent = ENTITLEMENTS[tier];
    if (ent.allowedModelTiers.includes(model)) return OK;
    return {
        allowed: false,
        reason: 'tier-model-locked',
        upgradeTo: nextTier(tier, 'model', model),
        message: `${model} model is not available on the ${tier} plan.`,
    };
}

export function canUseCritic(tier: SubscriptionTier): EntitlementDecision {
    return ENTITLEMENTS[tier].criticEnabled
        ? OK
        : {
              allowed: false,
              reason: 'tier-critic-locked',
              upgradeTo: 'pro',
              message: 'Plan critic is a Pro feature.',
          };
}

export function canDeployCustomDomain(tier: SubscriptionTier): EntitlementDecision {
    return ENTITLEMENTS[tier].customDomainDeploy
        ? OK
        : { allowed: false, reason: 'tier-custom-domain-locked', upgradeTo: 'pro' };
}

export function canUseSso(tier: SubscriptionTier): EntitlementDecision {
    return ENTITLEMENTS[tier].ssoEnabled
        ? OK
        : { allowed: false, reason: 'tier-sso-locked', upgradeTo: 'enterprise' };
}

/**
 * Atomically increment the generation counter.
 * Uses D1 UPDATE ... WHERE ... RETURNING to avoid TOCTOU.
 * Returns decision + the new counter value on success.
 */
export interface GenerationBudgetClaim {
    readonly decision: EntitlementDecision;
    readonly newUsed?: number;
    readonly limit?: number;
}

export async function claimGenerationSlot(
    db: D1Database,
    userId: string,
): Promise<GenerationBudgetClaim> {
    // Atomic: only increments if used < limit. Returns 0 rows if over limit.
    const row = await db
        .prepare(
            `UPDATE subscription_tiers
             SET generations_used_this_period = generations_used_this_period + 1,
                 updated_at = strftime('%s','now')
             WHERE user_id = ?
               AND active = 1
               AND generations_used_this_period < generations_limit
             RETURNING tier, generations_used_this_period, generations_limit`,
        )
        .bind(userId)
        .first<{
            tier: SubscriptionTier;
            generations_used_this_period: number;
            generations_limit: number;
        }>();

    if (!row) {
        // Either over limit, or no subscription row — fetch reason.
        const current = await db
            .prepare(
                `SELECT tier, generations_used_this_period, generations_limit
                 FROM subscription_tiers WHERE user_id = ? AND active = 1`,
            )
            .bind(userId)
            .first<{
                tier: SubscriptionTier;
                generations_used_this_period: number;
                generations_limit: number;
            }>();

        const currentTier = current?.tier ?? 'free';
        return {
            decision: {
                allowed: false,
                reason: 'tier-generation-limit',
                upgradeTo: currentTier === 'enterprise' ? undefined : nextTier(currentTier, 'generations', 0),
                message: current
                    ? `You've used ${current.generations_used_this_period}/${current.generations_limit} generations this period.`
                    : 'No active subscription found.',
            },
            newUsed: current?.generations_used_this_period,
            limit: current?.generations_limit,
        };
    }

    return {
        decision: OK,
        newUsed: row.generations_used_this_period,
        limit: row.generations_limit,
    };
}

/**
 * Ensure a subscription_tiers row exists for the user (first-session bootstrap).
 * Idempotent: no-op if row present.
 */
export async function ensureSubscriptionRow(
    db: D1Database,
    userId: string,
    tier: SubscriptionTier = 'free',
): Promise<void> {
    const ent = ENTITLEMENTS[tier];
    const limit = tier === 'enterprise' ? 10_000 : ent.maxGenerationsPerMonth;
    await db
        .prepare(
            `INSERT OR IGNORE INTO subscription_tiers
               (user_id, tier, generations_limit, period_ends_at, active)
             VALUES (?, ?, ?, strftime('%s','now','+30 days'), 1)`,
        )
        .bind(userId, tier, limit)
        .run();
}

/**
 * Initialize agent_budgets for a session. Called at session create by TeamLead.
 */
export async function initAgentBudget(
    db: D1Database,
    sessionId: string,
    userId: string,
    tier: SubscriptionTier,
): Promise<void> {
    const ent = ENTITLEMENTS[tier];
    await db
        .prepare(
            `INSERT OR REPLACE INTO agent_budgets
               (session_id, user_id, tier, max_parallel_agents, critic_enabled)
             VALUES (?, ?, ?, ?, ?)`,
        )
        .bind(sessionId, userId, tier, ent.maxParallelAgents, ent.criticEnabled ? 1 : 0)
        .run();
}

/**
 * Best-effort next-tier hint for upgrade CTAs.
 */
function nextTier(
    from: SubscriptionTier,
    _reason: 'maxParallelAgents' | 'model' | 'generations',
    _target: number | string,
): SubscriptionTier {
    if (from === 'free') return 'pro';
    if (from === 'pro') return 'team';
    return 'enterprise';
}
