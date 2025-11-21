
import type { RuntimeError, StaticAnalysisResponse } from '../../services/sandbox/sandboxTypes';
import type { FileOutputType, PhaseConceptType } from '../schemas';
import type { ConversationMessage } from '../inferutils/common';
import type { InferenceContext } from '../inferutils/config.types';
import type { TemplateDetails } from '../../services/sandbox/sandboxTypes';
import { TemplateSelection } from '../schemas';
import { CurrentDevState, PhasicState, AgenticState } from './state';
import { ProcessedImageAttachment } from 'worker/types/image-attachment';

export type BehaviorType = 'phasic' | 'agentic';

/** Base initialization arguments shared by all agents */
interface BaseAgentInitArgs {
    query: string;
    hostname: string;
    inferenceContext: InferenceContext;
    language?: string;
    frameworks?: string[];
    images?: ProcessedImageAttachment[];
    onBlueprintChunk: (chunk: string) => void;
}

/** Phasic agent initialization arguments */
interface PhasicAgentInitArgs extends BaseAgentInitArgs {
    templateInfo: {
        templateDetails: TemplateDetails;
        selection: TemplateSelection;
    };
}

/** Agentic agent initialization arguments */
interface AgenticAgentInitArgs extends BaseAgentInitArgs {
    templateInfo?: {
        templateDetails: TemplateDetails;
        selection: TemplateSelection;
    };
}

/** Generic initialization arguments based on state type */
export type AgentInitArgs<TState extends PhasicState | AgenticState = PhasicState | AgenticState> = 
    TState extends PhasicState ? PhasicAgentInitArgs : 
    TState extends AgenticState ? AgenticAgentInitArgs : 
    PhasicAgentInitArgs | AgenticAgentInitArgs;

export type Plan = string;

export interface AllIssues {
    runtimeErrors: RuntimeError[];
    staticAnalysis: StaticAnalysisResponse;
}

/**
 * Agent state definition for code generation
 */
export interface ScreenshotData {
    url: string;
    timestamp: number;
    viewport: { width: number; height: number };
    userAgent?: string;
    screenshot?: string; // Base64 data URL from Cloudflare Browser Rendering REST API
}

export interface AgentSummary {
    query: string;
    generatedCode: FileOutputType[];
    conversation: ConversationMessage[];
}

export interface UserContext {
    suggestions?: string[];
    images?: ProcessedImageAttachment[];  // Image URLs
}

export interface PhaseExecutionResult {
    currentDevState: CurrentDevState;
    staticAnalysis?: StaticAnalysisResponse;
    result?: PhaseConceptType;
    userSuggestions?: string[];
    userContext?: UserContext;
}

/**
 * Result type for deep debug operations
 */
export type DeepDebugResult = 
    | { success: true; transcript: string }
    | { success: false; error: string };