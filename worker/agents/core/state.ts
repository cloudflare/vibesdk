import type { PhasicBlueprint, AgenticBlueprint, PhaseConceptType ,
    FileOutputType,
    Blueprint,
} from '../schemas';
import type { InferenceMetadata } from '../inferutils/config.types';
import { BehaviorType, Plan, ProjectType } from './types';

export interface FileState extends FileOutputType {
    lastDiff: string;
}

export interface FileServingToken {
    token: string;
    createdAt: number;
}

export interface PhaseState extends PhaseConceptType {
    // deploymentNeeded: boolean;
    completed: boolean;
}

export enum CurrentDevState {
    IDLE,
    PHASE_GENERATING,
    PHASE_IMPLEMENTING,
    REVIEWING,
    FINALIZING,
}

export const MAX_PHASES = 10;

/** Common state fields for all agent behaviors */
export interface BaseProjectState {
    behaviorType: BehaviorType;
    projectType: ProjectType;
    
    // Identity
    projectName: string;
    query: string;
    sessionId: string;
    hostname: string;

    blueprint: Blueprint;

    templateName: string | 'custom';
    
    // Inference context
    readonly metadata: InferenceMetadata;
    
    // Generation control
    shouldBeGenerating: boolean;
    
    // Common file storage
    generatedFilesMap: Record<string, FileState>;
    
    // Common infrastructure
    sandboxInstanceId?: string;
    fileServingToken?: FileServingToken;
    commandsHistory?: string[];
    lastPackageJson?: string;
    pendingUserInputs: string[];
    projectUpdatesAccumulator: string[];
    
    // Deep debug
    lastDeepDebugTranscript: string | null;

    mvpGenerated: boolean;
    reviewingInitiated: boolean;
    cloudflareToken?: string; // Encrypted Cloudflare OAuth token blob (backend decrypts when needed)
    wsOrigin?: string; // Origin captured at WS upgrade time for token refresh
}

/** Phasic agent state */
export interface PhasicState extends BaseProjectState {
    behaviorType: 'phasic';
    blueprint: PhasicBlueprint;
    generatedPhases: PhaseState[];
    
    phasesCounter: number;
    currentDevState: CurrentDevState;
    reviewCycles?: number;
    currentPhase?: PhaseConceptType;
}

export interface WorkflowMetadata {
    name: string;
    description: string;
    params: Record<string, {
        type: 'string' | 'number' | 'boolean' | 'object';
        description: string;
        example?: unknown;
        required: boolean;
    }>;
    bindings?: {
        envVars?: Record<string, {
            type: 'string';
            description: string;
            default?: string;
            required?: boolean;
        }>;
        secrets?: Record<string, {
            type: 'secret';
            description: string;
            required?: boolean;
        }>;
        resources?: Record<string, {
            type: 'kv' | 'r2' | 'd1' | 'queue' | 'ai';
            description: string;
            required?: boolean;
        }>;
    };
}

/** Agentic agent state */
export interface AgenticState extends BaseProjectState {
    behaviorType: 'agentic';
    blueprint: AgenticBlueprint;
    currentPlan: Plan;
}

/**
 * Opencode agent state — backed by `@opencode-do/opencode` SessionDO/SpaceDO.
 *
 * Files are *not* mirrored into `generatedFilesMap`; they live in the
 * companion `SpaceDO` workspace and are read on demand via RPC. The map is
 * kept for shape compatibility and used as a small in-memory cache.
 */
export interface OpencodeState extends BaseProjectState {
    behaviorType: 'opencode';
    blueprint: AgenticBlueprint;
    /** Opencode session id (`ses_…`) created in SessionDO. */
    opencodeSessionId: string;
    /** SpaceDO `idFromName` key — defaults to the agent id. */
    spaceName: string;
    /** Git branch used for deployment previews. */
    currentBranch: string;
    /** Last commit SHA we successfully deployed. */
    lastDeployedCommit?: string;
}

export type AgentState = PhasicState | AgenticState | OpencodeState;
