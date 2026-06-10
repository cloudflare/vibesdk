/**
 * Conversation message loader abstraction.
 *
 * Different code-generation behaviors persist chat history in different
 * backends:
 *  - `phasic` / `agentic` → the agent's SQLite-backed `full_conversations`
 *    table (managed by `CodeGeneratorAgent`).
 *  - `think` → the `ThinkAgent` DO's message store (AI-SDK `UIMessage[]`),
 *    written natively by Think as it streams responses.
 *
 * `ConversationMessageLoader` lets the WebSocket boundary load and
 * mutate conversation history without knowing which backend is active.
 */
import type { ConversationMessage, ConversationState, ToolCall } from '../../inferutils/common';
import type { UIMessage } from 'ai';

export abstract class ConversationMessageLoader {
	abstract load(): Promise<ConversationState>;
	abstract append(message: ConversationMessage): Promise<void>;
	abstract clear(): Promise<void>;
}

// ── Local (VibeSDK SQLite) implementation ───────────────────────────

/**
 * Minimal surface the local loader needs from the host agent. Avoids a
 * hard import of `CodeGeneratorAgent` so this file stays cycle-free.
 */
export interface LocalConversationBackend {
	getConversationState(id?: string): ConversationState;
	setConversationState(state: ConversationState): void;
	addConversationMessage(message: ConversationMessage): void;
	clearConversation(): void;
}

export class LocalConversationMessageLoader extends ConversationMessageLoader {
	constructor(private readonly backend: LocalConversationBackend) {
		super();
	}

	async load(): Promise<ConversationState> {
		return this.backend.getConversationState();
	}

	async append(message: ConversationMessage): Promise<void> {
		this.backend.addConversationMessage(message);
	}

	async clear(): Promise<void> {
		this.backend.clearConversation();
	}
}

// ── ThinkAgent (think) implementation ───────────────────────────────

interface ThinkAgentLike {
	getMessages(): Promise<UIMessage[]> | UIMessage[];
	clearMessages(): Promise<void> | void;
}

/**
 * Reads chat history from `ThinkAgent.getMessages()` and expands each AI-SDK
 * `UIMessage` into one or more VibeSDK `ConversationMessage` entries, matching
 * the OpenAI-canonical shape the chat UI's reload hydration expects:
 *
 *   { role: 'assistant', content: <text>, tool_calls: [...] }
 *   { role: 'tool',      name, tool_call_id, content: <output> }
 *
 * Writes are no-ops: Think persists every prompt and assistant reply itself.
 */
export class ThinkMessageLoader extends ConversationMessageLoader {
	// The stub is resolved lazily (via `getAgentByName`, supplied by the host)
	// so the agents framework `_init` handshake runs before any RPC — a raw
	// `ns.get(idFromName())` stub leaves the message store undefined.
	constructor(private readonly resolveStub: () => Promise<ThinkAgentLike>) {
		super();
	}

	async load(): Promise<ConversationState> {
		let messages: UIMessage[] = [];
		try {
			const stub = await this.resolveStub();
			messages = await stub.getMessages();
		} catch {
			messages = [];
		}
		const history = messages.flatMap((m) => uiMessageToConversations(m));
		return { id: 'default', runningHistory: history, fullHistory: history };
	}

	async append(_message: ConversationMessage): Promise<void> {
		// no-op: ThinkAgent persists messages as part of its turn pipeline.
	}

	async clear(): Promise<void> {
		try {
			const stub = await this.resolveStub();
			await stub.clearMessages();
		} catch {
			// best-effort
		}
	}
}

// ── Translation helpers ──────────────────────────────────────────────

type AnyUIPart = UIMessage['parts'][number];

function partText(part: AnyUIPart): string {
	return part.type === 'text' && typeof (part as { text?: string }).text === 'string'
		? (part as { text: string }).text
		: '';
}

function collectText(message: UIMessage): string {
	return message.parts
		.map(partText)
		.filter((t) => t.length > 0)
		.join('\n')
		.trim();
}

/** AI-SDK tool parts are `tool-<name>` (static) or `dynamic-tool`. */
function isToolUIPart(part: AnyUIPart): boolean {
	return typeof part.type === 'string' && (part.type.startsWith('tool-') || part.type === 'dynamic-tool');
}

function toolNameOf(part: AnyUIPart): string {
	if (part.type === 'dynamic-tool') return (part as { toolName?: string }).toolName ?? 'tool';
	return part.type.startsWith('tool-') ? part.type.slice('tool-'.length) : 'tool';
}

function collectToolCalls(message: UIMessage): ToolCall[] {
	const calls: ToolCall[] = [];
	for (const part of message.parts) {
		if (!isToolUIPart(part)) continue;
		const p = part as { toolCallId?: string; input?: unknown };
		if (!p.toolCallId) continue;
		calls.push({
			id: p.toolCallId,
			type: 'function',
			function: {
				name: toolNameOf(part),
				arguments: safeStringifyInput((p.input as Record<string, unknown>) ?? {}),
			},
		});
	}
	return calls;
}

function buildToolReplies(message: UIMessage): ConversationMessage[] {
	const replies: ConversationMessage[] = [];
	for (const part of message.parts) {
		if (!isToolUIPart(part)) continue;
		const p = part as { toolCallId?: string; state?: string; output?: unknown; errorText?: string };
		if (!p.toolCallId) continue;
		let content = '';
		if (p.state === 'output-available') {
			content = typeof p.output === 'string' ? p.output : safeStringifyInput((p.output as Record<string, unknown>) ?? {});
		} else if (p.state === 'output-error') {
			content = p.errorText ?? '';
		} else {
			continue;
		}
		replies.push({
			role: 'tool',
			name: toolNameOf(part),
			tool_call_id: p.toolCallId,
			content,
			conversationId: `${message.id}:${p.toolCallId}`,
		});
	}
	return replies;
}

/**
 * Expand an AI-SDK `UIMessage` into one or more VibeSDK `ConversationMessage`
 * entries (user → text; assistant → text + tool_calls + per-tool replies).
 */
function uiMessageToConversations(message: UIMessage): ConversationMessage[] {
	if (message.role === 'user') {
		const text = collectText(message);
		return text ? [{ role: 'user', content: text, conversationId: message.id }] : [];
	}
	if (message.role !== 'assistant') return [];

	const text = collectText(message);
	const toolCalls = collectToolCalls(message);
	if (!text && toolCalls.length === 0) return [];

	const assistant: ConversationMessage = {
		role: 'assistant',
		content: text,
		conversationId: message.id,
	};
	if (toolCalls.length > 0) {
		assistant.tool_calls = toolCalls;
	}

	return [assistant, ...buildToolReplies(message)];
}

/** Defensive `JSON.stringify` — never blow up reload on a serialization error. */
function safeStringifyInput(input: Record<string, unknown>): string {
	try {
		return JSON.stringify(input);
	} catch {
		return '{}';
	}
}
