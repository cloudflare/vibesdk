import type {
	BehaviorType as PlatformBehaviorType,
	ProjectType as PlatformProjectType,
	PlatformCodeGenArgs,
	WebSocketMessage,
	ImageAttachment as PlatformImageAttachment,
	AgentState as PlatformAgentState,
	App as PlatformApp,
	Visibility,
	PlatformAppWithFavoriteStatus,
	PlatformEnhancedAppData,
	FavoriteToggleResult,
	PaginationInfo,
	PublicAppQueryOptions,
	PlatformAppWithUserAndStats,
	PlatformUpdateAppVisibilityData,
	AppDeleteData,
	PlatformAppDetailsData,
	AppStarToggleData,
	GitCloneTokenData,
	BaseApiResponse,
	FileConceptType as PlatformFileConceptType,
	PhaseConceptType as PlatformPhaseConceptType,
} from './protocol';
import type { RetryConfig } from './retry';
export type { RetryConfig } from './retry';

// ============================================================================
// Serialization Utility
// ============================================================================

/**
 * Recursively converts Date fields to string for JSON-serialized API responses.
 * When data is sent over HTTP/JSON, Date objects become ISO strings.
 */
type Serialized<T> = T extends Date
	? string
	: T extends Date | null
		? string | null
		: T extends (infer U)[]
			? Serialized<U>[]
			: T extends object
				? { [K in keyof T]: Serialized<T[K]> }
				: T;

// ============================================================================
// Agent/Build Types
// ============================================================================

export type BehaviorType = PlatformBehaviorType;
export type ProjectType = PlatformProjectType;
export type ImageAttachment = PlatformImageAttachment;
export type AgentState = PlatformAgentState;

export type Credentials = NonNullable<PlatformCodeGenArgs['credentials']>;
export type CodeGenArgs = PlatformCodeGenArgs;

export type BuildOptions = Omit<CodeGenArgs, 'query'> & {
	autoConnect?: boolean;
	autoGenerate?: boolean;
	onBlueprintChunk?: (chunk: string) => void;
};

export type TemplateFiles = Record<string, string>;

export type BuildStartEvent = {
	message?: string;
	agentId: string;
	websocketUrl: string;
	httpStatusUrl?: string;
	behaviorType?: BehaviorType;
	projectType?: string;
	template?: { name: string; files?: TemplateFiles };
};

// ============================================================================
// API Response Types
// ============================================================================

export type ApiResponse<T> = BaseApiResponse<T>;

/** Pagination info for list endpoints */
export type { PaginationInfo };

// ============================================================================
// App Types (serialized versions of platform types)
// ============================================================================

/** Base App type with all fields (serialized for JSON) */
export type App = Serialized<PlatformApp>;

/** App visibility setting */
export type AppVisibility = Visibility;

/** App with favorite status for user-specific queries */
export type AppWithFavoriteStatus = Serialized<PlatformAppWithFavoriteStatus>;

/** Enhanced app data with user info and social stats */
export type EnhancedAppData = Serialized<PlatformEnhancedAppData>;

/** App item for public listings (with user and stats) - alias for cleaner SDK API */
export type AppListItem = Serialized<PlatformAppWithUserAndStats>;

/** Full app details response - alias for cleaner SDK API */
export type AppDetails = Serialized<PlatformAppDetailsData>;

// ============================================================================
// App API Response Types
// ============================================================================

/** Query parameters for public apps listing */
export type PublicAppsQuery = Partial<PublicAppQueryOptions>;

/** Response for visibility update endpoint */
export type VisibilityUpdateResult = Serialized<PlatformUpdateAppVisibilityData>;

/** Response for delete endpoint - alias for cleaner SDK API */
export type DeleteResult = AppDeleteData;

/** Response for star toggle endpoint */
export type { AppStarToggleData };

/** Response for favorite toggle endpoint */
export type { FavoriteToggleResult };

/** Union type for toggle operations (star or favorite) */
export type ToggleResult = AppStarToggleData | FavoriteToggleResult;

/** Response for git clone token endpoint */
export type { GitCloneTokenData };

// ============================================================================
// WebSocket Types
// ============================================================================

export type AgentWsServerMessage = WebSocketMessage;

export type AgentWsClientMessage =
	| { type: 'session_init'; credentials: Credentials }
	| { type: 'generate_all' }
	| { type: 'stop_generation' }
	| { type: 'resume_generation' }
	| { type: 'preview' }
	| { type: 'deploy' }
	| { type: 'get_conversation_state' }
	| { type: 'clear_conversation' }
	| { type: 'user_suggestion'; message: string; images?: ImageAttachment[] };

export type AgentWebSocketMessage = AgentWsServerMessage | AgentWsClientMessage;

export type WsMessageOf<TType extends AgentWsServerMessage['type']> = Extract<
	AgentWsServerMessage,
	{ type: TType }
>;

export type AgentEventMap = {
	'ws:open': undefined;
	'ws:close': { code: number; reason: string };
	'ws:error': { error: unknown };
	'ws:reconnecting': { attempt: number; delayMs: number; reason: 'close' | 'error' };
	'ws:raw': { raw: unknown };
	'ws:message': AgentWsServerMessage;

	connected: WsMessageOf<'agent_connected'>;
	conversation: WsMessageOf<'conversation_response' | 'conversation_state'>;
	phase: WsMessageOf<
		| 'phase_generating'
		| 'phase_generated'
		| 'phase_implementing'
		| 'phase_implemented'
		| 'phase_validating'
		| 'phase_validated'
	>;
	file: WsMessageOf<
		| 'file_chunk_generated'
		| 'file_generated'
		| 'file_generating'
		| 'file_regenerating'
		| 'file_regenerated'
	>;
	generation: WsMessageOf<'generation_started' | 'generation_complete' | 'generation_stopped' | 'generation_resumed'>;
	preview: WsMessageOf<'deployment_completed' | 'deployment_started' | 'deployment_failed'>;
	cloudflare: WsMessageOf<
		| 'cloudflare_deployment_started'
		| 'cloudflare_deployment_completed'
		| 'cloudflare_deployment_error'
	>;
	error: { error: string };

	/** Emitted when the phase timeline changes (phase added or updated). */
	phases: PhaseTimelineEvent;
};

// ============================================================================
// Connection Types
// ============================================================================

/**
 * URL provider for WebSocket connections.
 * Called on initial connect and on each reconnect to get fresh ticket.
 */
export type UrlProvider = () => Promise<string>;

/**
 * Options for WebSocket connection behavior.
 */
export type AgentConnectionOptions = {
	/** Credentials to send via session_init after connection. */
	credentials?: Credentials;
	/** Auto-reconnect config (enabled by default). */
	retry?: RetryConfig;
};

export type AgentConnection = {
	send: (msg: AgentWsClientMessage) => void;
	close: () => void;
	on: <K extends keyof AgentEventMap>(event: K, cb: (payload: AgentEventMap[K]) => void) => () => void;
	onAny: (cb: (event: keyof AgentEventMap, payload: AgentEventMap[keyof AgentEventMap]) => void) => () => void;
	waitFor: <K extends keyof AgentEventMap>(
		event: K,
		predicate?: (payload: AgentEventMap[K]) => boolean,
		timeoutMs?: number
	) => Promise<AgentEventMap[K]>;
};

// ============================================================================
// Session Types
// ============================================================================

export type FileTreeNode =
	| { type: 'dir'; name: string; path: string; children: FileTreeNode[] }
	| { type: 'file'; name: string; path: string };

export type SessionFiles = {
	listPaths: () => string[];
	read: (path: string) => string | null;
	snapshot: () => Record<string, string>;
	tree: () => FileTreeNode[];
};

export type WaitOptions = {
	timeoutMs?: number;
};

export type PhaseEventType =
	| 'phase_generating'
	| 'phase_generated'
	| 'phase_implementing'
	| 'phase_implemented'
	| 'phase_validating'
	| 'phase_validated';

export type WaitForPhaseOptions = WaitOptions & {
	type: PhaseEventType;
};

// ============================================================================
// Phase Timeline Types
// ============================================================================
// These types extend the platform's PhaseConceptType and FileConceptType
// with SDK-specific fields for tracking generation status in the UI.

/**
 * Status of a file within a phase.
 */
export type PhaseFileStatus = 'pending' | 'generating' | 'completed' | 'cancelled';

/**
 * A file concept within a phase, with its generation status.
 * Extends platform's FileConceptType with status tracking.
 */
export type PhaseFile = Pick<PlatformFileConceptType, 'path' | 'purpose'> & {
	status: PhaseFileStatus;
};

/**
 * Status of a phase in the timeline.
 */
export type PhaseStatus = 'pending' | 'generating' | 'implementing' | 'validating' | 'completed' | 'cancelled';

/**
 * A phase in the build timeline with its files and status.
 * Extends platform's PhaseConceptType with SDK-specific fields.
 */
export type PhaseInfo = Pick<PlatformPhaseConceptType, 'name' | 'description'> & {
	/** Unique identifier for this phase (e.g., "phase-0", "phase-1"). */
	id: string;
	/** Current status of the phase. */
	status: PhaseStatus;
	/** Files in this phase with their generation status. */
	files: PhaseFile[];
};

/**
 * High-level API for accessing phase timeline data.
 */
export type SessionPhases = {
	/** Get all phases in the timeline. */
	list: () => PhaseInfo[];
	/** Get the currently active phase (first non-completed phase), or undefined. */
	current: () => PhaseInfo | undefined;
	/** Get all completed phases. */
	completed: () => PhaseInfo[];
	/** Get a phase by its id (e.g., "phase-0"). */
	get: (id: string) => PhaseInfo | undefined;
	/** Get the total count of phases. */
	count: () => number;
	/** Check if all phases are completed. */
	allCompleted: () => boolean;
};

/**
 * Event emitted when the phase timeline changes.
 */
export type PhaseTimelineChangeType = 'added' | 'updated';

export type PhaseTimelineEvent = {
	/** Type of change: 'added' for new phase, 'updated' for status/file changes. */
	type: PhaseTimelineChangeType;
	/** The phase that was added or updated. */
	phase: PhaseInfo;
	/** All phases in the timeline after this change. */
	allPhases: PhaseInfo[];
};

export type SessionDeployable = {
	files: number;
	reason: 'generation_complete' | 'phase_validated';
	previewUrl?: string;
};

// ============================================================================
// Client Options
// ============================================================================

export type VibeClientOptions = {
	baseUrl: string;
	/** JWT access token (or will be minted from apiKey). */
	token?: string;
	/** VibeSDK API key. */
	apiKey?: string;
	/** Default headers for HTTP requests. */
	defaultHeaders?: Record<string, string>;
	/** Custom fetch function (for Workers or custom environments). */
	fetchFn?: typeof fetch;
	/** HTTP retry config for transient failures. */
	retry?: RetryConfig;
};
