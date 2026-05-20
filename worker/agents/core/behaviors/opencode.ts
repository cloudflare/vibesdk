import { OpencodeState } from '../state';
import { AgentInitArgs } from '../types';
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
import type { SessionEvent, SessionConfigOverrides, StoredMessage, StoredPart } from '@opencode-do/opencode';
import { DeploymentTarget } from '../types';
import { resolvePreviewHost } from 'worker/utils/urls';
import { isDev } from 'worker/utils/envs';

/**
 * Default opencode model. Matches the Gemini 3 Flash Preview used by
 * VibeSDK's agentic profile (`@/worker/agents/inferutils/config.ts`), so
 * opencode runs hit the same gateway-routed model as the rest of the
 * platform. The model is sent with every prompt so the SessionDO
 * doesn't have to fall back to its internal default.
 */
const OPENCODE_DEFAULT_MODEL = {
    providerID: 'google',
    modelID: 'gemini-3-flash-preview',
} as const;

/** Narrow shape used to call `SessionDO.configure()` via DO RPC. */
type ConfigurableSession = {
    configure: (overrides: SessionConfigOverrides) => Promise<unknown>;
};

/**
 * OpencodeCodingBehavior — third code-gen behavior, backed by
 * `@opencode-do/opencode`'s SessionDO + SpaceDO.
 *
 * Responsibilities:
 * - Owns one `SessionDO` (session id stored in state) and one `SpaceDO`
 *   (named by agentId) per app.
 * - Pushes gateway/provider credentials and the default model into the
 *   shared SessionDO once via `configure()`.
 * - Submits prompts via `POST /session/:id/message` (DO fetch) and
 *   consumes the resulting SSE event stream directly to drive the UI —
 *   no parallel RPC/completion shim.
 * - File mutations performed by opencode tools (write/edit/delete) are
 *   mirrored into `FileManager.saveGeneratedFile(s)` so the editor pane
 *   stays in sync with the SpaceDO workspace.
 *
 * Preview/deployment is delegated to SpaceDO's `/preview/:branch` route —
 * the Container sandbox is not used.
 */
export class OpencodeCodingBehavior
    extends BaseCodingBehavior<OpencodeState>
    implements ICodingAgent {
    protected static readonly PROJECT_NAME_PREFIX_MAX_LENGTH = 20;

    override getBehavior(): 'opencode' { return 'opencode'; }

    /** Active SSE consumer abort signal (per build cycle). */
    private sseAbort?: AbortController;

    // ──────────────────────────────────────────────────────────────
    // Helpers — DO stubs

    private getSessionStub(): DurableObjectStub {
        const ns = (this.env as unknown as { SESSION_DO: DurableObjectNamespace }).SESSION_DO;
        return ns.get(ns.idFromName('main'));
    }

    private getSpaceStub(): DurableObjectStub {
        const ns = (this.env as unknown as { SPACE_DO: DurableObjectNamespace }).SPACE_DO;
        return ns.get(ns.idFromName(this.state.spaceName || this.getAgentId()));
    }

    // ──────────────────────────────────────────────────────────────
    // Initialize

    async initialize(
        initArgs: AgentInitArgs<OpencodeState>,
        ..._args: unknown[]
    ): Promise<OpencodeState> {
        await super.initialize(initArgs);
        // Opencode projects are template-free: SpaceDO + the `cloudflare-bundler-apps`
        // skill own the scaffolding entirely. We intentionally ignore `templateInfo`
        // even when callers pass it.
        const { query, hostname, inferenceContext, sandboxSessionId } = initArgs;

        const baseName = (query || 'project').toString();
        const projectName = generateProjectName(
            baseName,
            generateNanoId(),
            OpencodeCodingBehavior.PROJECT_NAME_PREFIX_MAX_LENGTH,
        );

        // `this.getAgentId()` reads from `state.metadata.agentId`, which is
        // not yet populated at this point (we set it via `setState(...)`
        // a few lines down). Pull the canonical id from `inferenceContext`
        // — same value, but available immediately.
        const spaceName = inferenceContext.metadata.agentId;

        // Per upstream README: workspace tools resolve the working space
        // from session context (no `space` argument). The binding worker
        // is responsible for `attachSpace(sessionId, name)` after session
        // creation; the SpaceDO itself auto-initialises on first tool
        // call.
        const sessionStub = this.getSessionStub() as unknown as {
            attachSpace: (sessionId: string, name: string) => Promise<void> | void;
            createSessionAndBroadcast: (
                id?: string,
                title?: string,
            ) => Promise<{ id: string }>;
        };

        // Push gateway + provider creds + default model + defaultSpace
        // into the DO so subsequent prompts (including any session not
        // explicitly attached) pick them up. Persisted across DO eviction.
        await this.applySessionConfig(sessionStub as unknown as ConfigurableSession, spaceName);

        let opencodeSessionId = '';
        try {
            const session = await sessionStub.createSessionAndBroadcast(
                undefined,
                projectName,
            );
            opencodeSessionId = session.id;
        } catch (e) {
            this.logger.error('SessionDO.createSession failed', e);
            throw e;
        }

        // Bind this session to its dedicated SpaceDO. Idempotent and
        // also registers the space in `known_spaces`.
        try {
            await sessionStub.attachSpace(opencodeSessionId, spaceName);
        } catch (e) {
            this.logger.warn('SessionDO.attachSpace failed (continuing)', e);
        }

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
            templateName: 'opencode',
            sandboxInstanceId: undefined,
            commandsHistory: [],
            sessionId: sandboxSessionId!,
            hostname,
            metadata: inferenceContext.metadata,
            projectType: this.projectType,
            behaviorType: 'opencode',
            opencodeSessionId,
            spaceName,
            currentBranch: 'main',
        });

        // Deterministically materialize the SpaceDO for this app.
        // `SpaceDO.idFromName(spaceName)` returns a stub regardless of
        // whether the DO has ever run, but its tables and git repo are
        // initialised lazily on the first RPC. We force that bootstrap
        // now (and create an initial empty commit) so the space exists,
        // has a `main` branch ref, and is immediately usable by the
        // LLM's tool calls.
        // Always start with an empty SpaceDO. Layout, dependencies and entry
        // points are produced by the agent under guidance from the
        // `cloudflare-bundler-apps` skill.
        await this.seedEmptySpace();

        this.logger.info(
            `Opencode agent ${this.getAgentId()} initialized (session=${opencodeSessionId}, space=${spaceName})`,
        );
        return this.state;
    }

    /**
     * Bootstrap an empty SpaceDO. Writes a minimal `.opencode/space.json`
     * marker so subsequent `gitCommit` has something to record, then
     * commits it. This guarantees:
     *   1. The DO is instantiated (SQLite tables + `git init` ran).
     *   2. A `main` branch exists with at least one commit.
     *   3. Preview/deploy paths that walk the git ref have a valid HEAD.
     */
    private async seedEmptySpace(): Promise<void> {
        const space = this.getSpaceStub() as unknown as {
            writeFile: (path: string, content: string) => Promise<unknown>;
            gitCommit: (msg: string, author?: { name: string; email: string }) => Promise<unknown>;
        };
        const marker = JSON.stringify(
            {
                agentId: this.getAgentId(),
                createdAt: new Date().toISOString(),
                seededBy: 'vibesdk-opencode',
            },
            null,
            2,
        );
        try {
            await space.writeFile('.opencode/space.json', marker);
            await space.gitCommit('chore: initialize opencode space');
        } catch (e) {
            this.logger.warn('SpaceDO empty-seed failed (continuing)', e);
        }
    }

    /**
     * Forward VibeSDK env vars + the preferred opencode default model into
     * the SessionDO. SessionDO merges these on top of its own env, so the
     * CF gateway path (and BYOK provider keys) light up without any host
     * configuration on the opencode side.
     */
    private async applySessionConfig(stub: ConfigurableSession, defaultSpace?: string): Promise<void> {
        const env = this.env as unknown as {
            CLOUDFLARE_ACCOUNT_ID?: string;
            CLOUDFLARE_AI_GATEWAY?: string;
            CLOUDFLARE_AI_GATEWAY_TOKEN?: string;
            CLOUDFLARE_API_TOKEN?: string;
            ANTHROPIC_API_KEY?: string;
            OPENAI_API_KEY?: string;
            GOOGLE_AI_STUDIO_API_KEY?: string;
        };

        // Route through CF AI Gateway. `gatewayToken()` in opencode
        // prefers `CLOUDFLARE_API_TOKEN` over `CF_AIG_TOKEN`, but the
        // generic CF account token is not accepted by AI Gateway auth —
        // only a gateway-specific token works. We forward
        // `CLOUDFLARE_AI_GATEWAY_TOKEN` as `CF_AIG_TOKEN` and rely on the
        // host worker's env (which also provides `CLOUDFLARE_API_TOKEN`)
        // not leaking through, since `effectiveEnv` merges overrides
        // last-wins.
        const overrides: SessionConfigOverrides = {
            CLOUDFLARE_ACCOUNT_ID: env.CLOUDFLARE_ACCOUNT_ID,
            CLOUDFLARE_GATEWAY_ID: env.CLOUDFLARE_AI_GATEWAY,
            CF_AIG_TOKEN: env.CLOUDFLARE_AI_GATEWAY_TOKEN,
            // Pin the default model so any session created on this DO
            // (including those that don't pass `model` per prompt)
            // resolves to the gateway-routed Gemini Flash. Without this
            // the SessionDO falls back to upstream's default
            // (`anthropic/claude-sonnet-4-…`) which opencode's
            // Anthropic-gateway path doesn't auth correctly.
            defaultModel: { providerID: OPENCODE_DEFAULT_MODEL.providerID, modelID: OPENCODE_DEFAULT_MODEL.modelID },
            // DO-wide fallback so even an un-attached session lands in
            // this agent's SpaceDO (defence-in-depth — `attachSpace` is
            // also called per session in `initialize`).
            ...(defaultSpace ? { defaultSpace } : {}),
        };

        try {
            await stub.configure(overrides);
        } catch (e) {
            this.logger.warn('SessionDO.configure failed (continuing with host env)', e);
        }
    }

    // ──────────────────────────────────────────────────────────────
    // Generation orchestration

    /**
     * Opencode uses SpaceDO's preview engine; no sandbox deploy needed.
     */
    async deployToSandbox(): Promise<PreviewType | null> {
        return null;
    }

    /**
     * The public-facing origin (scheme + host) that user-visible URLs
     * (preview links, deploy responses) should point at. Used both by
     * `getBrowserPreviewURL` and as the `Request.url` we send when
     * RPC-fetching the SessionDO, so opencode's deploy tool prepends a
     * reachable host (not the previous internal-only
     * `https://opencode-internal`) to its `preview_url` field.
     */
    private getPublicOrigin(): string {
        if (isDev(this.env)) return 'http://localhost:5173';
        const host = resolvePreviewHost(this.env, this.state.wsOrigin);
        return `https://${host}`;
    }

    /**
     * Browser preview URL for SpaceDO-served HTML. Falls back to the main
     * worker route `/space/<spaceName>/preview/<branch>/`.
     *
     * In production we resolve the host from the frontend-supplied
     * origin first (captured at WS upgrade) so the URL reflects the
     * actual domain the user is on; in dev we keep `localhost:5173`
     * so the iframe matches the running dev server.
     */
    public getBrowserPreviewURL(): string {
        const spaceName = this.state.spaceName || this.getAgentId();
        const branch = encodeURIComponent(this.state.currentBranch || 'main');
        return `${this.getPublicOrigin()}/space/${spaceName}/preview/${branch}/`;
    }

    /**
     * Opencode has no template. We return a stable, empty stub so legacy
     * callers (`FileManager`, `codingAgent` reconnect handler, the
     * `AGENT_CONNECTED` payload, `GenerationContext.from`) keep working
     * without special-casing every site.
     */
    public getTemplateDetails(): TemplateDetails {
        if (!this.templateDetailsCache) {
            this.templateDetailsCache = {
                name: 'opencode',
                description: { selection: 'opencode', usage: 'opencode (template-free)' },
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
                // SpaceDO previews are served from a sub-route on the main
                // worker; 'sandbox' rendermode reuses the existing iframe path.
                renderMode: 'sandbox',
            };
        }
        return this.templateDetailsCache;
    }

    /**
     * Opencode never consults the sandbox template catalog. The base
     * implementation would try to fetch details for `templateName ===
     * 'opencode'`, which has no catalog entry, and throw. Hydrate the
     * in-memory stub instead — `CodeGeneratorAgent.onStart` calls this on
     * every DO wakeup, so this path must not error.
     */
    public override async ensureTemplateDetails(): Promise<TemplateDetails> {
        return this.getTemplateDetails();
    }

    getOperationOptions(): OperationOptions<AgenticGenerationContext> {
        // Opencode delegates code generation to SessionDO, so operations
        // declared on the base class aren't invoked here. We still need to
        // satisfy the abstract signature; synthesise a minimal agentic
        // context by casting the state.
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

    /** Main loop: drain pendingUserInputs by calling SessionDO.promptWait. */
    async build(): Promise<void> {
        // Seed the first prompt from the initial query if this is the first run.
        if (!this.isMVPGenerated() && this.state.query && this.state.pendingUserInputs.length === 0) {
            this.setState({
                ...this.state,
                pendingUserInputs: [this.state.query],
            });
        }

        while (this.state.pendingUserInputs.length > 0) {
            const pending = this.state.pendingUserInputs.slice();
            this.setState({ ...this.state, pendingUserInputs: [] });

            const compiled = pending.join('\n');
            try {
                await this.runPrompt(compiled);
            } catch (e) {
                this.logger.error('Opencode prompt failed', e);
                this.broadcast(WebSocketMessageResponses.ERROR, {
                    error: e instanceof Error ? e.message : String(e),
                });
                break;
            }

            // After first successful pass, treat MVP as generated. Followup
            // prompts arrive via handleUserInput and re-enter the loop.
            if (!this.isMVPGenerated()) {
                this.setMVPGenerated();
            }

            // Deploy current branch to refresh preview.
            await this.deployCurrentBranch();
        }
    }

    /**
     * Submit a prompt and let SSE drive every downstream UI update.
     *
     * The HTTP POST to `/session/:id/message` is a side-channel used only
     * to (a) kick off the run and (b) surface terminal errors. All visible
     * state — text deltas, tool calls, file writes, completion — comes
     * from the SSE consumer reading `/event?global=1`.
     */
    private async runPrompt(text: string): Promise<void> {
        const conversationId = IdGenerator.generateConversationId();

        // Note: user + assistant messages are persisted by opencode's
        // SessionDO as part of its native prompt pipeline. The
        // `SessionDOMessageLoader` reads them back on
        // `GET_CONVERSATION_STATE`, so we no longer mirror them into the
        // local agent SQLite tables.

        this.broadcast(WebSocketMessageResponses.CONVERSATION_RESPONSE, {
            message: '',
            conversationId,
            isStreaming: true,
        });

        this.sseAbort = new AbortController();
        const sseTask = this.consumeSseEvents(conversationId, this.sseAbort.signal);
        const stub = this.getSessionStub();

        // Workspace tools resolve their target space from session context
        // (set by `attachSpace` during `initialize`). No per-prompt
        // injection is required.
        try {
            // Use the real public origin (not the previous synthetic
            // `https://opencode-internal`) so opencode-side tools
            // (notably `deploy`, which prepends `ctx.host` to its
            // `preview_url`) hand the LLM URLs the user can actually
            // open in a browser.
            const res = await stub.fetch(
                `${this.getPublicOrigin()}/session/${encodeURIComponent(this.state.opencodeSessionId)}/message`,
                {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({
                        parts: [{ type: 'text', text }],
                        agent: 'build',
                        model: OPENCODE_DEFAULT_MODEL,
                    }),
                },
            );
            const payload = (await res.json().catch(() => null)) as
                | { error?: string }
                | StoredMessage
                | null;
            if (payload && typeof payload === 'object' && 'error' in payload && payload.error) {
                throw new Error(payload.error);
            }
        } finally {
            this.sseAbort?.abort();
            await sseTask.catch(() => { });
            // No safety-net broadcast here: the FE's non-streaming
            // branch *replaces* message content with whatever string we
            // send, so an empty fallback would wipe everything that
            // streamed in. The `message.updated finish` handler already
            // emits the terminal `isStreaming: false` with the right
            // text; for the very rare case where the run ends without
            // any finish event (network blip pre-first-token), the FE's
            // streaming indicator naturally stops once no more deltas
            // arrive.
        }
    }

    /**
     * Open SessionDO's SSE stream via DO fetch and translate events into
     * VibeSDK WebSocket events.
     */
    private async consumeSseEvents(conversationId: string, signal: AbortSignal): Promise<void> {
        const stub = this.getSessionStub();
        const seenWrittenFiles = new Set<string>();
        // Keyed by part id — tracks tool parts we've already emitted a
        // `start` event for, so we don't broadcast it twice as opencode
        // bumps the part through `pending → running → completed`.
        const seenToolStarts = new Set<string>();
        // Accumulated assistant text seen across all `message.part.delta`
        // events for this prompt. Used as the canonical `message` payload
        // when we emit the terminal `isStreaming: false` broadcast — the
        // FE's non-streaming branch replaces content, so sending an empty
        // string here would blank out everything that streamed in.
        const accumulated = { text: '' };
        let response: Response;
        try {
            response = await stub.fetch(`${this.getPublicOrigin()}/event?global=1`, { signal });
        } catch (e) {
            this.logger.warn('SessionDO SSE fetch failed', e);
            return;
        }
        if (!response.body) return;

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        try {
            while (!signal.aborted) {
                const { value, done } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });

                // SSE frames are separated by blank lines.
                let idx: number;
                while ((idx = buffer.indexOf('\n\n')) !== -1) {
                    const frame = buffer.slice(0, idx);
                    buffer = buffer.slice(idx + 2);
                    const dataLine = frame
                        .split('\n')
                        .find((l) => l.startsWith('data:'));
                    if (!dataLine) continue;
                    const payload = dataLine.slice(5).trim();
                    if (!payload) continue;
                    try {
                        const parsed = JSON.parse(payload);
                        // /event?global=1 wraps as { directory, payload }.
                        const event: SessionEvent =
                            parsed && typeof parsed === 'object' && 'payload' in parsed
                                ? (parsed as { payload: SessionEvent }).payload
                                : (parsed as SessionEvent);
                        await this.translateEvent(event, conversationId, seenWrittenFiles, seenToolStarts, accumulated);
                    } catch {
                        // Ignore malformed frames.
                    }
                }
            }
        } catch (e) {
            if (!signal.aborted) {
                this.logger.debug('SSE consumer ended', e);
            }
        } finally {
            try {
                reader.releaseLock();
            } catch {
                // Reader already released — ignore.
            }
        }
    }

    private async translateEvent(
        event: SessionEvent,
        conversationId: string,
        seenWrittenFiles: Set<string>,
        seenToolStarts: Set<string>,
        accumulated: { text: string },
    ): Promise<void> {
        // Only react to events for our session.
        const props = (event && (event as { properties?: Record<string, unknown> }).properties) || {};
        const sessionId =
            (props as Record<string, unknown>).sessionID ??
            (props as Record<string, unknown>).sessionId;
        if (sessionId && sessionId !== this.state.opencodeSessionId) return;

        switch (event.type) {
            case 'message.part.delta': {
                // Incremental text delta. Payload shape (per upstream
                // `Message.Event.PartDelta`):
                //   { sessionID, messageID, partID, field, delta }
                // `field` indicates which property of the part is being
                // extended (typically `"text"`); we only forward text
                // deltas to the chat — reasoning/tool deltas surface
                // through their own part-updated events.
                const field = (props as { field?: string }).field;
                const delta = (props as { delta?: string }).delta;
                if (field === 'text' && typeof delta === 'string' && delta.length > 0) {
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
            case 'message.part.updated': {
                const part = (props as { part: StoredPart }).part;
                if (!part) return;
                // Text parts are streamed token-by-token via
                // `message.part.delta`; the `message.part.updated`
                // version carries the same text already accumulated, so
                // re-broadcasting it would double the content the FE
                // appends. We only care about tool transitions here.
                if (part.type === 'tool' && part.state) {
                    await this.handleToolPart(part, conversationId, seenWrittenFiles, seenToolStarts);
                }
                return;
            }
            case 'message.updated': {
                // Message-level state change — includes completion (`finish`)
                // and final cost/token info. Persist + broadcast on finish.
                const info = (props as { info?: { role?: string; finish?: string; error?: { data?: { message?: string } } } }).info;
                if (!info || info.role !== 'assistant') return;
                if (info.error?.data?.message) {
                    this.broadcast(WebSocketMessageResponses.ERROR, {
                        error: info.error.data.message,
                    });
                    return;
                }
                if (info.finish) {
                    // Prefer the message snapshot when opencode sends
                    // one alongside the finish event; otherwise fall
                    // back to text we accumulated from deltas. The FE's
                    // non-streaming branch replaces content, so sending
                    // an empty string here would wipe everything that
                    // streamed in — only broadcast when we actually have
                    // text.
                    const finalMsg = (props as { message?: StoredMessage }).message;
                    const finalText =
                        (finalMsg ? extractFinalText(finalMsg) : '') || accumulated.text;
                    if (finalText) {
                        this.broadcast(WebSocketMessageResponses.CONVERSATION_RESPONSE, {
                            message: finalText,
                            conversationId,
                            isStreaming: false,
                        });
                    }
                }
                return;
            }
            case 'error': {
                const err = (props as { error?: string }).error || 'Unknown opencode error';
                this.broadcast(WebSocketMessageResponses.ERROR, { error: err });
                return;
            }
            default:
                return;
        }
    }

    private async handleToolPart(
        part: StoredPart,
        conversationId: string,
        seenWrittenFiles: Set<string>,
        seenToolStarts: Set<string>,
    ): Promise<void> {
        const toolName = part.tool || 'tool';
        const state = part.state;
        if (!state) return;

        this.logger.info('opencode tool part', {
            toolName,
            status: state.status,
            inputKeys: Object.keys(state.input || {}),
            hasError: !!state.error,
        });

        const isTerminal = state.status === 'completed' || state.status === 'success' || state.status === 'error' || !!state.error;

        // First sight of this tool part → tell the FE to render a
        // `start` event. The FE pairs this with the later `success` /
        // `error` to display the tool bubble. Deduped by part id.
        if (!isTerminal && !seenToolStarts.has(part.id)) {
            seenToolStarts.add(part.id);
            this.broadcast(WebSocketMessageResponses.CONVERSATION_RESPONSE, {
                message: '',
                conversationId,
                isStreaming: true,
                tool: this.buildToolBroadcastPayload(toolName, state, 'start'),
            });

            // For file writes, also emit FILE_GENERATING so the editor
            // pane can preview the path before the tool resolves.
            if (isFileWriteTool(toolName)) {
                const filePath = pickStringField(state.input, 'path', 'filePath', 'file');
                if (filePath && !seenWrittenFiles.has(filePath)) {
                    // Normalize for UI: opencode reports "/foo.ts"; the tree
                    // groups by `/`, so a leading slash creates an empty-named
                    // folder. Mirror the normalization done in FileManager.
                    const displayPath = filePath.replace(/^\/+/, '');
                    this.broadcast(WebSocketMessageResponses.FILE_GENERATING, {
                        message: `Writing ${displayPath}`,
                        filePath: displayPath,
                        filePurpose: 'Generated by opencode',
                    });
                }
            }
        }

        if (state.status === 'completed' || state.status === 'success') {
            this.broadcast(WebSocketMessageResponses.CONVERSATION_RESPONSE, {
                message: '',
                conversationId,
                isStreaming: false,
                tool: this.buildToolBroadcastPayload(toolName, state, 'success'),
            });
            await this.maybeMirrorFile(toolName, state.input, seenWrittenFiles);
        } else if (state.status === 'error' || state.error) {
            this.broadcast(WebSocketMessageResponses.CONVERSATION_RESPONSE, {
                message: '',
                conversationId,
                isStreaming: false,
                tool: this.buildToolBroadcastPayload(toolName, state, 'error'),
            });
        }
    }

    /**
     * Build the `tool` payload for a CONVERSATION_RESPONSE broadcast.
     *
     * Centralises the wire shape (name / status / args / result) so the
     * three call sites in `handleToolPart` (start, success, error) stay
     * tidy and don't drift apart. `args` is `state.input` for every
     * status; `result` is only meaningful in terminal states — the
     * tool's `output` on success and the captured `error` on error.
     */
    private buildToolBroadcastPayload(
        toolName: string,
        state: NonNullable<StoredPart['state']>,
        status: 'start' | 'success' | 'error',
    ): { name: string; status: 'start' | 'success' | 'error'; args?: Record<string, unknown>; result?: string } {
        const payload: { name: string; status: 'start' | 'success' | 'error'; args?: Record<string, unknown>; result?: string } = {
            name: toolName,
            status,
            args: state.input,
        };
        if (status === 'success') {
            if (typeof state.output === 'string') payload.result = state.output;
        } else if (status === 'error') {
            // Opencode places the failure description on `state.error`
            // for `ToolStateError`. Fall back to `state.output` if a
            // provider chose to surface it there instead.
            if (typeof state.error === 'string') payload.result = state.error;
            else if (typeof state.output === 'string') payload.result = state.output;
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

        // Read the new contents from SpaceDO so the FileManager sees the
        // canonical post-edit text.
        const space = this.getSpaceStub() as unknown as {
            readFile: (path: string, opts?: { offset?: number; limit?: number }) => Promise<string>;
        };
        let contents = '';
        try {
            contents = await space.readFile(filePath);
        } catch {
            // Fall back to args.content if read fails (e.g. file deleted).
            contents = pickStringField(args, 'content', 'contents', 'new_string') || '';
        }

        try {
            const saved = await this.fileManager.saveGeneratedFile(
                {
                    filePath,
                    fileContents: contents,
                    filePurpose: 'Generated by opencode',
                },
                undefined,
                true,
            );
            this.broadcast(WebSocketMessageResponses.FILE_GENERATED, {
                message: `Updated ${filePath}`,
                file: saved,
            });
        } catch (e) {
            this.logger.warn('Failed to mirror opencode file write', { filePath, e });
        }
    }

    private async deployCurrentBranch(): Promise<void> {
        try {
            const space = this.getSpaceStub() as unknown as {
                deploy: (branch: string) => Promise<{ preview_url?: string; commit_hash?: string }>;
            };
            const branch = this.state.currentBranch || 'main';
            this.broadcast(WebSocketMessageResponses.DEPLOYMENT_STARTED, {});
            const result = await space.deploy(branch);

            // SpaceDO.deploy's `preview_url` uses `this.ctx.id.name`,
            // which is unreliable when the DO was first instantiated
            // via a stub whose name wasn't carried through. We hold the
            // canonical space name in our own state, so always
            // construct the path from that.
            if (result?.commit_hash) {
                this.setState({
                    ...this.state,
                    lastDeployedCommit: result.commit_hash,
                });
            }

            const url = this.getBrowserPreviewURL();
            this.broadcast(WebSocketMessageResponses.DEPLOYMENT_COMPLETED, {
                previewURL: url,
            });
        } catch (e) {
            this.logger.warn('SpaceDO.deploy failed', e);
            this.broadcast(WebSocketMessageResponses.DEPLOYMENT_FAILED, {
                error: e instanceof Error ? e.message : String(e),
            });
        }
    }

    // ──────────────────────────────────────────────────────────────
    // Cloudflare deploy is intentionally a no-op for opencode in MVP —
    // previews already run on Workers via SpaceDO's worker_loaders.
    async deployToCloudflare(_target?: DeploymentTarget): Promise<null> {
        return null;
    }
}

// ───────────────────────────── helpers ─────────────────────────────

function extractFinalText(msg: StoredMessage): string {
    return (msg.parts || [])
        .filter((p) => p.type === 'text' && typeof p.text === 'string')
        .map((p) => p.text as string)
        .join('\n')
        .trim();
}

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
