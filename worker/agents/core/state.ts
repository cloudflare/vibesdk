import type { Blueprint, PhaseConceptType ,
    FileOutputType,
} from '../schemas';
// import type { ScreenshotData } from './types';
import type { ConversationMessage } from '../inferutils/common';
import type { InferenceContext } from '../inferutils/config.types';

export interface FileState extends FileOutputType {
    lastDiff: string;
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

export const MAX_PHASES = 12;

export interface CodeGenState {
    blueprint: Blueprint;
    projectName: string,
    query: string;
    generatedFilesMap: Record<string, FileState>;
    generatedPhases: PhaseState[];
    commandsHistory?: string[]; // History of commands run
    lastPackageJson?: string; // Last package.json file contents
    templateName: string;
    sandboxInstanceId?: string;
    
    shouldBeGenerating: boolean; // Persistent flag indicating generation should be active
    mvpGenerated: boolean;
    reviewingInitiated: boolean;
    agentMode: 'deterministic' | 'smart';
    sessionId: string;
    hostname: string;
    phasesCounter: number;

    pendingUserInputs: string[];
    currentDevState: CurrentDevState;
    reviewCycles?: number; // Number of review cycles for code review phase
    currentPhase?: PhaseConceptType; // Current phase being worked on
    
    conversationMessages: ConversationMessage[];
    projectUpdatesAccumulator: string[];
    inferenceContext: InferenceContext;

    lastDeepDebugTranscript: string | null;
} 
