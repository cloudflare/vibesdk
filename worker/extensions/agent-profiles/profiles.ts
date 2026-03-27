/**
 * Agent Profile Definitions
 *
 * Maps machine types (E-1, E-2, Prototype, Mobile) to concrete agent
 * behavior configurations. Each profile controls model selection,
 * behavior type, token budgets, and template constraints.
 *
 * See docs/GAP_ANALYSIS_AND_IMPLEMENTATION_GUIDE.md Section 5.2 for full spec.
 */

import type { BehaviorType, ProjectType } from '../../agents/core/types';

export interface AgentProfile {
    id: string;
    name: string;
    description: string;
    icon: string;               // Lucide icon name for frontend
    behaviorType: BehaviorType;
    projectType?: ProjectType;
    modelTier: 'standard' | 'premium';
    maxTokenBudget: number;     // max tokens per session
    creditMultiplier: number;   // cost multiplier (1.0 = standard, 2.0 = premium)
    requiresPlan?: string;      // 'pro' | 'enterprise' — null = available on all plans
    templateConstraints?: {
        frontendOnly?: boolean;
        mobileFirst?: boolean;
        templateOverride?: string;
    };
    isBuiltIn: boolean;
    isActive: boolean;
}

/**
 * Built-in agent profiles matching Emergent's machine types.
 * These cannot be deleted but users can create custom profiles.
 */
export const BUILT_IN_PROFILES: AgentProfile[] = [
    {
        id: 'e1-stable',
        name: 'E-1',
        description: 'Stable & thorough',
        icon: 'Shield',
        behaviorType: 'phasic',
        modelTier: 'standard',
        maxTokenBudget: 200_000,
        creditMultiplier: 1.0,
        isBuiltIn: true,
        isActive: true,
    },
    {
        id: 'e2-thorough',
        name: 'E-2',
        description: 'Thorough & Relentless',
        icon: 'Zap',
        behaviorType: 'agentic',
        modelTier: 'premium',
        maxTokenBudget: 500_000,
        creditMultiplier: 2.0,
        requiresPlan: 'pro',
        isBuiltIn: true,
        isActive: true,
    },
    {
        id: 'prototype',
        name: 'Prototype',
        description: 'Frontend Only Apps',
        icon: 'Layout',
        behaviorType: 'phasic',
        projectType: 'app',
        modelTier: 'standard',
        maxTokenBudget: 100_000,
        creditMultiplier: 0.5,
        templateConstraints: {
            frontendOnly: true,
        },
        isBuiltIn: true,
        isActive: true,
    },
    {
        id: 'mobile',
        name: 'Mobile',
        description: 'Agent for mobile apps',
        icon: 'Smartphone',
        behaviorType: 'phasic',
        projectType: 'app',
        modelTier: 'standard',
        maxTokenBudget: 200_000,
        creditMultiplier: 1.0,
        templateConstraints: {
            mobileFirst: true,
        },
        isBuiltIn: true,
        isActive: true,
    },
];

/**
 * Get a profile by ID. Checks built-in first, then user-created (future D1 lookup).
 */
export function getBuiltInProfile(profileId: string): AgentProfile | undefined {
    return BUILT_IN_PROFILES.find(p => p.id === profileId);
}

/**
 * Get the default profile.
 */
export function getDefaultProfile(): AgentProfile {
    return BUILT_IN_PROFILES[0]; // E-1 Stable
}
