import { toast } from 'sonner';
import { generateId } from '@/utils/id-generator';
import type { RateLimitError, ConversationMessage } from '@/api-types';

export type ToolEvent = {
    name: string;
    status: 'start' | 'success' | 'error';
    timestamp: number;
    contentLength?: number; // Position in content when event was added (for inline rendering)
    result?: string; // Tool execution result (for completed tools)
    args?: Record<string, unknown>; // Tool invocation input
    id?: string; // Provider tool-call id, used to match start->success/error updates
};

export type ClarifyingQuestion = {
    question: string;
    options?: string[];
    allow_multiple?: boolean;
    allow_custom?: boolean;
};

export type ClarifyingQuestionsPayload = {
    questions: ClarifyingQuestion[];
};

/** Best-effort extraction of `ask_questions` arguments from a tool event. */
export function parseClarifyingQuestions(event: ToolEvent): ClarifyingQuestion[] {
    if (!event.args || typeof event.args !== 'object') return [];
    const { args } = event;
    const raw = (('questions' in args) && args.questions) || undefined;
    if (!Array.isArray(raw)) return [];
    return raw
        .filter((q): q is Record<string, unknown> => q && typeof q === 'object')
        .map((q) => ({
            question: typeof q.question === 'string' ? q.question : '',
            options: Array.isArray(q.options)
                ? q.options.filter((o): o is string => typeof o === 'string')
                : undefined,
            allow_multiple: typeof q.allow_multiple === 'boolean' ? q.allow_multiple : undefined,
            allow_custom: typeof q.allow_custom === 'boolean' ? q.allow_custom : undefined,
        }))
        .filter((q) => q.question.trim().length > 0);
}

/**
 * Locate the most recent `ask_questions` tool event in a list of chat messages.
 * Returns the parsed questions plus the message index that owns the event so the
 * popup can reopen if the user has not yet answered.
 */
export function findPendingClarifyingQuestions(messages: ChatMessage[]): {
    questions: ClarifyingQuestion[];
    messageIndex: number;
} | null {
    for (let i = messages.length - 1; i >= 0; i--) {
        const m = messages[i];
        if (m.role !== 'assistant' || !m.parts) continue;
        for (let j = m.parts.length - 1; j >= 0; j--) {
            const part = m.parts[j];
            if (part.type !== 'tool' || part.event.name !== 'ask_questions') continue;
            if (part.event.status !== 'success') continue;
            const questions = parseClarifyingQuestions(part.event);
            if (questions.length > 0) {
                return { questions, messageIndex: i };
            }
        }
    }
    return null;
}

/**
 * Returns true if the user has already submitted an answer after the given
 * assistant message index. Used on reload to decide whether to reopen the popup.
 */
export function hasAnswerAfterMessage(messages: ChatMessage[], messageIndex: number): boolean {
    return messages.some((m, idx) => idx > messageIndex && m.role === 'user');
}

/**
 * Ordered render model for an assistant turn. `parts` is the single source of
 * truth for rendering: text, reasoning ("thinking") and tool calls are stored
 * in true emission order so the live stream and a page reload produce the exact
 * same sequence. `content` and `ui.toolEvents` are derived mirrors kept in sync
 * for legacy consumers (dedup, copy actions, the deep-debug bubble).
 */
export type MessagePart =
    | { type: 'text'; text: string }
    | { type: 'reasoning'; text: string; done?: boolean }
    | { type: 'tool'; event: ToolEvent };

export type ChatMessage = Omit<ConversationMessage, 'content'> & {
    content: string;
    parts?: MessagePart[];
    ui?: {
        isThinking?: boolean;
        toolEvents?: ToolEvent[];
    };
    status?: 'queued' | 'active';
    queuePosition?: number;
};

/** Join the text parts of a message into a single string (dedup/copy/legacy). */
export function getMessageText(parts: MessagePart[] | undefined): string {
    if (!parts) return '';
    return parts
        .filter((p): p is Extract<MessagePart, { type: 'text' }> => p.type === 'text')
        .map((p) => p.text)
        .filter((t) => t.length > 0)
        .join('\n\n');
}

/**
 * Recompute the derived `content` and `ui.toolEvents` mirrors from `parts`.
 * Called after every part mutation so legacy consumers keep working while
 * `parts` stays authoritative for ordering.
 */
function syncDerived(message: ChatMessage): ChatMessage {
    const parts = message.parts ?? [];
    const content = getMessageText(parts);
    const toolEvents = parts
        .filter((p): p is Extract<MessagePart, { type: 'tool' }> => p.type === 'tool')
        .map((p) => p.event);
    const ui = message.ui ?? {};
    return {
        ...message,
        content,
        ui: { ...ui, toolEvents: toolEvents.length > 0 ? toolEvents : ui.toolEvents },
    };
}

/** Build an assistant ChatMessage from an ordered parts array. */
export function createAssistantFromParts(
    conversationId: string,
    parts: MessagePart[],
    extra?: Partial<ChatMessage>,
): ChatMessage {
    return syncDerived({
        role: 'assistant',
        conversationId,
        content: '',
        parts,
        ...extra,
    });
}

/**
 * Check if a message ID should appear in conversational chat
 */
export function isConversationalMessage(messageId: string): boolean {
    const conversationalIds = [
        'main',
        'creating-blueprint',
        'conversation_response',
        'fetching-chat',
        'chat-not-found',
        'chat-welcome',
        'deployment-status',
        'code_reviewed',
        'generation-complete',
        'core_app_complete',
    ];
    
    return conversationalIds.includes(messageId) || messageId.startsWith('conv-');
}

/**
 * Create an assistant message
 */
export function createAIMessage(
    conversationId: string,
    content: string,
    isThinking?: boolean
): ChatMessage {
    return {
        role: 'assistant',
        conversationId,
        content,
        parts: content ? [{ type: 'text', text: content }] : [],
        ui: { isThinking },
    };
}

/**
 * Create a user message
 */
export function createUserMessage(message: string): ChatMessage {
    return {
        role: 'user',
        conversationId: generateId(),
        content: message,
    };
}

/**
 * Handle rate limit errors consistently
 */
export function handleRateLimitError(
    rateLimitError: RateLimitError,
    onDebugMessage?: (
        type: 'error' | 'warning' | 'info' | 'websocket',
        message: string,
        details?: string,
        source?: string,
        messageType?: string,
        rawMessage?: unknown
    ) => void
): ChatMessage {
    let displayMessage = rateLimitError.message;
    
    if (rateLimitError.suggestions && rateLimitError.suggestions.length > 0) {
        displayMessage += `\n\n💡 Suggestions:\n${rateLimitError.suggestions.map(s => `• ${s}`).join('\n')}`;
    }
    
    toast.error(displayMessage);
    
    onDebugMessage?.(
        'error',
        `Rate Limit: ${rateLimitError.limitType.replace('_', ' ')} limit exceeded`,
        `Limit: ${rateLimitError.limit} per ${Math.floor((rateLimitError.period || 0) / 3600)}h\nRetry after: ${(rateLimitError.period || 0) / 3600}h\n\nSuggestions:\n${rateLimitError.suggestions?.join('\n') || 'None'}`,
        'Rate Limiting',
        rateLimitError.limitType,
        rateLimitError
    );
    
    return createAIMessage(
        `rate_limit_${Date.now()}`,
        `⏱️ ${displayMessage}`
    );
}

/**
 * Add or update a message in the messages array
 */
export function addOrUpdateMessage(
    messages: ChatMessage[],
    newMessage: ChatMessage,
): ChatMessage[] {
    // Special handling for 'main' assistant message - update if thinking, otherwise append
    if (newMessage.conversationId === 'main') {
        const mainMessageIndex = messages.findIndex(m => m.conversationId === 'main' && m.ui?.isThinking);
        if (mainMessageIndex !== -1) {
            return messages.map((msg, index) =>
                index === mainMessageIndex 
                    ? { ...msg, ...newMessage }
                    : msg
            );
        }
    }
    // For all other messages, append
    return [...messages, newMessage];
}

/** Find the index of the assistant message for a conversation id, or -1. */
function findAssistant(messages: ChatMessage[], conversationId: string): number {
    return messages.findIndex(m => m.conversationId === conversationId && m.role === 'assistant');
}

/** Mutate the assistant message at `idx` via `fn`, returning a new array. */
function updateAssistant(
    messages: ChatMessage[],
    idx: number,
    fn: (parts: MessagePart[]) => MessagePart[],
): ChatMessage[] {
    return messages.map((m, i) => {
        if (i !== idx) return m;
        return syncDerived({ ...m, parts: fn(m.parts ?? []) });
    });
}

/**
 * Append a streamed text delta to a conversation's assistant turn. The delta is
 * concatenated onto the trailing text part (a new text part is opened if the
 * last part is a reasoning/tool boundary), preserving interleaving with tools.
 */
export function appendTextDelta(
    messages: ChatMessage[],
    conversationId: string,
    delta: string,
): ChatMessage[] {
    const idx = findAssistant(messages, conversationId);
    if (idx === -1) {
        return [...messages, createAssistantFromParts(conversationId, [{ type: 'text', text: delta }])];
    }
    return updateAssistant(messages, idx, (parts) => {
        const last = parts[parts.length - 1];
        if (last && last.type === 'text') {
            return [...parts.slice(0, -1), { type: 'text', text: last.text + delta }];
        }
        return [...parts, { type: 'text', text: delta }];
    });
}

/**
 * Set the full text of a conversation's assistant turn (finalize path). When the
 * turn already streamed text parts, this is a no-op for ordering — the streamed
 * parts already hold the interleaved text. Only used to seed text when nothing
 * streamed (e.g. a single non-streamed response).
 */
export function setAssistantText(
    messages: ChatMessage[],
    conversationId: string,
    fullText: string,
): ChatMessage[] {
    const idx = findAssistant(messages, conversationId);
    if (idx === -1) {
        return [...messages, createAIMessage(conversationId, fullText)];
    }
    return updateAssistant(messages, idx, (parts) => {
        const hasText = parts.some(p => p.type === 'text' && p.text.length > 0);
        if (hasText) return parts; // streamed text already present; keep order
        return [...parts, { type: 'text', text: fullText }];
    });
}

/**
 * Append a streamed reasoning ("thinking") delta. Concatenated onto the trailing
 * reasoning part unless it was closed (`done`) or a different part type follows,
 * in which case a new reasoning part is opened.
 */
export function appendReasoningDelta(
    messages: ChatMessage[],
    conversationId: string,
    delta: string,
    done?: boolean,
): ChatMessage[] {
    const idx = findAssistant(messages, conversationId);
    const mkPart = (): MessagePart => ({ type: 'reasoning', text: delta, done });
    if (idx === -1) {
        return [...messages, createAssistantFromParts(conversationId, [mkPart()])];
    }
    return updateAssistant(messages, idx, (parts) => {
        const last = parts[parts.length - 1];
        if (last && last.type === 'reasoning' && !last.done) {
            return [...parts.slice(0, -1), { type: 'reasoning', text: last.text + delta, done }];
        }
        return [...parts, mkPart()];
    });
}

/**
 * Add or update a tool part in emission order.
 * - `start`: append a new running tool part.
 * - `success`/`error`: update the matching part in place (matched by tool-call
 *   `id` when present, else the most recent running part with the same name),
 *   or append if no prior part exists.
 */
export function appendToolEvent(
    messages: ChatMessage[],
    conversationId: string,
    tool: { name: string; status: 'start' | 'success' | 'error'; result?: string; args?: Record<string, unknown>; id?: string },
): ChatMessage[] {
    const idx = findAssistant(messages, conversationId);
    const timestamp = Date.now();
    const mkEvent = (existing?: ToolEvent): ToolEvent => ({
        name: tool.name,
        status: tool.status,
        timestamp: existing?.timestamp ?? timestamp,
        result: tool.result ?? existing?.result,
        args: tool.args ?? existing?.args,
        id: tool.id ?? existing?.id,
    });

    if (idx === -1) {
        return [...messages, createAssistantFromParts(conversationId, [{ type: 'tool', event: mkEvent() }])];
    }

    return updateAssistant(messages, idx, (parts) => {
        if (tool.status === 'start') {
            return [...parts, { type: 'tool', event: mkEvent() }];
        }
        // Locate the matching tool part to finalize.
        let matchIndex = -1;
        for (let i = parts.length - 1; i >= 0; i--) {
            const p = parts[i];
            if (p.type !== 'tool') continue;
            const idMatch = tool.id && p.event.id === tool.id;
            const nameMatch = !tool.id && p.event.name === tool.name && p.event.status === 'start';
            if (idMatch || nameMatch) { matchIndex = i; break; }
        }
        if (matchIndex !== -1) {
            const existing = (parts[matchIndex] as Extract<MessagePart, { type: 'tool' }>).event;
            return parts.map((p, i) => (i === matchIndex ? { type: 'tool', event: mkEvent(existing) } : p));
        }
        return [...parts, { type: 'tool', event: mkEvent() }];
    });
}
