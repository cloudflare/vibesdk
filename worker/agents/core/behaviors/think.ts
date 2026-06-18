import { RpcTarget } from 'cloudflare:workers';
import { getAgentByName } from 'agents';
import type { UIMessage } from 'ai';
import { ThinkState } from '../state';
import { AgentInitArgs, DeploymentTarget } from '../types';
import { BaseCodingBehavior } from './base';
import { WebSocketMessageResponses } from '../../constants';
import { ICodingAgent } from '../../services/interfaces/ICodingAgent';
import { OperationOptions } from '../../operations/common';
import { GenerationContext, AgenticGenerationContext } from '../../domain/values/GenerationContext';
import { ImageAttachment, ProcessedImageAttachment } from 'worker/types/image-attachment';
import { ImageType, uploadImage } from 'worker/utils/images';
import { IdGenerator } from '../../utils/idGenerator';
import { generateNanoId } from '../../../utils/idGenerator';
import { generateProjectName } from '../../utils/templateCustomizer';
import { PreviewType, TemplateDetails } from 'worker/services/sandbox/sandboxTypes';
import {
	buildSpacePreviewPath,
	getPreviewDomain,
	isSeparatePreviewDomain,
	resolvePreviewHost,
} from 'worker/utils/urls';
import { isDev } from 'worker/utils/envs';
import { signSpacePreviewToken } from 'worker/utils/spacePreviewToken';
import { AGENT_CONFIG } from '../../inferutils/config';
import { AI_MODEL_CONFIG, AIModels, AIModelConfig, ModelSize } from '../../inferutils/config.types';
import { getConfigurationForModel } from '../../inferutils/core';
import type { ThinkAgentConfig } from '../../think/ThinkAgent';

/**
 * Minimal stub shape for the `ThinkAgent` DO (see `worker/agents/think/ThinkAgent.ts`).
 * Driven via DO RPC from this behavior, which runs inside `CodeGeneratorAgent`.
 */
type ThinkAgentStub = {
	configureVibe: (config: ThinkAgentConfig) => Promise<void>;
	chat: (userMessage: string, callback: RpcTarget) => Promise<void>;
	getMessages: () => Promise<UIMessage[]>;
	clearMessages: () => Promise<void>;
};

/** Subset of AI-SDK `UIMessageChunk` shapes this behavior reacts to. */
type ThinkChunk =
	| { type: 'text-delta'; id: string; delta: string }
	| { type: 'tool-input-start'; toolCallId: string; toolName: string }
	| { type: 'tool-input-available'; toolCallId: string; toolName: string; input: unknown }
	| { type: 'tool-output-available'; toolCallId: string; output: unknown }
	| { type: 'tool-output-error'; toolCallId: string; errorText: string }
	| { type: 'finish' }
	| { type: string; [key: string]: unknown };

/**
 * `RpcTarget` forwarder passed to `ThinkAgent.chat()`. Think streams
 * `UIMessageChunk` JSON frames into `onEvent`; we hand each to the behavior's
 * translator which maps them onto VibeSDK WebSocket events.
 */
class ThinkStreamForwarder extends RpcTarget {
	constructor(
		private readonly onChunkJson: (json: string) => void | Promise<void>,
		private readonly onErrorCb: (message: string) => void,
	) {
		super();
	}
	onStart(_event: { requestId: string }): void {}
	async onEvent(json: string): Promise<void> {
		await this.onChunkJson(json);
	}
	onDone(): void {}
	onError(error: string): void {
		this.onErrorCb(error);
	}
	onInterrupted(): void {}
}

/**
 * ThinkCodingBehavior — agentic coding harness built on `@cloudflare/think`.
 *
 * - Owns one `ThinkAgent` DO (agentic loop + message persistence) and one
 *   `SpaceDO` (git-backed files + preview/deploy) per app, both named by agentId.
 * - Pushes the resolved AI Gateway model config into the ThinkAgent via
 *   `configureVibe()`, then drives each turn with `ThinkAgent.chat()` and
 *   translates the streamed `UIMessageChunk`s into VibeSDK WS events.
 * - File mutations land directly in SpaceDO (the ThinkAgent's workspace tools
 *   are SpaceDO-backed) and are mirrored into `FileManager` for the editor pane.
 */
export class ThinkCodingBehavior
	extends BaseCodingBehavior<ThinkState>
	implements ICodingAgent {
	protected static readonly PROJECT_NAME_PREFIX_MAX_LENGTH = 20;

	override getBehavior(): 'think' { return 'think'; }

	// ──────────────────────────────────────────────────────────────
	// DO stubs

	/**
	 * Resolve the ThinkAgent DO via the agents framework helper (NOT a raw
	 * `ns.get(idFromName())`). `getAgentByName` performs the agents `_init`
	 * handshake that sets `this.name` and wires the message/session manager;
	 * a raw stub leaves those undefined and `chat()` throws on `appendMessage`.
	 */
	private async getThinkStub(): Promise<ThinkAgentStub> {
		const ns = (this.env as unknown as { THINK_DO: DurableObjectNamespace }).THINK_DO;
		const name = this.state.thinkAgentName || this.getAgentId();
		const stub = await getAgentByName(ns as never, name);
		return stub as unknown as ThinkAgentStub;
	}

	private getSpaceStub(): DurableObjectStub {
		// One space per session: always keyed by the agent (session) id.
		const ns = (this.env as unknown as { SPACE_DO: DurableObjectNamespace }).SPACE_DO;
		return ns.get(ns.idFromName(this.getAgentId()));
	}

	// ──────────────────────────────────────────────────────────────
	// Initialize

	async initialize(
		initArgs: AgentInitArgs<ThinkState>,
		..._args: unknown[]
	): Promise<ThinkState> {
		await super.initialize(initArgs);
		// Think projects are template-free: SpaceDO + the agent's own file tools
		// own scaffolding entirely. We intentionally ignore `templateInfo`.
		const { query, hostname, inferenceContext, sandboxSessionId } = initArgs;

		const baseName = (query || 'project').toString();
		const projectName = generateProjectName(
			baseName,
			generateNanoId(),
			ThinkCodingBehavior.PROJECT_NAME_PREFIX_MAX_LENGTH,
		);

		// `agentId` is the canonical name for both the ThinkAgent and SpaceDO.
		const agentName = inferenceContext.metadata.agentId;

		this.setState({
			...this.state,
			projectName,
			query,
			blueprint: {
				title: baseName,
				projectName,
				description: query,
				colorPalette: ['#1e1e1e'],
				frameworks: [],
				plan: [],
			},
			templateName: 'think',
			sandboxInstanceId: undefined,
			commandsHistory: [],
			sessionId: sandboxSessionId!,
			hostname,
			metadata: inferenceContext.metadata,
			projectType: this.projectType,
			behaviorType: 'think',
			thinkAgentName: agentName,
			currentBranch: 'main',
		});

		// Push model/space/prompt config into the ThinkAgent DO.
		await this.configureThinkAgent();

		// Materialize the SpaceDO (git init + main branch) so file tools and the
		// preview/deploy path have a valid HEAD from the first turn.
		await this.seedEmptySpace();

		this.logger.info(
			`Think agent ${this.getAgentId()} initialized (space=${agentName})`,
		);
		return this.state;
	}

	/**
	 * Resolve the AI Gateway model coordinates from VibeSDK's model config and
	 * push them (plus space name + system prompt) into the ThinkAgent DO.
	 */
	private async configureThinkAgent(): Promise<void> {
		const inf = this.getInferenceContext();
		const userId = this.state.metadata.userId;

		const modelConfig =
			inf.userModelConfigs?.agenticProjectBuilder ?? AGENT_CONFIG.agenticProjectBuilder;
		const modelName = String(modelConfig.name);

		// Map to an AIModelConfig (provider/etc.) for gateway resolution. Fall
		// back to deriving the provider from the `provider/model` id for any
		// model not in the platform catalog.
		const aiModelConfig: AIModelConfig =
			AI_MODEL_CONFIG[modelName as AIModels] ?? {
				name: modelName,
				size: ModelSize.REGULAR,
				provider: modelName.includes('/') ? modelName.split('/')[0] : 'google-ai-studio',
				creditCost: 0,
				contextSize: 0,
			};

		let conf: { baseURL: string; apiKey: string; defaultHeaders?: Record<string, string> };
		try {
			conf = await getConfigurationForModel(
				aiModelConfig,
				this.env,
				userId,
				inf.runtimeOverrides,
				false, // platform gateway (BYOK key plumbing not forwarded to the child DO)
				inf.userApiToken,
				null,
			);
		} catch (e) {
			this.logger.warn('Failed to resolve model gateway config for ThinkAgent', e);
			return;
		}

		// `getConfigurationForModel` only emits `cf-aig-authorization` when a
		// *separate* provider key exists (apiKey !== gatewayToken). When it's
		// absent, the platform has no provider key of its own and relies on the
		// gateway's stored keys (BYOK) — so authenticate with the gateway token
		// and let `ThinkAgent.getModel()` drop the provider `Authorization`
		// header (see `useStoredKeys`).
		const tokenEnv = this.env as unknown as {
			CLOUDFLARE_AI_GATEWAY_TOKEN?: string;
			CLOUDFLARE_API_TOKEN?: string;
		};
		const gatewayToken = tokenEnv.CLOUDFLARE_AI_GATEWAY_TOKEN || tokenEnv.CLOUDFLARE_API_TOKEN;
		const usesStoredKeys = !conf.defaultHeaders?.['cf-aig-authorization'];
		const headers: Record<string, string> = { ...(conf.defaultHeaders ?? {}) };
		if (gatewayToken && !headers['cf-aig-authorization']) {
			headers['cf-aig-authorization'] = `Bearer ${gatewayToken}`;
		}

		// Target the gateway by account + gateway ID (the `CLOUDFLARE_AI_GATEWAY`
		// binding), forwarding `CLOUDFLARE_GATEWAY_ID: env.CLOUDFLARE_AI_GATEWAY`.
		// This deliberately ignores `CLOUDFLARE_AI_GATEWAY_URL` (which may point at a different
		// gateway/account the platform token isn't authorized for).
		const env = this.env as unknown as {
			CLOUDFLARE_ACCOUNT_ID?: string;
			CLOUDFLARE_AI_GATEWAY?: string;
		};
		let baseURL = conf.baseURL;
		if (env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_AI_GATEWAY) {
			baseURL = `https://gateway.ai.cloudflare.com/v1/${env.CLOUDFLARE_ACCOUNT_ID}/${env.CLOUDFLARE_AI_GATEWAY}/compat`;
		}

		const config: ThinkAgentConfig = {
			userId,
			model: {
				baseURL,
				apiKey: conf.apiKey,
				modelName,
				headers: Object.keys(headers).length > 0 ? headers : undefined,
				useStoredKeys: usesStoredKeys,
			},
			systemPrompt: this.buildSystemPrompt(modelName, aiModelConfig.provider),
			previewUrl: await this.getBrowserPreviewURL().catch(() => undefined),
		};

		try {
			const stub = await this.getThinkStub();
			await stub.configureVibe(config);
		} catch (e) {
			this.logger.warn('ThinkAgent.configureVibe failed (continuing)', e);
		}
	}

	/**
	 * Per-app context appended AFTER the file-based base prompt (the persona /
	 * engineering guidance comes from `worker/agents/think/prompts/*.txt` via
	 * `selectSystemPrompt`). This block only carries the dynamic project context
	 * and the VibeSDK-specific deploy→verify workflow, which the generic prompt
	 * files don't know about — the environment and custom instructions for the run.
	 */
	private buildSystemPrompt(modelName: string, provider: string): string {
		return [
			`You are powered by the model named ${modelName}. The exact model ID is ${provider}/${modelName}.`,
			'<env>',
			`  Platform: Cloudflare Workers (SpaceDO preview — no shell, no local filesystem)`,
			`  Today's date: ${new Date().toDateString()}`,
			'</env>',
			'',
			`# Project: ${this.state.projectName || 'app'}`,
			'',
			'## User request',
			this.state.query,
			'',
			'## Clarify before building',
			'If the request is underspecified or ambiguous (e.g. a one-line idea with no details on features, scope, data, or design), do NOT start writing files yet. Instead, on this turn:',
			'1. Briefly state the assumptions you would make to proceed.',
			'2. Ask a few concise, targeted clarifying questions about the most important unknowns.',
			'3. End your turn and wait for the user. Do not write/edit files or deploy until the scope is clear or the user tells you to proceed with your assumptions.',
			'If the request is already clear and specific, skip this and go straight to building.',
			'',
			'## Deploy & verify workflow (VibeSDK-specific)',
			'Once you are actively building (the scope is clear or the user confirmed), this app is previewed on Cloudflare Workers via SpaceDO — there is no shell. In a building turn, do NOT end after only writing files:',
			'1. After writing or editing files, call `deploy_space` to commit and deploy so the preview rebuilds.',
			'2. Then call `get_browser_console_logs` to inspect the running preview for client-side errors (JS exceptions, failed fetches, missing assets, hydration errors).',
			'3. If the deploy reports build errors or the console shows errors, fix the code and repeat from step 1 until the deploy succeeds and the console is clean.',
			'A building turn should finish with a successful `deploy_space` and a clean `get_browser_console_logs` check.',
		].join('\n');
	}

	/**
	 * Bootstrap an empty SpaceDO: write a marker file and commit so the DO is
	 * instantiated with a `main` branch and a valid HEAD.
	 */
	private async seedEmptySpace(): Promise<void> {
		const space = this.getSpaceStub() as unknown as {
			writeFile: (path: string, content: string) => Promise<unknown>;
			gitCommit: (msg: string, author?: { name: string; email: string }) => Promise<unknown>;
		};
		const marker = JSON.stringify(
			{ agentId: this.getAgentId(), createdAt: new Date().toISOString(), seededBy: 'vibesdk-think' },
			null,
			2,
		);
		try {
			await space.writeFile('.think/space.json', marker);
			await space.gitCommit('chore: initialize think space');
		} catch (e) {
			this.logger.warn('SpaceDO empty-seed failed (continuing)', e);
		}
	}

	// ──────────────────────────────────────────────────────────────
	// Generation orchestration

	/**
	 * The `preview` WS action / preview controller route here. Think has no
	 * sandbox — previews run on Workers via SpaceDO — so deploy the current
	 * SpaceDO branch and return its preview URL.
	 */
	async deployToSandbox(): Promise<PreviewType | null> {
		const url = await this.deployCurrentBranch();
		return url ? { previewURL: url } : null;
	}

	private async getPublicOrigin(): Promise<string> {
		if (isDev(this.env)) return 'http://localhost:5173';
		if (isSeparatePreviewDomain(this.env)) {
			return `https://${getPreviewDomain(this.env)}`;
		}
		const host = resolvePreviewHost(this.env, this.state.wsOrigin);
		return `https://${host}`;
	}

	public async getBrowserPreviewURL(): Promise<string> {
		const spaceName = this.getAgentId();
		const branch = this.state.currentBranch || 'main';
		const previewBaseUrl = `${await this.getPublicOrigin()}${buildSpacePreviewPath(spaceName, branch)}`;
		// Always append a signed, branch-scoped preview token. It bootstraps the
		// path-scoped HttpOnly preview cookie on first load (so iframe sub-resources
		// authenticate), and authenticates machine clients like the headless
		// `get_browser_console_logs` browser, which carry no cookie.
		const token = await signSpacePreviewToken(this.env, {
			spaceName,
			branch,
			userId: this.state.metadata.userId,
		});
		return `${previewBaseUrl}?t=${encodeURIComponent(token)}`;
	}

	public getTemplateDetails(): TemplateDetails {
		if (!this.templateDetailsCache) {
			this.templateDetailsCache = {
				name: 'think',
				description: { selection: 'think', usage: 'think (template-free)' },
				fileTree: { path: '/', type: 'directory', children: [] },
				allFiles: {},
				deps: {},
				language: 'typescript',
				projectType: 'general',
				frameworks: [],
				importantFiles: [],
				dontTouchFiles: [],
				redactedFiles: [],
				disabled: false,
				renderMode: 'sandbox',
			};
		}
		return this.templateDetailsCache;
	}

	public override async ensureTemplateDetails(): Promise<TemplateDetails> {
		return this.getTemplateDetails();
	}

	getOperationOptions(): OperationOptions<AgenticGenerationContext> {
		const agenticLike = {
			...this.state,
			behaviorType: 'agentic' as const,
			currentPlan: '',
		};
		const context = GenerationContext.from(
			agenticLike as unknown as Parameters<typeof GenerationContext.from>[0],
			this.getTemplateDetails(),
			this.logger,
		);
		return {
			env: this.env,
			agentId: this.getAgentId(),
			context: context as AgenticGenerationContext,
			logger: this.logger,
			inferenceContext: this.getInferenceContext(),
			agent: this,
		};
	}

	async handleUserInput(userMessage: string, images?: ImageAttachment[]): Promise<void> {
		let processedImages: ProcessedImageAttachment[] | undefined;
		if (images && images.length > 0) {
			processedImages = await Promise.all(
				images.map((image) => uploadImage(this.env, image, ImageType.UPLOADS)),
			);
		}
		await this.queueUserRequest(userMessage, processedImages);

		if (this.isCodeGenerating()) {
			this.broadcast(WebSocketMessageResponses.CONVERSATION_RESPONSE, {
				message: '',
				conversationId: IdGenerator.generateConversationId(),
				isStreaming: false,
				tool: {
					name: 'Message Queued',
					status: 'success',
					args: { userMessage, images: processedImages },
				},
			});
		}
	}

	/** Main loop: drain pendingUserInputs by driving the ThinkAgent. */
	async build(): Promise<void> {
		if (!this.isMVPGenerated() && this.state.query && this.state.pendingUserInputs.length === 0) {
			this.setState({ ...this.state, pendingUserInputs: [this.state.query] });
		}

		while (this.state.pendingUserInputs.length > 0) {
			const pending = this.state.pendingUserInputs.slice();
			this.setState({ ...this.state, pendingUserInputs: [] });

			const compiled = pending.join('\n');
			try {
				await this.runPrompt(compiled);
			} catch (e) {
				this.logger.error('Think prompt failed', e);
				this.broadcast(WebSocketMessageResponses.ERROR, {
					error: e instanceof Error ? e.message : String(e),
				});
				break;
			}

			if (!this.isMVPGenerated()) {
				this.setMVPGenerated();
			}

			// Deploys (and the preview) are driven entirely by the model calling
			// `deploy_space`; its tool output surfaces the preview via
			// `handleDeploySpaceOutput`. The harness no longer deploys on its own.
		}
	}

	/**
	 * Submit a prompt to the ThinkAgent and translate its streamed
	 * `UIMessageChunk`s into VibeSDK WebSocket events.
	 */
	private async runPrompt(text: string): Promise<void> {
		const conversationId = IdGenerator.generateConversationId();
		this.broadcast(WebSocketMessageResponses.CONVERSATION_RESPONSE, {
			message: '',
			conversationId,
			isStreaming: true,
		});

		const accumulated = { text: '' };
		const seenWrittenFiles = new Set<string>();
		const toolNames = new Map<string, string>();
		const toolInputs = new Map<string, Record<string, unknown>>();

		const forwarder = new ThinkStreamForwarder(
			(json) => {
				let chunk: ThinkChunk;
				try {
					chunk = JSON.parse(json) as ThinkChunk;
				} catch {
					return;
				}
				return this.translateChunk(chunk, conversationId, accumulated, seenWrittenFiles, toolNames, toolInputs);
			},
			(err) => this.broadcast(WebSocketMessageResponses.ERROR, { error: err }),
		);

		const stub = await this.getThinkStub();
		try {
			await stub.chat(text, forwarder);
		} finally {
			// Think's non-streaming finalize: the FE replaces content with this
			// terminal payload, so only send it when we actually accumulated text.
			if (accumulated.text) {
				this.broadcast(WebSocketMessageResponses.CONVERSATION_RESPONSE, {
					message: accumulated.text,
					conversationId,
					isStreaming: false,
				});
			}
		}
	}

	private async translateChunk(
		chunk: ThinkChunk,
		conversationId: string,
		accumulated: { text: string },
		seenWrittenFiles: Set<string>,
		toolNames: Map<string, string>,
		toolInputs: Map<string, Record<string, unknown>>,
	): Promise<void> {
		switch (chunk.type) {
			case 'text-delta': {
				const delta = (chunk as { delta?: string }).delta;
				if (typeof delta === 'string' && delta.length > 0) {
					accumulated.text += delta;
					this.broadcast(WebSocketMessageResponses.CONVERSATION_RESPONSE, {
						message: delta,
						conversationId,
						isStreaming: true,
						isDelta: true,
					});
				}
				return;
			}
			case 'tool-input-start': {
				const { toolCallId, toolName } = chunk as { toolCallId: string; toolName: string };
				toolNames.set(toolCallId, toolName);
				this.broadcast(WebSocketMessageResponses.CONVERSATION_RESPONSE, {
					message: '',
					conversationId,
					isStreaming: true,
					tool: this.buildToolBroadcastPayload(toolName, undefined, 'start'),
				});
				return;
			}
			case 'tool-input-available': {
				const { toolCallId, toolName, input } = chunk as {
					toolCallId: string; toolName: string; input: unknown;
				};
				toolNames.set(toolCallId, toolName);
				const args = (input && typeof input === 'object') ? (input as Record<string, unknown>) : {};
				toolInputs.set(toolCallId, args);
				if (isFileWriteTool(toolName)) {
					const filePath = pickStringField(args, 'path', 'filePath', 'file');
					if (filePath && !seenWrittenFiles.has(filePath)) {
						const displayPath = filePath.replace(/^\/+/, '');
						this.broadcast(WebSocketMessageResponses.FILE_GENERATING, {
							message: `Writing ${displayPath}`,
							filePath: displayPath,
							filePurpose: 'Generated by think',
						});
					}
				}
				return;
			}
			case 'tool-output-available': {
				const { toolCallId, output } = chunk as { toolCallId: string; output: unknown };
				const toolName = toolNames.get(toolCallId) || 'tool';
				const args = toolInputs.get(toolCallId) || {};
				this.broadcast(WebSocketMessageResponses.CONVERSATION_RESPONSE, {
					message: '',
					conversationId,
					isStreaming: false,
					tool: this.buildToolBroadcastPayload(toolName, { input: args, output }, 'success'),
				});
				if (toolName === 'deploy_space') {
					await this.handleDeploySpaceOutput(output);
				} else {
					await this.maybeMirrorFile(toolName, args, seenWrittenFiles);
				}
				return;
			}
			case 'tool-output-error': {
				const { toolCallId, errorText } = chunk as { toolCallId: string; errorText: string };
				const toolName = toolNames.get(toolCallId) || 'tool';
				const args = toolInputs.get(toolCallId) || {};
				this.broadcast(WebSocketMessageResponses.CONVERSATION_RESPONSE, {
					message: '',
					conversationId,
					isStreaming: false,
					tool: this.buildToolBroadcastPayload(toolName, { input: args, error: errorText }, 'error'),
				});
				return;
			}
			default:
				return;
		}
	}

	private buildToolBroadcastPayload(
		toolName: string,
		state: { input?: Record<string, unknown>; output?: unknown; error?: string } | undefined,
		status: 'start' | 'success' | 'error',
	): { name: string; status: 'start' | 'success' | 'error'; args?: Record<string, unknown>; result?: string } {
		const payload: { name: string; status: 'start' | 'success' | 'error'; args?: Record<string, unknown>; result?: string } = {
			name: toolName,
			status,
			args: state?.input,
		};
		if (status === 'success') {
			if (typeof state?.output === 'string') payload.result = state.output;
			else if (state?.output !== undefined) payload.result = JSON.stringify(state.output);
		} else if (status === 'error') {
			if (typeof state?.error === 'string') payload.result = state.error;
		}
		return payload;
	}

	private async maybeMirrorFile(
		toolName: string,
		args: Record<string, unknown>,
		seen: Set<string>,
	): Promise<void> {
		if (!isFileWriteTool(toolName)) return;
		const filePath = pickStringField(args, 'path', 'filePath', 'file');
		if (!filePath) return;
		seen.add(filePath);

		const space = this.getSpaceStub() as unknown as {
			readFile: (path: string, opts?: { offset?: number; limit?: number }) => Promise<string>;
		};
		let contents = '';
		try {
			contents = await space.readFile(filePath);
		} catch {
			contents = pickStringField(args, 'content', 'contents', 'new_string') || '';
		}

		try {
			const saved = await this.fileManager.saveGeneratedFile(
				{ filePath, fileContents: contents, filePurpose: 'Generated by think' },
				undefined,
				true,
			);
			this.broadcast(WebSocketMessageResponses.FILE_GENERATED, {
				message: `Updated ${filePath}`,
				file: saved,
			});
		} catch (e) {
			this.logger.warn('Failed to mirror think file write', { filePath, e });
		}
	}

	/**
	 * The model deployed the SpaceDO itself via the `deploy_space` tool. Reflect
	 * that into VibeSDK: parse the tool's JSON result, and on success surface the
	 * preview to the FE (the same `DEPLOYMENT_COMPLETED { previewURL }` event
	 * `deployCurrentBranch` emits). On a reported build error, emit
	 * `DEPLOYMENT_FAILED`.
	 */
	private async handleDeploySpaceOutput(output: unknown): Promise<void> {
		let parsed: Record<string, unknown> | undefined;
		if (typeof output === 'string') {
			try { parsed = JSON.parse(output) as Record<string, unknown>; } catch { parsed = undefined; }
		} else if (output && typeof output === 'object') {
			parsed = output as Record<string, unknown>;
		}

		if (parsed && typeof parsed.error === 'string') {
			this.broadcast(WebSocketMessageResponses.DEPLOYMENT_FAILED, { error: parsed.error });
			return;
		}

		const commitHash = parsed && typeof parsed.commit_hash === 'string' ? parsed.commit_hash : undefined;
		if (commitHash) {
			this.setState({ ...this.state, lastDeployedCommit: commitHash });
		}
		try {
			const url = await this.getBrowserPreviewURL();
			this.broadcast(WebSocketMessageResponses.DEPLOYMENT_COMPLETED, { previewURL: url });
		} catch (e) {
			this.logger.warn('Failed to surface preview after deploy_space', e);
		}
	}

	private async deployCurrentBranch(): Promise<string | null> {
		try {
			const space = this.getSpaceStub() as unknown as {
				gitCommit: (msg: string, author?: { name: string; email: string }) => Promise<{ sha?: string }>;
				deploy: (branch: string) => Promise<{ preview_url?: string; commit_hash?: string }>;
			};
			const branch = this.state.currentBranch || 'main';
			this.broadcast(WebSocketMessageResponses.DEPLOYMENT_STARTED, {});

			// SpaceDO.deploy reads files from the committed git branch, so commit
			// the working-tree changes the ThinkAgent's tools just made first.
			try {
				await space.gitCommit('chore: think turn changes');
			} catch (e) {
				this.logger.debug('gitCommit before deploy (no-op or failed)', e);
			}

			const result = await space.deploy(branch);
			if (result?.commit_hash) {
				this.setState({ ...this.state, lastDeployedCommit: result.commit_hash });
			}

			const url = await this.getBrowserPreviewURL();
			this.broadcast(WebSocketMessageResponses.DEPLOYMENT_COMPLETED, { previewURL: url });
			return url;
		} catch (e) {
			this.logger.warn('SpaceDO.deploy failed', e);
			this.broadcast(WebSocketMessageResponses.DEPLOYMENT_FAILED, {
				error: e instanceof Error ? e.message : String(e),
			});
			return null;
		}
	}

	// Cloudflare deploy is a no-op for think in MVP — previews already run on
	// Workers via SpaceDO's worker_loaders.
	async deployToCloudflare(_target?: DeploymentTarget): Promise<null> {
		return null;
	}
}

// ───────────────────────────── helpers ─────────────────────────────

function pickStringField(obj: Record<string, unknown>, ...keys: string[]): string | undefined {
	for (const k of keys) {
		const v = obj[k];
		if (typeof v === 'string' && v.length > 0) return v;
	}
	return undefined;
}

function isFileWriteTool(name: string): boolean {
	const n = name.toLowerCase();
	return n === 'write' || n === 'edit' || n === 'patch' || n === 'create' || n === 'delete';
}
