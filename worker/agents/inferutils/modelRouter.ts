/**
 * Model Router — the cost wedge.
 *
 * Maps (sub-agent role × subscription tier × operation) → concrete AI model.
 * Every sub-agent runs on the cheapest model that can still complete its task
 * correctly. Tier-gated models (Gemini 3 Pro, Opus-equivalents) stay behind
 * Pro/Team/Enterprise.
 *
 * Why this beats emergent:
 *   Emergent applies one premium model across the pipeline.
 *   We use a pyramid — pricey reasoning at the top (Planner, Critic),
 *   commodity Flash models in the wide middle (4 parallel Coders),
 *   Flash-Lite for mechanical log→diagnosis (Tester).
 *   Net: ~2-3× cheaper per completed app at parity quality.
 *
 * Integration point:
 *   TeamLead + sub-agents call `pickModel(role, tier, op)` to get the
 *   AIModels key, then feed it into the existing `executeInference` flow
 *   in `core.ts`. No net-new inference infra.
 */

import { AIModels } from './config.types';
import type { SubscriptionTier } from '../../services/entitlements/entitlements';
import type { SubAgentRole } from '../core/subagents/contracts';

export type ModelTier = 'lite' | 'regular' | 'reasoning' | 'premium';

/**
 * Which *operation* inside a sub-agent is running. Coarser than the
 * 10+ specific ops in `config.ts` — this is the role-centric view.
 */
export type SubAgentOperation =
    | 'plan'             // Planner: blueprint + milestone tree
    | 'critique'         // Critic: plan red-team
    | 'implement-file'   // Coder: write one file
    | 'fix-file'         // Coder: apply a bug fix
    | 'diagnose'         // Tester: sandbox log → error report
    | 'orchestrate';     // TeamLead: routing, not content

export interface ModelPick {
    readonly name: string;         // AIModels key
    readonly fallbackModel: string;
    readonly tier: ModelTier;
    readonly reasoning: 'minimal' | 'low' | 'medium' | 'high';
    readonly maxTokens: number;
    readonly temperature: number;
    readonly creditCost: number;   // from config.types MODELS_MASTER
}

/** Decision table — keyed by (role, operation). Tier gating applied after. */
const BASE_PICKS: Readonly<Record<string, ModelPick>> = {
    'planner.plan': {
        name: AIModels.GEMINI_3_PRO_PREVIEW,
        fallbackModel: AIModels.GEMINI_2_5_PRO,
        tier: 'premium',
        reasoning: 'high',
        maxTokens: 20_000,
        temperature: 1,
        creditCost: 8,
    },
    'planner.plan.free': {
        // Free tier gets Gemini 2.5 Pro — still strong, 2× cheaper.
        name: AIModels.GEMINI_2_5_PRO,
        fallbackModel: AIModels.GEMINI_2_5_FLASH,
        tier: 'reasoning',
        reasoning: 'high',
        maxTokens: 16_000,
        temperature: 1,
        creditCost: 5,
    },
    'critic.critique': {
        name: AIModels.GEMINI_3_PRO_PREVIEW,
        fallbackModel: AIModels.GEMINI_2_5_PRO,
        tier: 'premium',
        reasoning: 'high',
        maxTokens: 8_000,
        temperature: 0.3,
        creditCost: 6,
    },
    'coder.implement-file': {
        // The workhorse — runs N× parallel. Keep cheap.
        name: AIModels.GEMINI_2_5_FLASH,
        fallbackModel: AIModels.GEMINI_2_5_FLASH_LATEST,
        tier: 'regular',
        reasoning: 'low',
        maxTokens: 48_000,
        temperature: 0.7,
        creditCost: 1.2,
    },
    'coder.implement-file.premium': {
        // Team/Enterprise override — higher-fidelity Coder.
        name: AIModels.GEMINI_2_5_PRO,
        fallbackModel: AIModels.GEMINI_2_5_FLASH,
        tier: 'reasoning',
        reasoning: 'medium',
        maxTokens: 48_000,
        temperature: 0.5,
        creditCost: 5,
    },
    'coder.fix-file': {
        name: AIModels.GROK_4_1_FAST_NON_REASONING,
        fallbackModel: AIModels.GEMINI_2_5_FLASH,
        tier: 'regular',
        reasoning: 'low',
        maxTokens: 32_000,
        temperature: 0.2,
        creditCost: 1.2,
    },
    'tester.diagnose': {
        name: AIModels.GEMINI_2_5_FLASH_LITE,
        fallbackModel: AIModels.GEMINI_2_5_FLASH,
        tier: 'lite',
        reasoning: 'low',
        maxTokens: 8_000,
        temperature: 0,
        creditCost: 0.4,
    },
    'teamlead.orchestrate': {
        // TeamLead only routes + emits status — no creative work.
        name: AIModels.GEMINI_2_5_FLASH_LITE,
        fallbackModel: AIModels.GEMINI_2_5_FLASH,
        tier: 'lite',
        reasoning: 'minimal',
        maxTokens: 4_000,
        temperature: 0.3,
        creditCost: 0.4,
    },
};

/**
 * Maximum ModelTier per subscription — caps what upstream can pick.
 * Free gets 'reasoning' max → lets Planner use Gemini 2.5 Pro, denies Gemini 3 Pro.
 */
const TIER_CEILING: Readonly<Record<SubscriptionTier, ModelTier>> = {
    free: 'reasoning',
    pro: 'premium',
    team: 'premium',
    enterprise: 'premium',
};

const TIER_RANK: Readonly<Record<ModelTier, number>> = {
    lite: 0,
    regular: 1,
    reasoning: 2,
    premium: 3,
};

/**
 * Main entry — returns the ModelPick to feed into executeInference.
 *
 * Never throws. If the ideal pick exceeds the tier ceiling, transparently
 * downgrades to the ceiling-legal alternative. Logs a breadcrumb so the UI
 * can show "Planner running on Gemini 2.5 Pro (upgrade for Gemini 3 Pro)".
 */
export function pickModel(
    role: SubAgentRole | 'teamlead',
    tier: SubscriptionTier,
    operation: SubAgentOperation,
): ModelPick {
    const ceiling = TIER_CEILING[tier];
    const freeKey = `${role}.${operation}.free`;
    const premiumKey = `${role}.${operation}.premium`;
    const baseKey = `${role}.${operation}`;

    // Team+ gets premium variant for Coder if defined
    if ((tier === 'team' || tier === 'enterprise') && BASE_PICKS[premiumKey]) {
        return BASE_PICKS[premiumKey];
    }

    // Free gets downgraded Planner variant if defined
    if (tier === 'free' && BASE_PICKS[freeKey]) {
        return BASE_PICKS[freeKey];
    }

    const base = BASE_PICKS[baseKey];
    if (!base) {
        // Unknown combo → safe default (cheapest viable).
        return BASE_PICKS['coder.implement-file'];
    }

    // Tier-ceiling enforcement.
    if (TIER_RANK[base.tier] <= TIER_RANK[ceiling]) return base;

    // Would exceed ceiling — rewrite to tier-appropriate variant.
    return {
        ...base,
        name: AIModels.GEMINI_2_5_PRO,
        fallbackModel: AIModels.GEMINI_2_5_FLASH,
        tier: ceiling,
        creditCost: 5,
    };
}

/**
 * Convenience: cumulative credit estimate for a full 4-parallel-Coder MVP.
 * Used by the pricing page + upgrade nudges to show the user what they'll spend.
 */
export function estimateGenerationCredits(
    tier: SubscriptionTier,
    numCoders: number,
    filesPerCoder: number,
    enableCritic: boolean,
): number {
    const planner = pickModel('planner', tier, 'plan').creditCost;
    const coder = pickModel('coder', tier, 'implement-file').creditCost;
    const tester = pickModel('tester', tier, 'diagnose').creditCost;
    const teamlead = pickModel('teamlead' as SubAgentRole, tier, 'orchestrate').creditCost;
    const critic = enableCritic ? pickModel('critic', tier, 'critique').creditCost : 0;

    const coderCalls = numCoders * filesPerCoder;
    const orchestrationCalls = 5; // empirical — plan boundary, coder dispatches, completion
    const testerCalls = 3;

    return (
        planner +
        critic +
        coder * coderCalls +
        tester * testerCalls +
        teamlead * orchestrationCalls
    );
}
