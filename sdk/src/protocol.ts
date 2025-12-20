// Re-export the platform's public wire types.
//
// IMPORTANT:
// - These are type-only exports.
// - The SDK build bundles declarations so consumers do not need the `worker/` tree.

export type {
	WebSocketMessage,
	WebSocketMessageData,
	CodeFixEdits,
	ModelConfigsInfoMessage,
	AgentDisplayConfig,
	ModelConfigsInfo,
} from '../../worker/api/websocketTypes';

export type { AgentState } from '../../worker/agents/core/state';
export type { BehaviorType, ProjectType } from '../../worker/agents/core/types';
export type { FileOutputType } from '../../worker/agents/schemas';
export type { TemplateDetails } from '../../worker/services/sandbox/sandboxTypes';

export type {
	AgentConnectionData,
	CodeGenArgs as PlatformCodeGenArgs,
	AgentPreviewResponse,
} from '../../worker/api/controllers/agent/types';
