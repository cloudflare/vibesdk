/**
 * effortEstimator — per-phase credit cost preview.
 *
 * Wraps `estimateGenerationCredits` (modelRouter) to produce a min/max
 * credit range for a single phase before execution starts.  The range
 * accounts for:
 *   - file count in the phase (drives coder invocations)
 *   - subscription tier ceiling (free vs pro/team)
 *   - whether the critic pass is enabled (flag-gated today, always false)
 *
 * Callers should treat these as *estimates*; actual spend depends on
 * token counts from the live inference calls.
 */

import { estimateGenerationCredits } from '../../agents/inferutils/modelRouter';
import type { SubscriptionTier } from '../entitlements/entitlements';

export interface PhaseEffortEstimate {
    /** Optimistic lower bound (free tier, min coders). */
    readonly creditsMin: number;
    /** Pessimistic upper bound (pro tier with critic, max coders). */
    readonly creditsMax: number;
    /** Number of files in this phase (drives coder count). */
    readonly fileCount: number;
    /** Human-readable label for the active model tier. */
    readonly modelTier: 'lite' | 'regular' | 'reasoning' | 'premium';
}

/**
 * Parallel coders saturate at 4 — this is the max for a single phase.
 * A phase with 8 files → 2 files per coder → still 4 coders.
 */
const MAX_PARALLEL_CODERS = 4;

/**
 * Estimate the credit cost range for a single phase.
 *
 * @param fileCount  Number of files the phase is expected to write/modify.
 * @param tier       Subscription tier of the user (affects model selection).
 * @param enableCritic  Whether the critic sub-agent is enabled (tier-gated).
 */
export function estimatePhaseCredits(
    fileCount: number,
    tier: SubscriptionTier,
    enableCritic: boolean = false,
): PhaseEffortEstimate {
    const numCoders = Math.min(MAX_PARALLEL_CODERS, Math.max(1, fileCount));
    const filesPerCoder = Math.ceil(fileCount / numCoders);

    // Lower bound: free tier (cheapest models), no critic.
    const creditsMin = estimateGenerationCredits('free', numCoders, filesPerCoder, false);

    // Upper bound: pro tier (may unlock Pro/Premium models), critic if enabled.
    const creditsMax = estimateGenerationCredits(
        tier === 'free' ? 'free' : 'pro',
        numCoders,
        filesPerCoder,
        enableCritic,
    );

    const modelTier: PhaseEffortEstimate['modelTier'] =
        tier === 'free' ? 'reasoning' : 'premium';

    return {
        creditsMin: Math.round(creditsMin * 10) / 10,
        creditsMax: Math.round(creditsMax * 10) / 10,
        fileCount,
        modelTier,
    };
}
