import type {
	AgentConnection,
	AgentConnectionOptions,
	AgentWsServerMessage,
	BehaviorType,
	BuildStartEvent,
	Credentials,
	FileTreeNode,
	ImageAttachment,
	PhaseEventType,
	PhaseInfo,
	PhaseTimelineEvent,
	ProjectType,
	SessionDeployable,
	SessionFiles,
	WaitForPhaseOptions,
	WaitOptions,
	WsMessageOf,
} from './types';
import { SessionStateStore } from './state';
import { createAgentConnection } from './ws';
import { WorkspaceStore } from './workspace';
import type { HttpClient } from './http';

export type WaitUntilReadyOptions = WaitOptions;

export type BuildSessionConnectOptions = Omit<AgentConnectionOptions, 'credentials'> & {
	/** If true (default), send `get_conversation_state` on socket open. */
	autoRequestConversationState?: boolean;
	/** Credentials to send via session_init after connection. */
	credentials?: Credentials;
};

type BuildSessionInit = {
	httpClient: HttpClient;
	defaultCredentials?: Credentials;
};

function buildFileTree(paths: string[]): FileTreeNode[] {
	type Dir = {
		name: string;
		path: string;
		dirs: Map<string, Dir>;
		files: FileTreeNode[];
	};

	const root: Dir = { name: '', path: '', dirs: new Map(), files: [] };

	for (const p of paths) {
		const parts = p.split('/').filter(Boolean);
		let curr = root;
		for (let i = 0; i < parts.length; i += 1) {
			const part = parts[i]!;
			const isLast = i === parts.length - 1;
			if (isLast) {
				curr.files.push({ type: 'file', name: part, path: p });
				continue;
			}

			const nextPath = curr.path ? `${curr.path}/${part}` : part;
			let next = curr.dirs.get(part);
			if (!next) {
				next = { name: part, path: nextPath, dirs: new Map(), files: [] };
				curr.dirs.set(part, next);
			}
			curr = next;
		}
	}

	function toNodes(dir: Dir): FileTreeNode[] {
		const dirs = Array.from(dir.dirs.values())
			.sort((a, b) => a.name.localeCompare(b.name))
			.map(
				(d) =>
					({
						type: 'dir',
						name: d.name,
						path: d.path,
						children: toNodes(d),
					}) as FileTreeNode,
			);
		const files = dir.files.sort((a, b) => a.name.localeCompare(b.name));
		return [...dirs, ...files];
	}

	return toNodes(root);
}

export class BuildSession {
	readonly agentId: string;
	readonly websocketUrl: string;
	readonly behaviorType: BehaviorType | undefined;
	readonly projectType: ProjectType | string | undefined;

	private connection: AgentConnection | null = null;
	readonly workspace = new WorkspaceStore();
	readonly state = new SessionStateStore();

	readonly files: SessionFiles = {
		listPaths: () => this.workspace.paths(),
		read: (path) => this.workspace.read(path),
		snapshot: () => this.workspace.snapshot(),
		tree: () => buildFileTree(this.workspace.paths()),
	};

	/**
	 * High-level API for accessing the phase timeline.
	 * Phases are seeded from agent_connected and updated on phase events.
	 */
	readonly phases = {
		/** Get all phases in the timeline. */
		list: (): PhaseInfo[] => this.state.get().phases,

		/** Get the currently active phase (first non-completed phase), or undefined. */
		current: (): PhaseInfo | undefined =>
			this.state.get().phases.find((p) => p.status !== 'completed' && p.status !== 'cancelled'),

		/** Get all completed phases. */
		completed: (): PhaseInfo[] =>
			this.state.get().phases.filter((p) => p.status === 'completed'),

		/** Get a phase by its id (e.g., "phase-0"). */
		get: (id: string): PhaseInfo | undefined =>
			this.state.get().phases.find((p) => p.id === id),

		/** Get the total count of phases. */
		count: (): number => this.state.get().phases.length,

		/** Check if all phases are completed. */
		allCompleted: (): boolean =>
			this.state.get().phases.length > 0 &&
			this.state.get().phases.every((p) => p.status === 'completed'),

		/**
		 * Subscribe to phase timeline changes.
		 * Fires when a phase is added or when a phase's status/files change.
		 * @returns Unsubscribe function.
		 */
		onChange: (cb: (event: PhaseTimelineEvent) => void): (() => void) =>
			this.state.onPhaseChange(cb),
	};

	readonly wait = {
		generationStarted: (options: WaitOptions = {}) => this.waitForGenerationStarted(options),
		generationComplete: (options: WaitOptions = {}) => this.waitForGenerationComplete(options),
		phase: (options: WaitForPhaseOptions) => this.waitForPhase(options),
		deployable: (options: WaitOptions = {}) => this.waitForDeployable(options),
		previewDeployed: (options: WaitOptions = {}) => this.waitForPreviewDeployed(options),
		cloudflareDeployed: (options: WaitOptions = {}) => this.waitForCloudflareDeployed(options),
	};

	constructor(
		start: BuildStartEvent,
		private init: BuildSessionInit
	) {
		this.agentId = start.agentId;
		this.websocketUrl = start.websocketUrl;
		this.behaviorType = start.behaviorType;
		this.projectType = start.projectType;
	}

	isConnected(): boolean {
		return this.connection !== null;
	}

	/**
	 * Connect to the agent via WebSocket using ticket-based authentication.
	 * Fetches a fresh ticket on initial connect and on each reconnect.
	 */
	async connect(options: BuildSessionConnectOptions = {}): Promise<AgentConnection> {
		if (this.connection) return this.connection;

		const { autoRequestConversationState, credentials, ...connectionOptions } = options;

		// URL provider fetches fresh ticket on each connect/reconnect
		const getUrl = async (): Promise<string> => {
			const { ticket } = await this.init.httpClient.getWsTicket(this.agentId);
			const base = this.websocketUrl;
			const sep = base.includes('?') ? '&' : '?';
			return `${base}${sep}ticket=${encodeURIComponent(ticket)}`;
		};

		this.state.setConnection('connecting');
		this.connection = createAgentConnection(getUrl, connectionOptions);

		// Handle state updates from messages
		this.connection.on('ws:message', (m) => {
			this.workspace.applyWsMessage(m);
			this.state.applyWsMessage(m);
		});

		this.connection.on('ws:open', () => {
			this.state.setConnection('connected');
		});

		this.connection.on('ws:close', () => {
			this.state.setConnection('disconnected');
		});

		// Send credentials and request state on open
		const sessionCredentials = credentials ?? this.init.defaultCredentials;
		const shouldRequestConversationState = autoRequestConversationState ?? true;

		this.connection.on('ws:open', () => {
			if (sessionCredentials) {
				this.connection?.send({
					type: 'session_init',
					credentials: sessionCredentials,
				});
			}
			if (shouldRequestConversationState) {
				this.connection?.send({ type: 'get_conversation_state' });
			}
		});

		return this.connection;
	}

	startGeneration(): void {
		this.assertConnected();
		this.connection!.send({ type: 'generate_all' });
	}

	stop(): void {
		this.assertConnected();
		this.connection!.send({ type: 'stop_generation' });
	}

	followUp(message: string, options?: { images?: ImageAttachment[] }): void {
		this.assertConnected();
		this.connection!.send({
			type: 'user_suggestion',
			message,
			images: options?.images,
		});
	}

	requestConversationState(): void {
		this.assertConnected();
		this.connection!.send({ type: 'get_conversation_state' });
	}

	deployPreview(): void {
		this.assertConnected();
		this.connection!.send({ type: 'preview' });
	}

	deployCloudflare(): void {
		this.assertConnected();
		this.connection!.send({ type: 'deploy' });
	}

	resume(): void {
		this.assertConnected();
		this.connection!.send({ type: 'resume_generation' });
	}

	clearConversation(): void {
		this.assertConnected();
		this.connection!.send({ type: 'clear_conversation' });
	}

	private getDefaultTimeoutMs(): number {
		return 10 * 60_000;
	}

	private async waitForWsMessage(
		predicate: (msg: AgentWsServerMessage) => boolean,
		timeoutMs: number
	): Promise<AgentWsServerMessage> {
		this.assertConnected();
		return await this.connection!.waitFor('ws:message', predicate, timeoutMs);
	}

	async waitForGenerationStarted(options: WaitOptions = {}): Promise<WsMessageOf<'generation_started'>> {
		return await this.waitForMessageType('generation_started', options.timeoutMs ?? this.getDefaultTimeoutMs());
	}

	async waitForGenerationComplete(options: WaitOptions = {}): Promise<WsMessageOf<'generation_complete'>> {
		return await this.waitForMessageType('generation_complete', options.timeoutMs ?? this.getDefaultTimeoutMs());
	}

	async waitForPhase(options: WaitForPhaseOptions): Promise<WsMessageOf<PhaseEventType>> {
		return await this.waitForMessageType(
			options.type,
			options.timeoutMs ?? this.getDefaultTimeoutMs(),
		);
	}

	async waitForDeployable(options: WaitOptions = {}): Promise<SessionDeployable> {
		const timeoutMs = options.timeoutMs ?? this.getDefaultTimeoutMs();
		if (this.behaviorType === 'phasic') {
			await this.waitForPhase({ type: 'phase_validated', timeoutMs });
			return {
				files: this.workspace.paths().length,
				reason: 'phase_validated',
				previewUrl: this.state.get().previewUrl,
			};
		}

		await this.waitForGenerationComplete({ timeoutMs });
		return {
			files: this.workspace.paths().length,
			reason: 'generation_complete',
			previewUrl: this.state.get().previewUrl,
		};
	}

	async waitForPreviewDeployed(options: WaitOptions = {}): Promise<WsMessageOf<'deployment_completed'>> {
		const timeoutMs = options.timeoutMs ?? this.getDefaultTimeoutMs();
		const msg = await this.waitForWsMessage(
			(m) => m.type === 'deployment_completed' || m.type === 'deployment_failed',
			timeoutMs,
		);
		if (msg.type === 'deployment_failed') {
			throw new Error((msg as WsMessageOf<'deployment_failed'>).error);
		}
		return msg as WsMessageOf<'deployment_completed'>;
	}

	async waitForCloudflareDeployed(
		options: WaitOptions = {},
	): Promise<WsMessageOf<'cloudflare_deployment_completed'>> {
		const timeoutMs = options.timeoutMs ?? this.getDefaultTimeoutMs();
		const msg = await this.waitForWsMessage(
			(m) =>
				m.type === 'cloudflare_deployment_completed' || m.type === 'cloudflare_deployment_error',
			timeoutMs,
		);
		if (msg.type === 'cloudflare_deployment_error') {
			throw new Error((msg as WsMessageOf<'cloudflare_deployment_error'>).error);
		}
		return msg as WsMessageOf<'cloudflare_deployment_completed'>;
	}

	/**
	 * Legacy alias. Prefer `session.wait.generationStarted()`.
	 */
	async waitUntilReady(options: WaitUntilReadyOptions = {}): Promise<void> {
		await this.waitForGenerationStarted(options);
	}

	on: AgentConnection['on'] = (event, cb) => {
		this.assertConnected();
		return this.connection!.on(event, cb);
	};

	onAny: AgentConnection['onAny'] = (cb) => {
		this.assertConnected();
		return this.connection!.onAny(cb);
	};

	onMessageType<TType extends AgentWsServerMessage['type']>(
		type: TType,
		cb: (message: WsMessageOf<TType>) => void
	): () => void {
		this.assertConnected();
		return this.connection!.on('ws:message', (msg) => {
			if (msg.type === type) cb(msg as WsMessageOf<TType>);
		});
	}

	async waitForMessageType<TType extends AgentWsServerMessage['type']>(
		type: TType,
		timeoutMs?: number
	): Promise<WsMessageOf<TType>> {
		this.assertConnected();
		return (await this.connection!.waitFor(
			'ws:message',
			(msg) => msg.type === type,
			timeoutMs ?? this.getDefaultTimeoutMs(),
		)) as WsMessageOf<TType>;
	}

	close(): void {
		this.connection?.close();
		this.connection = null;
		this.workspace.clear();
		this.state.clear();
	}

	private assertConnected(): void {
		if (!this.connection) {
			throw new Error('BuildSession is not connected. Call session.connect() first.');
		}
	}
}
