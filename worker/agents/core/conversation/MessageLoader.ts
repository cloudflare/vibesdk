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

function isReasoningUIPart(part: AnyUIPart): boolean {
	return part.type === 'reasoning';
}

function toolNameOf(part: AnyUIPart): string {
	if (part.type === 'dynamic-tool') return (part as { toolName?: string }).toolName ?? 'tool';
	return part.type.startsWith('tool-') ? part.type.slice('tool-'.length) : 'tool';
}

function toolReplyContent(part: AnyUIPart): string | null {
	const p = part as { state?: string; output?: unknown; errorText?: string };
	if (p.state === 'output-available') {
		return typeof p.output === 'string' ? p.output : safeStringifyInput((p.output as Record<string, unknown>) ?? {});
	}
	if (p.state === 'output-error') {
		return p.errorText ?? '';
	}
	return null;
}

/**
 * Expand an AI-SDK `UIMessage` into ordered VibeSDK `ConversationMessage`
 * entries, preserving the true text ↔ reasoning ↔ tool interleaving so the
 * chat UI reconstructs the same sequence on reload as it showed live.
 *
 * Each assistant text/reasoning/tool part is emitted as its own message in
 * order; contiguous parts are merged back into one bubble by the frontend.
 */
function uiMessageToConversations(message: UIMessage): ConversationMessage[] {
	if (message.role === 'user') {
		const text = collectText(message);
		return text ? [{ role: 'user', content: text, conversationId: message.id }] : [];
	}
	if (message.role !== 'assistant') return [];

	const out: ConversationMessage[] = [];
	let partIndex = 0;

	for (const part of message.parts) {
		if (isReasoningUIPart(part)) {
			const reasoning = (part as { text?: string }).text ?? '';
			if (reasoning.trim().length > 0) {
				out.push({
					role: 'assistant',
					content: '',
					reasoning,
					conversationId: `${message.id}:r${partIndex}`,
				});
			}
		} else if (isToolUIPart(part)) {
			const p = part as { toolCallId?: string; input?: unknown };
			if (!p.toolCallId) { partIndex++; continue; }
			const name = toolNameOf(part);
			const toolCall: ToolCall = {
				id: p.toolCallId,
				type: 'function',
				function: {
					name,
					arguments: safeStringifyInput((p.input as Record<string, unknown>) ?? {}),
				},
			};
			out.push({
				role: 'assistant',
				content: '',
				tool_calls: [toolCall],
				conversationId: `${message.id}:a${partIndex}`,
			});
			const replyContent = toolReplyContent(part);
			if (replyContent !== null) {
				out.push({
					role: 'tool',
					name,
					tool_call_id: p.toolCallId,
					content: replyContent,
					conversationId: `${message.id}:${p.toolCallId}`,
				});
			}
		} else {
			const text = partText(part);
			if (text.trim().length > 0) {
				out.push({
					role: 'assistant',
					content: text,
					conversationId: `${message.id}:t${partIndex}`,
				});
			}
		}
		partIndex++;
	}

	return out;
}

/** Defensive `JSON.stringify` — never blow up reload on a serialization error. */
function safeStringifyInput(input: Record<string, unknown>): string {
	try {
		return JSON.stringify(input);
	} catch {
		return '{}';
	}
}
