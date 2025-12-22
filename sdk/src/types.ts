import type {
	BehaviorType as PlatformBehaviorType,
	ProjectType as PlatformProjectType,
	PlatformCodeGenArgs,
	WebSocketMessage,
} from './protocol';
import type { RetryConfig } from './retry';
export type { RetryConfig } from './retry';

export type BehaviorType = PlatformBehaviorType;
export type ProjectType = PlatformProjectType;

// Ephemeral, optional credentials (not persisted by SDK).
export type Credentials = NonNullable<PlatformCodeGenArgs['credentials']>;

export type CodeGenArgs = PlatformCodeGenArgs;

export type BuildOptions = Omit<CodeGenArgs, 'query'> & {
	/**
	 * If true (default), connect to the agent websocket immediately.
	 */
	autoConnect?: boolean;
	/**
	 * If true (default), send `{ type: 'generate_all' }` after websocket connection.
	 */
	autoGenerate?: boolean;
	/**
	 * Called for each blueprint chunk emitted by the create-agent stream.
	 */
	onBlueprintChunk?: (chunk: string) => void;
};

export type BuildStartEvent = {
	message?: string;
	agentId: string;
	websocketUrl: string;
	httpStatusUrl?: string;
	behaviorType?: BehaviorType;
	projectType?: string;
	template?: { name: string; files?: unknown };
};

export type ApiResponse<T> =
	| { success: true; data: T; message?: string }
	| { success: false; error: { message: string }; message?: string };

export type PublicAppsQuery = {
	limit?: number;
	page?: number;
	sort?: string;
	order?: string;
	period?: string;
	framework?: string;
	search?: string;
};

export type AppListItem = {
	id: string;
	title: string;
	description?: string | null;
	framework?: string | null;
	updatedAt?: string | null;
	createdAt?: string | null;
	visibility?: 'public' | 'private';
	previewUrl?: string;
};

export type AppDetails = Record<string, unknown> & {
	id: string;
	previewUrl?: string;
	cloudflareUrl?: string;
};

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
	| { type: 'user_suggestion'; message: string; images?: unknown[] };

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
	/** Server payload that isn't a well-formed typed message. */
	'ws:raw': { raw: unknown };
	/** Raw server->client message (typed) */
	'ws:message': AgentWsServerMessage;

	// High-level sugar events (typed)
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
	/** User-friendly error derived from `{ type: 'error' }` message */
	error: { error: string };
};

export type WebSocketLike = {
	send: (data: string) => void;
	close: () => void;
	addEventListener?: (
		type: 'open' | 'close' | 'error' | 'message',
		listener: (event: unknown) => void
	) => void;
	on?: (type: string, listener: (...args: unknown[]) => void) => void;
};

export type AgentConnectionOptions = {
	/** Override Origin header for WS (browser-like security). */
	origin?: string;
	/** Optional per-connection ephemeral credentials (used by `session_init`). */
	credentials?: Credentials;
	/** Additional headers (Node/Bun via ws factory). */
	headers?: Record<string, string>;
	/** Optional WebSocket factory for Node/Bun runtimes. */
	webSocketFactory?: (url: string, protocols?: string | string[], headers?: Record<string, string>) => WebSocketLike;
	/**
	 * Auto-reconnect config (enabled by default).
	 * Set `{ enabled: false }` to disable.
	 */
	retry?: {
		enabled?: boolean;
		initialDelayMs?: number;
		maxDelayMs?: number;
		maxRetries?: number;
	};
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

export type SessionDeployable = {
	files: number;
	reason: 'generation_complete' | 'phase_validated';
	previewUrl?: string;
};

export type VibeClientOptions = {
	baseUrl: string;
	/**
	 * Current platform requirement: JWT access token. In future this will be minted from `apiKey`.
	 */
	token?: string;
	/** Future: VibeSDK API key. */
	apiKey?: string;
	defaultHeaders?: Record<string, string>;
	/** Used as Origin header for WS (optional but often required). */
	websocketOrigin?: string;
	/** Optional WebSocket factory for Node/Bun runtimes. */
	webSocketFactory?: AgentConnectionOptions['webSocketFactory'];
	fetchFn?: typeof fetch;
	/** HTTP retry configuration for transient failures (5xx, network errors). */
	retry?: RetryConfig;
};
