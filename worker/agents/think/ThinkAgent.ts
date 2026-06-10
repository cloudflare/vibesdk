import { Think } from '@cloudflare/think';
import type { PrepareStepContext, StepConfig, Session } from '@cloudflare/think';
import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModel, ToolSet } from 'ai';
import {
	createReadTool,
	createWriteTool,
	createEditTool,
	createListTool,
	createFindTool,
	createGrepTool,
	createDeleteTool,
} from '@cloudflare/think/tools/workspace';
import type { SkillSource } from 'agents/skills';
import { createSpaceWorkspaceOps, type SpaceWorkspaceStub } from './space-workspace-ops';
import { selectSystemPrompt, PROMPT_MAX_STEPS } from './prompts';
import { createThinkSkillSource } from './skills';
import { createBrowserConsoleLogsTool } from './browser-logs-tool';
import { createDeploySpaceTool } from './deploy-tool';

/**
 * Per-instance configuration pushed into a {@link ThinkAgent} by the host
 * `ThinkCodingBehavior` (which runs in the main worker and therefore has access
 * to VibeSDK's model-config + AI Gateway plumbing). Plain JSON only — it crosses
 * the DO RPC boundary and is persisted via Think's `configure()`/`getConfig()`.
 */
export interface ThinkAgentConfig {
	/** Owner — used for usage attribution / logging. */
	userId: string;
	/**
	 * Fully-resolved model coordinates. The behavior computes these from the
	 * user's `ModelConfig` + AGENT_CONFIG via `getConfigurationForModel`, so
	 * `getModel()` here is a thin `@ai-sdk/openai` provider over the same
	 * AI Gateway `/compat` endpoint the rest of the platform uses.
	 */
	model: {
		baseURL: string;
		apiKey: string;
		modelName: string;
		headers?: Record<string, string>;
		/**
		 * When true, the AI Gateway holds the provider keys (BYOK / stored
		 * keys). In that mode the request must carry only `cf-aig-authorization`
		 * and must NOT send a provider `Authorization` header — otherwise the
		 * forwarded value overrides the gateway's stored key and the provider
		 * rejects it. `getModel()` strips `Authorization` when this is set.
		 */
		useStoredKeys?: boolean;
	};
	/** Builder system prompt (assembled host-side; falls back to a default). */
	systemPrompt?: string;
	/**
	 * Current preview URL (computed host-side via `getBrowserPreviewURL`), used
	 * as the default target for the `get_browser_console_logs` tool.
	 */
	previewUrl?: string;
}

const DEFAULT_SYSTEM_PROMPT =
	'You are an expert Cloudflare full-stack engineer building deployable web apps. ' +
	'Use the workspace tools to read, write and edit files in the project. Keep changes ' +
	'minimal and runnable.';

/** Extracts the Gemini thought signature from a `tool_calls[]` entry, if any. */
function getThoughtSignature(call: unknown): string | undefined {
	const sig = (call as { extra_content?: { google?: { thought_signature?: unknown } } })
		?.extra_content?.google?.thought_signature;
	return typeof sig === 'string' ? sig : undefined;
}

/**
 * Google's OpenAI-compatible streaming omits the `index` field on each
 * `tool_calls` delta, but the OpenAI provider's chunk schema requires it
 * (`choices[].delta.tool_calls[].index` must be a number). Patch each parsed
 * SSE `data:` line so the AI SDK's zod validation passes, assigning the array
 * position when `index` is absent. Also harvest each tool call's Gemini
 * `thought_signature` (keyed by tool-call id) via `onSignature`, so it can be
 * replayed on later turns (Gemini 3 rejects function-call history that drops
 * it — `400 INVALID_ARGUMENT`).
 */
function patchToolCallChunk(
	json: Record<string, unknown>,
	onSignature: (id: string, signature: string) => void,
): Record<string, unknown> {
	const choices = json.choices;
	if (!Array.isArray(choices)) return json;
	for (const choice of choices) {
		const delta = (choice as { delta?: { tool_calls?: unknown } }).delta;
		const toolCalls = delta?.tool_calls;
		if (!Array.isArray(toolCalls)) continue;
		toolCalls.forEach((call, i) => {
			if (call && typeof call === 'object' && (call as { index?: unknown }).index == null) {
				(call as { index: number }).index = i;
			}
			const id = (call as { id?: unknown })?.id;
			const sig = getThoughtSignature(call);
			if (typeof id === 'string' && sig) onSignature(id, sig);
		});
	}
	return json;
}

/**
 * Rewrites an SSE response body, applying {@link patchToolCallChunk} to each
 * `data:` event. Buffers across network chunks so split JSON lines parse
 * correctly. Non-JSON lines (e.g. `data: [DONE]`) pass through untouched.
 */
function fixToolCallStream(
	body: ReadableStream<Uint8Array>,
	onSignature: (id: string, signature: string) => void,
): ReadableStream<Uint8Array> {
	const decoder = new TextDecoder();
	const encoder = new TextEncoder();
	let buffer = '';
	const transformLine = (line: string): string => {
		const trimmed = line.trimStart();
		if (!trimmed.startsWith('data:')) return line;
		const payload = trimmed.slice(5).trim();
		if (!payload || payload === '[DONE]') return line;
		try {
			const json = JSON.parse(payload) as Record<string, unknown>;
			return `data: ${JSON.stringify(patchToolCallChunk(json, onSignature))}`;
		} catch {
			return line;
		}
	};
	return body.pipeThrough(
		new TransformStream<Uint8Array, Uint8Array>({
			transform(chunk, controller) {
				buffer += decoder.decode(chunk, { stream: true });
				const lines = buffer.split('\n');
				buffer = lines.pop() ?? '';
				for (const line of lines) {
					controller.enqueue(encoder.encode(`${transformLine(line)}\n`));
				}
			},
			flush(controller) {
				if (buffer) controller.enqueue(encoder.encode(transformLine(buffer)));
			},
		}),
	);
}

/**
 * ThinkAgent — the `@cloudflare/think` harness. It owns the agentic loop
 * (model ↔ tools), message persistence and streaming; its file tools operate
 * on the companion SpaceDO (the preview source of truth) rather than Think's
 * default DO-SQLite workspace.
 */
export class ThinkAgent extends Think<Env> {
	/** Step budget per turn (Think's default is 10). */
	override maxSteps = 25;
	/** SpaceDO has no shell; expose only the explicit file tools. */
	override workspaceBash = false;

	/**
	 * Gemini thought signatures harvested from streamed tool calls, keyed by
	 * tool-call id. Re-injected into outgoing request history (the AI SDK drops
	 * the `extra_content` Google requires for multi-step function calling).
	 */
	private readonly thoughtSignatures = new Map<string, string>();

	/**
	 * Re-attach harvested Gemini `thought_signature`s to the `tool_calls` in an
	 * outgoing request body, keyed by tool-call id. No-op if we have none or the
	 * body isn't the expected chat-completions JSON.
	 */
	private injectThoughtSignatures(bodyText: string): string {
		if (this.thoughtSignatures.size === 0) return bodyText;
		let json: { messages?: unknown };
		try {
			json = JSON.parse(bodyText);
		} catch {
			return bodyText;
		}
		const messages = json.messages;
		if (!Array.isArray(messages)) return bodyText;
		let changed = false;
		for (const message of messages) {
			const toolCalls = (message as { tool_calls?: unknown })?.tool_calls;
			if (!Array.isArray(toolCalls)) continue;
			for (const call of toolCalls) {
				const id = (call as { id?: unknown })?.id;
				if (typeof id !== 'string') continue;
				if (getThoughtSignature(call)) continue;
				const sig = this.thoughtSignatures.get(id);
				if (!sig) continue;
				const c = call as { extra_content?: { google?: Record<string, unknown> } };
				c.extra_content = {
					...(c.extra_content ?? {}),
					google: { ...(c.extra_content?.google ?? {}), thought_signature: sig },
				};
				changed = true;
			}
		}
		return changed ? JSON.stringify(json) : bodyText;
	}

	private requireConfig(): ThinkAgentConfig {
		const cfg = this.getConfig<ThinkAgentConfig>();
		if (!cfg) {
			throw new Error('ThinkAgent has not been configured yet (call configureVibe first)');
		}
		return cfg;
	}

	private getSpaceStub(): SpaceWorkspaceStub {
		// One space per session: the SpaceDO is always keyed by this session's
		// (agent) id, so a session can never resolve to a different space.
		const ns = (this.env as unknown as { SPACE_DO: DurableObjectNamespace }).SPACE_DO;
		return ns.get(ns.idFromName(this.name)) as unknown as SpaceWorkspaceStub;
	}

	override getModel(): LanguageModel {
		const { model } = this.requireConfig();
		// Wrap fetch to (1) strip the provider `Authorization` header in BYOK /
		// stored-keys mode (the gateway injects the stored key; a forwarded
		// header would override it) while preserving `cf-aig-authorization`;
		// (2) patch the response SSE stream so Google's compat tool-call deltas
		// (which omit `index`) satisfy the OpenAI provider's chunk schema; and
		// (3) round-trip Gemini `thought_signature`s — harvest them from the
		// response and re-inject them into outgoing request history (the AI SDK
		// drops them, which Gemini 3 rejects with `400 INVALID_ARGUMENT`).
		const gatewayFetch: typeof fetch = async (input, init) => {
			const headers = new Headers(init?.headers);
			if (model.useStoredKeys) headers.delete('authorization');
			let body = init?.body;
			if (typeof body === 'string') body = this.injectThoughtSignatures(body);
			const res = await fetch(input as RequestInfo, { ...(init ?? {}), headers, body });
			if (!res.body) return res;
			const outHeaders = new Headers(res.headers);
			// Body length/encoding change after transforming the stream.
			outHeaders.delete('content-length');
			outHeaders.delete('content-encoding');
			return new Response(
				fixToolCallStream(res.body, (id, sig) => this.thoughtSignatures.set(id, sig)),
				{ status: res.status, statusText: res.statusText, headers: outHeaders },
			);
		};
		const provider = createOpenAI({
			baseURL: model.baseURL,
			apiKey: model.apiKey,
			headers: model.headers,
			fetch: gatewayFetch,
		});
		// Use the Chat Completions API (`/compat/chat/completions`), NOT the
		// default Responses API (`/compat/responses`). VibeSDK's AI Gateway is
		// exercised via chat-completions everywhere else; the responses path on
		// the gateway rejects auth (401 AiGatewayError) for these models.
		return provider.chat(model.modelName);
	}

	/**
	 * Register the base prompt as a context block.
	 *
	 * Think only falls back to `getSystemPrompt()` when the session has NO
	 * context blocks. Because `getSkills()` adds a skills block, that fallback
	 * never fires — so without this, the model would receive only the skill
	 * catalog and none of the file-based persona prompt or project context.
	 * Adding it as a (lazy, readonly) block makes Think render it ahead of the
	 * skills block in the assembled system prompt. The `get` closure is invoked
	 * at prompt-freeze time, so it picks up config pushed via `configureVibe`.
	 */
	override configureSession(session: Session): Session {
		return session.withContext('system', {
			description: 'Base system prompt and project context',
			provider: { get: async () => this.getSystemPrompt() },
		});
	}

	override getSystemPrompt(): string {
		const cfg = this.getConfig<ThinkAgentConfig>();
		// Base prompt is the file-based prompt selected by model
		// family; the host behavior's project/query context (`systemPrompt`) is
		// appended. Think additionally injects the skill catalog (see getSkills).
		const base = selectSystemPrompt(cfg?.model.modelName ?? '');
		const projectContext = cfg?.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;
		return `${base}\n\n${projectContext}`;
	}

	override getSkills(): SkillSource[] {
		// SKILL.md catalog. Think registers the skill-loading tool
		// and injects the catalog into the system prompt automatically.
		return [createThinkSkillSource()];
	}

	override getTools(): ToolSet {
		const ops = createSpaceWorkspaceOps(this.getSpaceStub());
		const previewUrl = this.getConfig<ThinkAgentConfig>()?.previewUrl;
		// Same names as Think's built-in workspace tools, so these SpaceDO-backed
		// versions win the tool-merge. Bash is disabled via `workspaceBash`.
		return {
			read: createReadTool({ ops }),
			write: createWriteTool({ ops }),
			edit: createEditTool({ ops }),
			list: createListTool({ ops }),
			find: createFindTool({ ops }),
			grep: createGrepTool({ ops }),
			delete: createDeleteTool({ ops }),
			// Commit + deploy the SpaceDO branch so the preview rebuilds.
			deploy_space: createDeploySpaceTool({ getStub: () => this.getSpaceStub() }),
			// Client-side debugging via a real headless browser.
			get_browser_console_logs: createBrowserConsoleLogsTool({
				env: this.env,
				defaultUrl: previewUrl,
			}),
		} as unknown as ToolSet;
	}

	/**
	 * On the final allowed step, disable tools and prime a text-only wrap-up so
	 * the turn ends with a summary instead of a truncated tool call (see
	 * `prompts/max-steps.txt`).
	 */
	override beforeStep(ctx: PrepareStepContext): StepConfig | void {
		if (ctx.stepNumber >= this.maxSteps - 1) {
			return {
				activeTools: [],
				toolChoice: 'none',
				messages: [...ctx.messages, { role: 'assistant', content: PROMPT_MAX_STEPS }],
			};
		}
	}

	/**
	 * RPC entrypoint used by `ThinkCodingBehavior` to push model/space/prompt
	 * configuration. Called once per app, when the host behavior initializes a
	 * fresh agent (each app maps to its own ThinkAgent DO — and therefore its
	 * own session — keyed by `agentId`). Persisted in Think's `think_config`
	 * table (survives hibernation), so subsequent turns resolve
	 * `getModel()`/`getTools()`.
	 *
	 * The system prompt is frozen + persisted on its first render and served
	 * from cache afterwards (see the Sessions lifecycle). Re-render it here so
	 * THIS session's prompt is (re)loaded from the freshly pushed model/project
	 * config — the `system` context block (`configureSession`) reads config
	 * lazily, so a refresh is what actually pulls it in for a new app instead of
	 * any stale cached value.
	 */
	async configureVibe(config: ThinkAgentConfig): Promise<void> {
		this.configure<ThinkAgentConfig>(config);
		try {
			await this.session?.refreshSystemPrompt();
		} catch {
			// Session may not be wired yet on the very first configure; in that
			// case the initial freezeSystemPrompt() during chat() renders with
			// this config anyway.
		}
	}
}
