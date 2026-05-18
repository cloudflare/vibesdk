/**
 * Conversation message loader abstraction.
 *
 * Different code-generation behaviors persist chat history in different
 * backends:
 *  - `phasic` / `agentic` → the agent's SQLite-backed `full_conversations`
 *    table (managed by `CodeGeneratorAgent`).
 *  - `opencode` → the `SessionDO`'s `messages` table, written natively
 *    by the opencode runtime as it streams responses.
 *
 * `ConversationMessageLoader` lets the WebSocket boundary load and
 * mutate conversation history without knowing which backend is active.
 */
import type { ConversationMessage, ConversationState } from '../../inferutils/common';
import type { StoredMessage, StoredPart } from '@opencode-do/opencode';

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

// ── SessionDO (opencode) implementation ─────────────────────────────

interface SessionDOLike {
	getMessagesForSession(sessionId: string): Promise<StoredMessage[]> | StoredMessage[];
}

/**
 * Reads chat history from `SessionDO.getMessagesForSession` and flattens
 * each opencode message into a single VibeSDK `ConversationMessage`.
 *
 * Writes are no-ops: opencode's runtime persists every prompt and assistant
 * reply into the SessionDO `messages` table as part of its normal SSE
 * pipeline, so there is nothing for the loader to do on `append`. `clear`
 * is also a no-op for now — surfacing a "wipe session" API on SessionDO
 * is a separate change.
 */
export class SessionDOMessageLoader extends ConversationMessageLoader {
	constructor(
		private readonly stub: SessionDOLike,
		private readonly opencodeSessionId: string,
	) {
		super();
	}

	async load(): Promise<ConversationState> {
		if (!this.opencodeSessionId) {
			return { id: 'default', runningHistory: [], fullHistory: [] };
		}
		let stored: StoredMessage[] = [];
		try {
			stored = await this.stub.getMessagesForSession(this.opencodeSessionId);
		} catch {
			stored = [];
		}
		const history = stored
			.map((m) => storedMessageToConversation(m))
			.filter((m): m is ConversationMessage => m !== null);
		return {
			id: this.opencodeSessionId,
			runningHistory: history,
			fullHistory: history,
		};
	}

	async append(_message: ConversationMessage): Promise<void> {
		// no-op: SessionDO is the source of truth and is already populated
		// by opencode's prompt/streaming pipeline.
	}

	async clear(): Promise<void> {
		// no-op: SessionDO does not expose a session-wipe RPC yet.
	}
}

// ── Translation helpers ──────────────────────────────────────────────

/**
 * Collapse an opencode `StoredMessage` (which may have many `StoredPart`s
 * — text deltas, tool calls, reasoning fragments) into a single
 * VibeSDK `ConversationMessage`. We concatenate all text-bearing parts
 * and use the message id as the conversation id so user/assistant pairs
 * appear as separate turns in the chat pane.
 */
function storedMessageToConversation(message: StoredMessage): ConversationMessage | null {
	const role = message.info.role;
	if (role !== 'user' && role !== 'assistant') return null;
	const content = message.parts
		.map((p) => partToText(p))
		.filter((t) => t.length > 0)
		.join('\n')
		.trim();
	if (!content) return null;
	return {
		role,
		content,
		conversationId: message.info.id,
	};
}

function partToText(part: StoredPart): string {
	if (part.type === 'text' && typeof part.text === 'string') return part.text;
	// Skip reasoning + tool parts: streaming renders tool calls as
	// dedicated UI bubbles (via `ui.toolEvents`), and the same is true
	// on reload — content is text-only so the two views match.
	return '';
}
