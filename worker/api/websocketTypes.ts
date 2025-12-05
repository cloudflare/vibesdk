import type { CodeReviewOutputType, FileConceptType, FileOutputType } from "../agents/schemas";
import type { CodeGenState } from "../agents/core/state";
import type { ConversationState } from "../agents/inferutils/common";
import type { CodeIssue, RuntimeError, StaticAnalysisResponse, TemplateDetails } from "../services/sandbox/sandboxTypes";
import type { CodeFixResult } from "../services/code-fixer";
import { IssueReport } from "../agents/domain/values/IssueReport";
import type { RateLimitExceededError } from 'shared/types/errors';

type ErrorMessage = {
    type: 'error';
    error: string;
};

type StateMessage = {
	type: 'cf_agent_state';
	state: CodeGenState;
};

type AgentConnectedMessage = {
    type: 'agent_connected';
    state: CodeGenState;
    templateDetails: TemplateDetails;
};

type ConversationStateMessage = {
    type: 'conversation_state';
    state: ConversationState;
    deepDebugSession?: { conversationId: string } | null;
};

type RateLimitErrorMessage = {
	type: 'rate_limit_error';
    error: RateLimitExceededError;
};

type GenerationStartedMessage = {
	type: 'generation_started';
	message: string;
	totalFiles: number;
};

type FileGeneratingMessage = {
	type: 'file_generating';
	filePath: string;
	filePurpose: string;
};

type FileRegeneratingMessage = {
	type: 'file_regenerating';
	filePath: string;
	original_issues?: string;
};

type FileChunkGeneratedMessage = {
	type: 'file_chunk_generated';
	filePath: string;
	chunk: string;
};

type FileGeneratedMessage = {
	type: 'file_generated';
	file: FileOutputType;
};

type FileRegeneratedMessage = {
	type: 'file_regenerated';
	file: FileOutputType;
	original_issues: string;
};

type GenerationCompleteMessage = {
	type: 'generation_complete';
	instanceId?: string;
	previewURL?: string;
};

export type DeploymentStartedMessage = {
	type: 'deployment_started';
	message: string;
	files: { filePath: string }[];
};

export type DeploymentFailedMessage = {
	type: 'deployment_failed';
	error: string;
};

export type DeploymentCompletedMessage = {
	type: 'deployment_completed';
	previewURL: string;
	tunnelURL: string;
	instanceId: string;
	message: string;
};

type PreviewForceRefreshMessage = {
	type: 'preview_force_refresh';
};

type CommandExecutingMessage = {
	type: 'command_executing';
	message: string;
	commands: string[];
};

type CommandExecutedMessage = {
	type: 'command_executed';
	message: string;
	commands: string[];
    output?: string;
};

type CommandExecutionFailedMessage = {
	type: 'command_execution_failed';
	message: string;
	commands: string[];
    error?: string;
};

type CodeReviewingMessage = {
	type: 'code_reviewing';
	message: string;
	staticAnalysis?: StaticAnalysisResponse;
	runtimeErrors: RuntimeError[];
};

type CodeReviewedMessage = {
	type: 'code_reviewed';
	message: string;
	review: CodeReviewOutputType;
};

type RuntimeErrorFoundMessage = {
	type: 'runtime_error_found';
	errors: RuntimeError[];
	count: number;
};

export type CodeFixEdits = {
	type: 'code_fix_edits';
	filePath: string;
	search: string;
	replacement: string;
};

type StaticAnalysisResults = {
    type: 'static_analysis_results';
    staticAnalysis: StaticAnalysisResponse;
}

type PhaseGeneratingMessage = {
	type: 'phase_generating';
	message: string;
	phase?: {
		name: string;
		description: string;
		files: FileConceptType[];
	};
    issues?: IssueReport;
    userSuggestions?: string[];
};

type PhaseGeneratedMessage = {
	type: 'phase_generated';
	message: string;
	phase: {
		name: string;
		description: string;
		files: FileConceptType[];
	};
};

type PhaseImplementingMessage = {
	type: 'phase_implementing';
	message: string;
	phase: {
		name: string;
		description: string;
		files: FileConceptType[];
	};
    issues?: IssueReport;
};

type PhaseImplementedMessage = {
	type: 'phase_implemented';
	message: string;
	phase: {
		name: string;
		description: string;
		files: FileConceptType[];
	};
};

type PhaseValidatingMessage = {
	type: 'phase_validating';
	message: string;
	phase: {
		name: string;
		description: string;
		files: FileConceptType[];
	};
};

type PhaseValidatedMessage = {
	type: 'phase_validated';
	message: string;
	phase: {
		name: string;
		description: string;
		files: FileConceptType[];
	};
};

type GenerationStoppedMessage = {
	type: 'generation_stopped';
	message: string;
	instanceId: string;
};

type GenerationResumedMessage = {
	type: 'generation_resumed';
	message: string;
	instanceId: string;
};

export type CloudflareDeploymentStartedMessage = {
	type: 'cloudflare_deployment_started';
	message: string;
	instanceId: string;
};

export type CloudflareDeploymentCompletedMessage = {
	type: 'cloudflare_deployment_completed';
	message: string;
	instanceId: string;
	deploymentUrl: string;
	workersUrl?: string;
};

export type CloudflareDeploymentErrorMessage = {
	type: 'cloudflare_deployment_error';
	message: string;
	instanceId: string;
	error: string;
};

type ScreenshotCaptureStartedMessage = {
	type: 'screenshot_capture_started';
	message: string;
	url: string;
	viewport: { width: number; height: number };
};

type ScreenshotCaptureSuccessMessage = {
	type: 'screenshot_capture_success';
	message: string;
	url: string;
	viewport: { width: number; height: number };
	screenshotSize: number;
	timestamp: string;
};

type ScreenshotCaptureErrorMessage = {
	type: 'screenshot_capture_error';
	error: string;
	url: string;
	viewport: { width: number; height: number };
	statusCode?: number;
	statusText?: string;
	apiResponse?: unknown;
	screenshotCaptured?: boolean;
	databaseError?: boolean;
	configurationError?: boolean;
};

type ScreenshotAnalysisResultMessage = {
	type: 'screenshot_analysis_result';
	message: string;
	analysis: {
		hasIssues: boolean;
		issues: string[];
		suggestions: string[];
		uiCompliance: {
			matchesBlueprint: boolean;
			deviations: string[];
		};
	};
};

type GitHubExportStartedMessage = {
	type: 'github_export_started';
	message: string;
	repositoryName: string;
	isPrivate: boolean;
};

type GitHubExportProgressMessage = {
	type: 'github_export_progress';
	message: string;
	step: 'creating_repository' | 'uploading_files' | 'finalizing';
	progress: number; // 0-100
};

type GitHubExportCompletedMessage = {
	type: 'github_export_completed';
	message: string;
	repositoryUrl: string;
};

type GitHubExportErrorMessage = {
	type: 'github_export_error';
	message: string;
	error: string;
};

type UserSuggestionsProcessingMessage = {
	type: 'user_suggestions_processing';
	message: string;
	suggestions: string[];
};

type ConversationResponseMessage = {
	type: 'conversation_response';
	message: string;
	conversationId?: string;
	enhancedRequest?: string;
	pendingInputsCount?: number;
	isStreaming?: boolean;
	tool?: {
		name: string;
		status: 'start' | 'success' | 'error';
		args?: Record<string, unknown>;
		result?: string;
	};
};

type ConversationClearedMessage = {
	type: 'conversation_cleared';
	message: string;
	clearedMessageCount: number;
};

type ProjectNameUpdatedMessage = {
	type: 'project_name_updated';
	message: string;
	projectName: string;
};

type BlueprintUpdatedMessage = {
	type: 'blueprint_updated';
	message: string;
	updatedKeys: string[];
};

type BlueprintChunkMessage = {
	type: 'blueprint_chunk';
	chunk: string;
};

type DeterministicCodeFixStartedMessage = {
	type: 'deterministic_code_fix_started';
	message: string;
    issues: CodeIssue[];
};

type DeterministicCodeFixCompletedMessage = {
	type: 'deterministic_code_fix_completed';
	message: string;
    fixResult: CodeFixResult;
    issues: CodeIssue[];
};

export type ModelConfigsInfoMessage = {
	type: 'model_configs_info';
	message: string;
	configs: {
		agents: Array<{
			key: string;
			name: string;
			description: string;
            constraint?: {
                enabled: boolean;
                allowedModels: string[];
            };
		}>;
		userConfigs: Record<string, {
			name?: string;
			max_tokens?: number;
			temperature?: number;
			reasoning_effort?: string;
			fallbackModel?: string;
			isUserOverride?: boolean;
		}>;
		defaultConfigs: Record<string, {
			name?: string;
			max_tokens?: number;
			temperature?: number;
			reasoning_effort?: string;
			fallbackModel?: string;
		}>;
	};
};

export type AgentDisplayConfig = ModelConfigsInfoMessage['configs']['agents'][number];
export type ModelConfigsInfo = ModelConfigsInfoMessage['configs'];

type TerminalCommandMessage = {
	type: 'terminal_command';
	command: string;
	timestamp: number;
};

type TerminalOutputMessage = {
	type: 'terminal_output';
	output: string;
	outputType: 'stdout' | 'stderr' | 'info';
	timestamp: number;
};

type ServerLogMessage = {
	type: 'server_log';
	message: string;
	level: 'info' | 'warn' | 'error' | 'debug';
	timestamp: number;
	source?: string;
};

export type WebSocketMessage =
	| StateMessage
	| AgentConnectedMessage
	| ConversationStateMessage
	| GenerationStartedMessage
	| FileGeneratingMessage
	| FileRegeneratingMessage
	| FileChunkGeneratedMessage
	| FileGeneratedMessage
	| FileRegeneratedMessage
	| GenerationCompleteMessage
	| DeploymentStartedMessage
	| DeploymentCompletedMessage
	| DeploymentFailedMessage
	| PreviewForceRefreshMessage
	| CodeReviewingMessage
	| CodeReviewedMessage
	| CommandExecutingMessage
    | CommandExecutedMessage
    | CommandExecutionFailedMessage
	| RuntimeErrorFoundMessage
	| CodeFixEdits
    | StaticAnalysisResults
	| PhaseGeneratingMessage
	| PhaseGeneratedMessage
	| PhaseImplementingMessage
	| PhaseImplementedMessage
	| PhaseValidatingMessage
	| PhaseValidatedMessage
	| GenerationStoppedMessage
	| GenerationResumedMessage
	| CloudflareDeploymentStartedMessage
	| CloudflareDeploymentCompletedMessage
	| CloudflareDeploymentErrorMessage
	| ScreenshotCaptureStartedMessage
	| ScreenshotCaptureSuccessMessage
	| ScreenshotCaptureErrorMessage
	| ScreenshotAnalysisResultMessage
	| GitHubExportStartedMessage
	| GitHubExportProgressMessage
	| GitHubExportCompletedMessage
	| GitHubExportErrorMessage
	| ErrorMessage
    | RateLimitErrorMessage
	| UserSuggestionsProcessingMessage
	| ConversationResponseMessage
	| ConversationClearedMessage
    | ProjectNameUpdatedMessage
    | BlueprintUpdatedMessage
    | BlueprintChunkMessage
    | DeterministicCodeFixStartedMessage
    | DeterministicCodeFixCompletedMessage
	| ModelConfigsInfoMessage
	| TerminalCommandMessage
	| TerminalOutputMessage
	| ServerLogMessage;

// A type representing all possible message type strings (e.g., 'generation_started', 'file_generating', etc.)
export type WebSocketMessageType = WebSocketMessage['type'];

// A utility type to find the full message object from the union based on its type string.
// e.g., MessagePayload<'phase_generating'> will resolve to PhaseGeneratingMessage
type WebSocketMessagePayload<T extends WebSocketMessageType> = Extract<WebSocketMessage, { type: T }>;

// A utility type to get only the data part of the payload, excluding the 'type' property.
// This is what your 'data' parameter will be.
export type WebSocketMessageData<T extends WebSocketMessageType> = Omit<WebSocketMessagePayload<T>, 'type'>;
