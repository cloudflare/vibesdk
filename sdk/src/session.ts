import type {
	AgentConnection,
	AgentConnectionOptions,
	AgentWsServerMessage,
	BehaviorType,
	BuildStartEvent,
	Credentials,
	FileTreeNode,
	PhaseEventType,
	ProjectType,
	SessionDeployable,
	SessionFiles,
	VibeClientOptions,
	WaitForPhaseOptions,
	WaitOptions,
	WsMessageOf,
} from './types';
import { SessionStateStore } from './state';
import { createAgentConnection } from './ws';
import { WorkspaceStore } from './workspace';

export type WaitUntilReadyOptions = WaitOptions;

export type BuildSessionConnectOptions = AgentConnectionOptions & {
	/** If true (default), send `get_conversation_state` on socket open. */
	autoRequestConversationState?: boolean;
};

type BuildSessionInit = {
	getAuthToken?: () => string | undefined;
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

	readonly wait = {
		generationStarted: (options: WaitOptions = {}) => this.waitForGenerationStarted(options),
		generationComplete: (options: WaitOptions = {}) => this.waitForGenerationComplete(options),
		phase: (options: WaitForPhaseOptions) => this.waitForPhase(options),
		deployable: (options: WaitOptions = {}) => this.waitForDeployable(options),
		previewDeployed: (options: WaitOptions = {}) => this.waitForPreviewDeployed(options),
		cloudflareDeployed: (options: WaitOptions = {}) => this.waitForCloudflareDeployed(options),
	};

	constructor(
		private clientOptions: VibeClientOptions,
		start: BuildStartEvent,
		private init: BuildSessionInit = {}
	) {
		this.agentId = start.agentId;
		this.websocketUrl = start.websocketUrl;
		this.behaviorType = start.behaviorType;
		this.projectType = start.projectType;
	}

	isConnected(): boolean {
		return this.connection !== null;
	}

	connect(options: BuildSessionConnectOptions = {}): AgentConnection {
		if (this.connection) return this.connection;

		const { autoRequestConversationState, ...agentOptions } = options;

		const origin = agentOptions.origin ?? this.clientOptions.websocketOrigin;
		const webSocketFactory = agentOptions.webSocketFactory ?? this.clientOptions.webSocketFactory;

		const headers: Record<string, string> = { ...(agentOptions.headers ?? {}) };
		const token = this.init.getAuthToken?.();
		if (token && !headers.Authorization) {
			headers.Authorization = `Bearer ${token}`;
		}

		const connectOptions: AgentConnectionOptions = {
			...agentOptions,
			...(origin ? { origin } : {}),
			...(Object.keys(headers).length ? { headers } : {}),
			...(webSocketFactory ? { webSocketFactory } : {}),
		};

		this.state.setConnection('connecting');
		this.connection = createAgentConnection(this.websocketUrl, connectOptions);
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

		const credentials = agentOptions.credentials ?? this.init.defaultCredentials;
		const shouldRequestConversationState = autoRequestConversationState ?? true;
		this.connection.on('ws:open', () => {
			if (credentials) {
				this.connection?.send({
					type: 'session_init',
					credentials,
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

	followUp(message: string, options?: { images?: unknown[] }): void {
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
