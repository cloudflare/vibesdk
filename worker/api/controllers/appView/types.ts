/**
 * Type definitions for AppView Controller responses
 * Following strict DRY principles by reusing existing database types
 */

import { AgentSummary, BehaviorType } from '../../../agents/core/types';
import { PublicAppDetailData } from '../../../database/types';

/**
 * Generated code file structure
 */
export interface GeneratedCodeFile {
    filePath: string;
    fileContents: string;
    explanation?: string;
}

/**
 * Response data for getAppDetails - extends the safe public detail projection.
 * Adds only fields unique to app view response; owner-only fields (userId,
 * deploymentId) are optional and populated only when the viewer owns the app.
 */
export interface AppDetailsData extends PublicAppDetailData {
    cloudflareUrl: string | null;
    previewUrl: string | null;
    behaviorType: BehaviorType | null;
    user: {
        id: string;
        displayName: string;
        avatarUrl: string | null;
    };
    agentSummary: AgentSummary | null;
}

/**
 * Response data for toggleAppStar
 */
export interface AppStarToggleData {
    isStarred: boolean;
    starCount: number;
}

/**
 * Response data for git clone token generation
 */
export interface GitCloneTokenData {
    token: string;
    expiresIn: number;
    expiresAt: string;
    cloneUrl: string;
}

/**
 * Response data for owner-preview token generation. Lets the owner open a
 * private deployed app's URL on a preview subdomain.
 */
export interface PreviewTokenData {
    token: string;
    expiresIn: number;
    expiresAt: string;
    /** Deployment URL with the owner-preview token appended. */
    previewUrl: string;
}

// /**
//  * Response data for forkApp
//  */
// export interface ForkAppData {
//     forkedAppId: string;
//     message: string;
// }