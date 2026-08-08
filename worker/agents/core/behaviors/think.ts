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
import { deriveShortTitle } from '../../utils/titleGenerator';
import { PreviewType, TemplateDetails } from 'worker/services/sandbox/sandboxTypes';
import {
	buildSpacePreviewPath,
	getPreviewDomain,
	isSeparatePreviewDomain,
	resolvePreviewHost,
} from 'worker/utils/urls';
import { isDev } from 'worker/utils/envs';
import { signSpacePreviewToken } from 'worker/utils/spacePreviewToken';
import { AppService } from 'worker/database/services/AppService';
import { getConfigurationForModel } from '../../inferutils/core';
import type { ThinkAgentConfig } from '../../think/ThinkAgent';
import { withDurableObjectResetRetry } from '../../think/space-workspace-ops';
import { THINK_MODEL_CONFIG, THINK_MODEL_ID } from '../../think/model-config';
import type { BranchDeploymentBundle } from '@space-do/space';
import { CloudflareAccountService } from '../../../services/cloudflare/CloudflareAccountService';
import { deployThinkBundleToPlatform, deployThinkBundleToUserAccount } from '../../../services/deployer/think-user-deploy';
import { resolveCloudflareAccessToken } from '../../../services/rate-limit/usageChecker';
import type { CloudflareDeploymentErrorCode } from '../../../api/websocketTypes';

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

/** SpaceDO RPC surface this behavior drives (see `space/src/space/durable-object.ts`). */
type SpaceRpcStub = {
	writeFile: (path: string, content: string) => Promise<unknown>;
	readFile: (path: string, opts?: { offset?: number; limit?: number }) => Promise<string>;
	gitCommit: (
		msg: string,
		author?: { name: string; email: string },
	) => Promise<{ sha?: string }>;
	gitCommitLocal: (msg: string, author?: { name: string; email: string }) => Promise<unknown>;
	deploy: (
		branch: string,
	) => Promise<{ preview_url?: string; commit_hash?: string; error?: string; details?: string }>;
	getDeploymentBundle: (branch: string) => Promise<BranchDeploymentBundle>;
	rollbackToCommit: (branch: string, commitHash: string) => Promise<unknown>;
};

/** Subset of AI-SDK `UIMessageChunk` shapes this behavior reacts to. */
type ThinkChunk =
	| { type: 'text-delta'; id: string; delta: string }
	| { type: 'reasoning-start'; id: string }
	| { type: 'reasoning-delta'; id: string; delta: string }
	| { type: 'reasoning-end'; id: string }
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

	/**
	 * SpaceDO RPC with a single retry on "Durable Object reset" — the transient
	 * error thrown on in-flight calls when the worker version changes (deploy /
	 * dev rebuild). The stub is re-resolved so the retry hits the new instance.
	 */
	private callSpace<T>(call: (space: SpaceRpcStub) => Promise<T>): Promise<T> {
		return withDurableObjectResetRetry(
			() => this.getSpaceStub() as unknown as SpaceRpcStub,
			call,
		);
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
				title: deriveShortTitle(baseName),
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

		const configureStartedAt = performance.now();
		await this.configureThinkAgent();
		const configureDurationMs = performance.now() - configureStartedAt;

		const seedStartedAt = performance.now();
		await this.seedEmptySpace();
		const seedDurationMs = performance.now() - seedStartedAt;

		this.logger.info(
			`Think agent ${this.getAgentId()} initialized (space=${agentName})`,
			{ configureDurationMs, seedDurationMs },
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

		const modelName = THINK_MODEL_ID;
		const aiModelConfig = THINK_MODEL_CONFIG;

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
				contextSize: aiModelConfig.contextSize,
				headers: Object.keys(headers).length > 0 ? headers : undefined,
				useStoredKeys: usesStoredKeys,
			},
			systemPrompt: this.buildSystemPrompt(modelName, aiModelConfig.provider),
			previewUrl: await this.getBrowserPreviewURL(0).catch(() => undefined),
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
			'## Naming',
			'If this project does not yet have a clear name (e.g. the request is a long or vague description rather than a concise product name), call the `set_title` tool once, early, with a short human-friendly title (Title Case, under ~60 characters). Skip it if a good title already exists; do not rename on every turn.',
			'',
			'## Clarify before building',
			'If the request is underspecified or ambiguous (e.g. a one-line idea with no details on features, scope, data, or design), do NOT start writing files yet. Instead, on this turn:',
			'1. Briefly state the assumptions you would make to proceed.',
			'2. Call the `ask_questions` tool with all the concise, targeted clarifying questions you need answered. Each question can include predefined options and can allow multiple selections and/or a custom free-text answer.',
			'3. End your turn after calling `ask_questions`. Do not write/edit files or deploy until the scope is clear or the user tells you to proceed with your assumptions.',
			'If the request is already clear and specific, skip this and go straight to building.',
			'',
			'## Deploy & verify workflow (VibeSDK-specific)',
			'Once you are actively building (the scope is clear or the user confirmed), this app is previewed on Cloudflare Workers via SpaceDO — there is no shell. In a building turn, do NOT end after only writing files:',
			'1. After writing or editing files, call `deploy_space` to commit and deploy so the preview rebuilds.',
			'2. Then call `get_browser_console_logs` to inspect the running preview for client-side errors (JS exceptions, failed fetches, missing assets, hydration errors).',
			'3. If the deploy reports build errors or the console shows errors, fix the code and repeat from step 1 until the deploy succeeds and the console is clean.',
			'A building turn should finish with a successful `deploy_space` and a clean `get_browser_console_logs` check.',
			'',
			'## Commits & restore points',
			'Each commit is a restore point the user can roll back to, and YOU decide when to create them. Use the `commit` tool to snapshot a coherent unit of work with a short, descriptive message (e.g. before a risky refactor, or after finishing a feature). You do not need to `commit` right before `deploy_space` — deploying already commits. Do not commit after every tiny edit; group related changes into meaningful restore points.',
		].join('\n');
	}

	/**
	 * Bootstrap an empty SpaceDO: write a marker file and commit so the DO is
	 * instantiated with a `main` branch and a valid HEAD.
	 */
	private async seedEmptySpace(): Promise<void> {
		const marker = JSON.stringify(
			{ agentId: this.getAgentId(), createdAt: new Date().toISOString(), seededBy: 'vibesdk-think' },
			null,
			2,
		);
		try {
			await this.callSpace((space) => space.writeFile('.think/space.json', marker));
			await this.callSpace((space) => space.gitCommitLocal('chore: initialize think space'));
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

	public async getBrowserPreviewURL(previewVersionOverride?: number): Promise<string> {
		const spaceName = this.getAgentId();
		const branch = this.state.currentBranch || 'main';
		const previewBaseUrl = `${await this.getPublicOrigin()}${buildSpacePreviewPath(spaceName, branch)}`;
		// Always append a signed, branch-scoped preview token. It bootstraps the
		// path-scoped HttpOnly preview cookie on first load (so iframe sub-resources
		// authenticate), and authenticates machine clients like the headless
		// `get_browser_console_logs` browser, which carry no cookie.
		// Embed the app's current preview-token revocation epoch so a later
		// visibility toggle (which bumps it) invalidates this token.
		const previewVersion = previewVersionOverride ??
			(await new AppService(this.env).getPreviewVersion(spaceName)) ?? 0;
		const token = await signSpacePreviewToken(this.env, {
			spaceName,
			branch,
			userId: this.state.metadata.userId,
			previewVersion,
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

			// Commits (and deploys) are driven entirely by the model: it calls the
			// `commit` tool to snapshot a restore point when it decides, and
			// `deploy_space` to build/preview. The harness does neither on its own.
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
			this.broadcast(WebSocketMessageResponses.USAGE_UPDATED, {
				message: 'Usage data updated',
			});
			const disposeSymbol = (Symbol as unknown as { dispose?: symbol }).dispose;
			if (disposeSymbol) {
				const dispose = (forwarder as unknown as Record<symbol, unknown>)[disposeSymbol];
				if (typeof dispose === 'function') dispose.call(forwarder);
			}
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
			case 'reasoning-delta': {
				const delta = (chunk as { delta?: string }).delta;
				if (typeof delta === 'string' && delta.length > 0) {
					this.broadcast(WebSocketMessageResponses.CONVERSATION_RESPONSE, {
						message: '',
						conversationId,
						isStreaming: true,
						reasoning: { delta },
					});
				}
				return;
			}
			case 'reasoning-end': {
				this.broadcast(WebSocketMessageResponses.CONVERSATION_RESPONSE, {
					message: '',
					conversationId,
					isStreaming: true,
					reasoning: { done: true },
				});
				return;
			}
			case 'tool-input-start': {
				const { toolCallId, toolName } = chunk as { toolCallId: string; toolName: string };
				toolNames.set(toolCallId, toolName);
				this.broadcast(WebSocketMessageResponses.CONVERSATION_RESPONSE, {
					message: '',
					conversationId,
					isStreaming: true,
					tool: this.buildToolBroadcastPayload(toolName, undefined, 'start', toolCallId),
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
					tool: this.buildToolBroadcastPayload(toolName, { input: args, output }, 'success', toolCallId),
				});
				if (toolName === 'deploy_space') {
					await this.handleDeploySpaceOutput(output);
				} else if (toolName === 'set_title') {
					await this.handleSetTitleOutput(args, output);
				} else if (isFileDeleteTool(toolName)) {
					await this.maybeDeleteFile(toolName, args, seenWrittenFiles);
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
					tool: this.buildToolBroadcastPayload(toolName, { input: args, error: errorText }, 'error', toolCallId),
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
		id?: string,
	): { name: string; status: 'start' | 'success' | 'error'; args?: Record<string, unknown>; result?: string; id?: string } {
		const payload: { name: string; status: 'start' | 'success' | 'error'; args?: Record<string, unknown>; result?: string; id?: string } = {
			name: toolName,
			status,
			args: state?.input,
			id,
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

		let contents = '';
		try {
			contents = await this.callSpace((space) => space.readFile(filePath));
		} catch {
			contents = pickStringField(args, 'content', 'contents', 'new_string') || '';
		}

		// SpaceDO uses absolute paths (leading slash); the editor pane and the
		// FILE_GENERATING placeholder use slash-stripped paths. Mirror under the
		// stripped path so the content lands on the same file the UI displays.
		const displayPath = filePath.replace(/^\/+/, '');
		try {
			const saved = await this.fileManager.saveGeneratedFile(
				{ filePath: displayPath, fileContents: contents, filePurpose: 'Generated by think' },
				undefined,
				true,
			);
			this.broadcast(WebSocketMessageResponses.FILE_GENERATED, {
				message: `Updated ${displayPath}`,
				file: saved,
			});
		} catch (e) {
			this.logger.warn('Failed to mirror think file write', { filePath: displayPath, e });
		}
	}

	/**
	 * Mirror a SpaceDO file deletion into the editor pane: drop it from
	 * FileManager and tell the FE to remove it from the file list. Without this,
	 * a file deleted by the model lingers in the tree even though it is gone from
	 * the workspace and the preview.
	 */
	private async maybeDeleteFile(
		toolName: string,
		args: Record<string, unknown>,
		seen: Set<string>,
	): Promise<void> {
		if (!isFileDeleteTool(toolName)) return;
		const filePath = pickStringField(args, 'path', 'filePath', 'file');
		if (!filePath) return;
		// SpaceDO uses absolute paths; the editor pane uses slash-stripped paths.
		const displayPath = filePath.replace(/^\/+/, '');
		seen.delete(filePath);
		try {
			this.fileManager.deleteFiles([displayPath]);
			this.broadcast(WebSocketMessageResponses.FILE_DELETED, {
				filePath: displayPath,
			});
		} catch (e) {
			this.logger.warn('Failed to mirror think file delete', { filePath: displayPath, e });
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

	/**
	 * Restore the SpaceDO to a prior commit and redeploy. Driven by the FE
	 * "Rollback" control on a commit/deploy tool event. Refuses while a
	 * generation turn is active, then reuses `handleDeploySpaceOutput` so the
	 * preview + deploy status surface exactly like a model-driven deploy.
	 */
	async rollbackToCommit(commitHash: string): Promise<void> {
		const hash = (commitHash ?? '').trim();
		if (!hash) {
			this.broadcast(WebSocketMessageResponses.DEPLOYMENT_FAILED, { error: 'Missing commit hash for rollback' });
			return;
		}
		if (this.isCodeGenerating()) {
			this.broadcast(WebSocketMessageResponses.DEPLOYMENT_FAILED, {
				error: 'Cannot roll back while a turn is in progress. Stop generation first.',
			});
			return;
		}

		const branch = this.state.currentBranch || 'main';
		try {
			const output = await this.callSpace((space) => space.rollbackToCommit(branch, hash));
			await this.handleDeploySpaceOutput(output);
			this.broadcast(WebSocketMessageResponses.CONVERSATION_RESPONSE, {
				message: `Rolled back to commit \`${hash.slice(0, 8)}\` and redeployed.`,
				conversationId: IdGenerator.generateConversationId(),
				isStreaming: false,
			});
		} catch (e) {
			this.logger.warn('SpaceDO.rollbackToCommit failed', e);
			this.broadcast(WebSocketMessageResponses.DEPLOYMENT_FAILED, {
				error: e instanceof Error ? e.message : String(e),
			});
		}
	}

	/**
	 * The model named the project via the `set_title` tool. Pull the chosen
	 * title from the tool output (falling back to its input), then persist it to
	 * the app state + database via {@link setTitle}.
	 */
	private async handleSetTitleOutput(
		args: Record<string, unknown>,
		output: unknown,
	): Promise<void> {
		let title: string | undefined;
		if (typeof output === 'string') {
			try {
				const parsed = JSON.parse(output) as Record<string, unknown>;
				if (typeof parsed.title === 'string') title = parsed.title;
			} catch {
				// Non-JSON output — fall back to the tool input below.
			}
		} else if (output && typeof output === 'object') {
			const parsed = output as Record<string, unknown>;
			if (typeof parsed.title === 'string') title = parsed.title;
		}
		if (!title) title = pickStringField(args, 'title');
		if (!title) return;
		await this.setTitle(title);
	}

	/**
	 * Update the project's short display title: sanitize, store it on the
	 * blueprint (drives the preview header) and persist to the app record (drives
	 * the app list). DB failures are logged, never thrown (AppService contract).
	 */
	async setTitle(title: string): Promise<void> {
		const shortTitle = deriveShortTitle(title);
		const updatedBlueprint = { ...this.state.blueprint, title: shortTitle };
		this.setState({
			...this.state,
			blueprint: updatedBlueprint,
		});
		try {
			await new AppService(this.env).updateApp(this.getAgentId(), { title: shortTitle });
		} catch (error) {
			this.logger.warn('Failed to persist project title', { title: shortTitle, error });
		}
		this.broadcast(WebSocketMessageResponses.BLUEPRINT_UPDATED, {
			message: 'Project title updated',
			updatedKeys: ['title'],
			blueprint: updatedBlueprint,
		});
	}

	private async deployCurrentBranch(): Promise<string | null> {
		try {
			const branch = this.state.currentBranch || 'main';
			this.broadcast(WebSocketMessageResponses.DEPLOYMENT_STARTED, {});

			// SpaceDO.deploy reads files from the committed git branch, so commit
			// the working-tree changes the ThinkAgent's tools just made first.
			try {
				await this.callSpace((space) => space.gitCommit('chore: think turn changes'));
			} catch (e) {
				this.logger.debug('gitCommit before deploy (no-op or failed)', e);
			}

			const result = await this.callSpace((space) => space.deploy(branch));

			// SpaceDO.deploy reports build/config failures in the payload rather
			// than throwing (and still fills in preview_url). Surface those as a
			// real deployment failure so the FE/agent sees the build error (e.g.
			// a syntax error in the generated code) instead of a broken preview.
			if (result?.error) {
				const message = result.details ? `${result.error}: ${result.details}` : result.error;
				this.logger.warn('SpaceDO.deploy reported a build failure', { branch, error: message });
				this.broadcast(WebSocketMessageResponses.DEPLOYMENT_FAILED, { error: message });
				return null;
			}

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

	async deployToCloudflare(
		target: DeploymentTarget = 'user',
	): Promise<{ deploymentUrl?: string; workersUrl?: string } | null> {
		const userAccountDeployEnabled = this.env.ENABLE_USER_ACCOUNT_DEPLOY === 'true';

		if (!userAccountDeployEnabled) {
			return this.deployThinkAppToPlatform();
		}

		if (target !== 'user') {
			this.broadcast(WebSocketMessageResponses.CLOUDFLARE_DEPLOYMENT_ERROR, {
				message: 'Think apps can only be deployed to your Cloudflare account',
				error: `Unsupported deployment target "${target}"`,
				instanceId: this.getAgentId(),
			});
			return null;
		}

		const instanceId = this.getAgentId();
		let gateCode: CloudflareDeploymentErrorCode | undefined;
		this.broadcast(WebSocketMessageResponses.CLOUDFLARE_DEPLOYMENT_STARTED, {
			message: 'Starting deployment to your Cloudflare account...',
			instanceId,
		});
		try {
			const token = await resolveCloudflareAccessToken(
				this.env,
				this.state.metadata.userId,
				this.state.cloudflareToken,
				this.state.wsOrigin,
			);
			if (token.refreshedBlob) {
				this.setState({ ...this.state, cloudflareToken: token.refreshedBlob });
			}
			if (!token.accessToken) {
				gateCode = 'cloudflare_not_connected';
				throw new Error('Reconnect Cloudflare to grant Worker deployment access');
			}

			// Deploying only needs an account ID — no AI Gateway selection.
			// getDeployAccount falls back to the user's sole connected account
			// and only returns null when the target account is ambiguous.
			const account = await new CloudflareAccountService(this.env)
				.getDeployAccount(this.state.metadata.userId);
			if (!account) {
				gateCode = 'cloudflare_not_configured';
				throw new Error('Select a Cloudflare account in Settings before deploying');
			}

			const branch = this.state.currentBranch || 'main';
			try {
				await this.callSpace((space) => space.gitCommit('deploy: publish to user account'));
			} catch (error) {
				this.logger.debug('No new workspace changes to commit before publishing', error);
			}
			const bundle = await this.callSpace((space) => space.getDeploymentBundle(branch));
			const result = await deployThinkBundleToUserAccount({
				accountId: account.accountId,
				accessToken: token.accessToken,
				appName: this.state.blueprint.title || this.state.projectName || `vibe-${instanceId}`,
				bundle,
			});
			await new AppService(this.env).updateDeploymentId(instanceId, result.deploymentId);
			this.setState({ ...this.state, cloudflareDeploymentUrl: result.deploymentUrl });
			this.broadcast(WebSocketMessageResponses.CLOUDFLARE_DEPLOYMENT_COMPLETED, {
				message: 'Successfully deployed to your Cloudflare account',
				instanceId,
				deploymentUrl: result.deploymentUrl,
				workersUrl: result.deploymentUrl,
			});
			return { deploymentUrl: result.deploymentUrl, workersUrl: result.deploymentUrl };
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.logger.error('Think user-account deployment failed', error);
			this.broadcast(WebSocketMessageResponses.CLOUDFLARE_DEPLOYMENT_ERROR, {
				message: 'Deployment failed',
				instanceId,
				error: message,
				...(gateCode ? { code: gateCode } : {}),
			});
			return null;
		}
	}

	/**
	 * Default think deploy when `ENABLE_USER_ACCOUNT_DEPLOY` is off: publish the
	 * SpaceDO bundle to the platform's dispatch namespace with platform creds.
	 */
	private async deployThinkAppToPlatform(): Promise<{ deploymentUrl?: string; workersUrl?: string } | null> {
		const instanceId = this.getAgentId();
		this.broadcast(WebSocketMessageResponses.CLOUDFLARE_DEPLOYMENT_STARTED, {
			message: 'Starting deployment to Cloudflare Workers...',
			instanceId,
		});
		try {
			const accountId = this.env.CLOUDFLARE_ACCOUNT_ID;
			const apiToken = this.env.CLOUDFLARE_API_TOKEN;
			if (!accountId || !apiToken) {
				throw new Error('CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN must be set in environment');
			}
			const dispatchNamespace = (this.env as unknown as { DISPATCH_NAMESPACE?: string })
				.DISPATCH_NAMESPACE;
			if (!dispatchNamespace) {
				throw new Error('DISPATCH_NAMESPACE not found in environment variables, cannot deploy without dispatch namespace');
			}

			const branch = this.state.currentBranch || 'main';
			try {
				await this.callSpace((space) => space.gitCommit('deploy: publish to platform'));
			} catch (error) {
				this.logger.debug('No new workspace changes to commit before publishing', error);
			}
			const bundle = await this.callSpace((space) => space.getDeploymentBundle(branch));
			const result = await deployThinkBundleToPlatform({
				accountId,
				apiToken,
				dispatchNamespace,
				previewDomain: getPreviewDomain(this.env),
				appName: this.state.blueprint.title || this.state.projectName || `vibe-${instanceId}`,
				bundle,
			});
			await new AppService(this.env).updateDeploymentId(instanceId, result.deploymentId);
			this.setState({ ...this.state, cloudflareDeploymentUrl: result.deploymentUrl });
			this.broadcast(WebSocketMessageResponses.CLOUDFLARE_DEPLOYMENT_COMPLETED, {
				message: 'Successfully deployed to Cloudflare Workers',
				instanceId,
				deploymentUrl: result.deploymentUrl,
				workersUrl: result.deploymentUrl,
			});
			return { deploymentUrl: result.deploymentUrl, workersUrl: result.deploymentUrl };
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.logger.error('Think platform deployment failed', error);
			this.broadcast(WebSocketMessageResponses.CLOUDFLARE_DEPLOYMENT_ERROR, {
				message: 'Deployment failed',
				instanceId,
				error: message,
			});
			return null;
		}
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
	return n === 'write' || n === 'edit' || n === 'patch' || n === 'create';
}

function isFileDeleteTool(name: string): boolean {
	const n = name.toLowerCase();
	return n === 'delete' || n === 'rm' || n === 'remove';
}
