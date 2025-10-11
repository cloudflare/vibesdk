import { toast } from 'sonner';
import { generateId } from '@/utils/id-generator';
import type { RateLimitError } from '@/api-types';

export type ToolEvent = {
    name: string;
    status: 'start' | 'success' | 'error';
    timestamp: number;
};

export type ChatMessage = {
    type: 'user' | 'ai';
    id: string;
    message: string;
    isThinking?: boolean;
    toolEvents?: ToolEvent[];
};

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
        'resuming-chat',
        'chat-welcome',
        'deployment-status',
        'code_reviewed',
    ];
    
    return conversationalIds.includes(messageId) || messageId.startsWith('conv-');
}

/**
 * Create an AI message
 */
export function createAIMessage(
    id: string,
    message: string,
    isThinking?: boolean
): ChatMessage {
    return {
        type: 'ai',
        id,
        message,
        isThinking,
    };
}

/**
 * Create a user message
 */
export function createUserMessage(message: string): ChatMessage {
    return {
        type: 'user',
        id: generateId(),
        message,
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
    newMessage: Omit<ChatMessage, 'type'>,
    messageType: 'ai' | 'user' = 'ai'
): ChatMessage[] {
    // Special handling for 'main' message - update if thinking, otherwise append
    if (newMessage.id === 'main') {
        const mainMessageIndex = messages.findIndex(m => m.id === 'main' && m.isThinking);
        if (mainMessageIndex !== -1) {
            return messages.map((msg, index) =>
                index === mainMessageIndex 
                    ? { ...msg, ...newMessage, type: messageType }
                    : msg
            );
        }
    }
    
    // For all other messages, append
    return [...messages, { ...newMessage, type: messageType }];
}

/**
 * Handle streaming conversation messages
 */
export function handleStreamingMessage(
    messages: ChatMessage[],
    messageId: string,
    chunk: string,
    isNewMessage: boolean
): ChatMessage[] {
    const existingMessageIndex = messages.findIndex(m => m.id === messageId && m.type === 'ai');
    
    if (existingMessageIndex !== -1 && !isNewMessage) {
        // Append chunk to existing message
        return messages.map((msg, index) =>
            index === existingMessageIndex
                ? { ...msg, message: msg.message + chunk }
                : msg
        );
    } else {
        // Create new streaming message
        return [...messages, createAIMessage(messageId, chunk, false)];
    }
}

/**
 * Append or update a tool event inline within an AI message bubble
 * - If a message with messageId doesn't exist yet, create a placeholder AI message with empty content
 * - If a matching 'start' exists and a 'success' comes in for the same tool, update that entry in place
 */
export function appendToolEvent(
    messages: ChatMessage[],
    messageId: string,
    tool: { name: string; status: 'start' | 'success' | 'error' }
): ChatMessage[] {
    const idx = messages.findIndex(m => m.id === messageId && m.type === 'ai');
    const timestamp = Date.now();

    // If message is not present, create a new placeholder AI message
    if (idx === -1) {
        const newMsg: ChatMessage = {
            type: 'ai',
            id: messageId,
            message: '',
            toolEvents: [{ name: tool.name, status: tool.status, timestamp }],
        };
        return [...messages, newMsg];
    }

    return messages.map((m, i) => {
        if (i !== idx) return m;
        const current = m.toolEvents ?? [];
        if (tool.status === 'success') {
            // Find last 'start' for this tool and flip it to success
            for (let j = current.length - 1; j >= 0; j--) {
                if (current[j].name === tool.name) {
                    return {
                        ...m,
                        toolEvents: current.map((ev, k) =>
                            k === j ? { ...ev, status: 'success', timestamp } : ev
                        ),
                    };
                }
            }
            // If no prior start, just append success as a separate line
            return { ...m, toolEvents: [...current, { name: tool.name, status: 'success', timestamp }] };
        }
        // Default: append event
        return { ...m, toolEvents: [...current, { name: tool.name, status: tool.status, timestamp }] };
    });
}
