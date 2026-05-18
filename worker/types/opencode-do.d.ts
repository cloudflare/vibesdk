/**
 * Ambient module declarations for `@opencode-do/opencode`.
 *
 * The shipped package only emits JS + sourcemaps (no `.d.ts`). Until upstream
 * adds declaration emission, we declare the subset of the API surface we
 * actually consume from VibeSDK here.
 */
declare module '@opencode-do/opencode' {
	// ── Durable Object classes (DurableObject<Env> subclasses) ────
	// We treat them as opaque DO classes; access happens via the bindings.
	export const SessionDO: DurableObjectConstructor;
	export const SpaceDO: DurableObjectConstructor;

	// ── Env shape (minimum). The host worker's Env satisfies this. ─
	export interface Env {
		SESSION_DO: DurableObjectNamespace;
		SPACE_DO: DurableObjectNamespace;
		LOADER?: unknown;
		AI?: unknown;
		ANTHROPIC_API_KEY?: string;
		OPENAI_API_KEY?: string;
		GOOGLE_API_KEY?: string;
		CLOUDFLARE_ACCOUNT_ID?: string;
		CLOUDFLARE_GATEWAY_ID?: string;
		CLOUDFLARE_API_TOKEN?: string;
		CF_AIG_TOKEN?: string;
		SERVER_PASSWORD?: string;
		SERVER_USERNAME?: string;
		ENVIRONMENT?: string;
		OPENCODE_DIRECTORY?: string;
	}

	// ── Stored message types (subset, mirrors src/types.ts) ────────
	export interface ToolCallInfo {
		id: string;
		name: string;
		arguments: Record<string, unknown>;
	}

	export interface StoredPart {
		id: string;
		sessionID: string;
		messageID: string;
		type: string;
		text?: string;
		time?: { start: number; end?: number };
		reason?: string;
		cost?: number;
		tokens?: {
			input: number;
			output: number;
			reasoning: number;
			cache: { read: number; write: number };
		};
		callID?: string;
		tool?: string;
		state?: {
			status: string;
			input: Record<string, unknown>;
			raw?: string;
			title?: string;
			output?: string;
			metadata?: Record<string, unknown>;
			time?: { start: number; end?: number };
			error?: string;
		};
		metadata?: Record<string, unknown>;
		snapshot?: string;
	}

	export interface StoredMessage {
		info: {
			id: string;
			sessionID: string;
			role: 'user' | 'assistant';
			time: { created: number; completed?: number };
			agent: string;
			model?: { providerID: string; modelID: string };
			parentID?: string;
			modelID?: string;
			providerID?: string;
			mode?: string;
			path?: { cwd: string; root: string };
			cost?: number;
			tokens?: {
				total?: number;
				input: number;
				output: number;
				reasoning: number;
				cache: { read: number; write: number };
			};
			finish?: string;
			summary?: { diffs: unknown[] };
			error?: unknown;
		};
		parts: StoredPart[];
	}

	export type SessionEvent =
		| { type: 'server.connected'; properties: Record<string, unknown> }
		| { type: 'server.heartbeat'; properties: Record<string, unknown> }
		| { type: 'session.created'; properties: { sessionID: string; info: unknown } }
		| { type: 'session.updated'; properties: { sessionID: string; info: unknown } }
		| { type: 'message.created'; properties: { sessionID: string; info: StoredMessage['info'] } }
		| { type: 'message.updated'; properties: { sessionID: string; info: StoredMessage['info'] } }
		| { type: 'message.part.updated'; properties: { sessionID: string; part: StoredPart } }
		| {
				type: 'message.part.delta';
				properties: {
					sessionID: string;
					messageID: string;
					partID: string;
					/** Which field of the part is being extended (e.g. 'text'). */
					field: string;
					/** Incremental chunk to append to `field`. */
					delta: string;
				};
		  }
		| { type: 'message.completed'; properties: { sessionID: string; messageID?: string } }
		| { type: 'step.start'; properties: { sessionID: string; messageID: string } }
		| { type: 'tool.called'; properties: { sessionID: string; messageID: string; tool: ToolCallInfo } }
		| { type: 'tool.result'; properties: { sessionID: string; messageID: string; result: unknown } }
		| { type: 'error'; properties: { sessionID?: string; error: string } }
		| { type: 'done'; properties: { sessionID: string } }
		| { type: string; properties?: Record<string, unknown> };

	// ── Convenience info types (subset, opaque) ────────────────────
	export interface SessionInfo {
		id: string;
		title: string;
		[key: string]: unknown;
	}

	// ── Per-DO env overrides accepted by SessionDO.configure() ────
	export interface SessionConfigOverrides {
		ANTHROPIC_API_KEY?: string;
		OPENAI_API_KEY?: string;
		GOOGLE_API_KEY?: string;
		CLOUDFLARE_ACCOUNT_ID?: string;
		CLOUDFLARE_GATEWAY_ID?: string;
		CLOUDFLARE_API_TOKEN?: string;
		CF_AIG_TOKEN?: string;
		OPENCODE_DIRECTORY?: string;
		defaultModel?: { providerID: string; modelID: string };
		/**
		 * DO-wide fallback SpaceDO name used by any session that hasn't been
		 * explicitly attached via `attachSpace()`. Persisted in DO storage.
		 */
		defaultSpace?: string;
	}
}

// Cloudflare WorkerLoader binding type (used by SpaceDO's deploy engine).
// Workers types ship `WorkerLoader` in some versions; declare a minimal
// interface here so TypeScript accepts our bindings regardless.
interface WorkerLoader {
	get(id: string, init: () => Promise<unknown>): { getEntrypoint(): { fetch: (req: Request) => Promise<Response> } };
}

interface DurableObjectConstructor {
	new (state: DurableObjectState, env: unknown): DurableObject;
}
