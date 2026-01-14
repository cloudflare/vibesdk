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
export type { FileOutputType, FileConceptType, PhaseConceptType } from '../../worker/agents/schemas';
export type { TemplateDetails } from '../../worker/services/sandbox/sandboxTypes';

export type {
	AgentConnectionData,
	CodeGenArgs as PlatformCodeGenArgs,
	AgentPreviewResponse,
} from '../../worker/api/controllers/agent/types';

export type { ImageAttachment } from '../../worker/types/image-attachment';

// App schema type
export type { App } from '../../worker/database/schema';

// Database types
export type {
	Visibility,
	AppWithFavoriteStatus as PlatformAppWithFavoriteStatus,
	EnhancedAppData as PlatformEnhancedAppData,
	FavoriteToggleResult,
	PaginationInfo,
	PublicAppQueryOptions,
} from '../../worker/database/types';

// Apps controller response types
export type {
	AppWithUserAndStats as PlatformAppWithUserAndStats,
	AppsListData as PlatformAppsListData,
	PublicAppsData as PlatformPublicAppsData,
	UpdateAppVisibilityData as PlatformUpdateAppVisibilityData,
	AppDeleteData,
} from '../../worker/api/controllers/apps/types';

// AppView controller response types
export type {
	AppDetailsData as PlatformAppDetailsData,
	AppStarToggleData,
	GitCloneTokenData,
} from '../../worker/api/controllers/appView/types';

// API response wrapper
export type { BaseApiResponse } from '../../worker/api/responses';
