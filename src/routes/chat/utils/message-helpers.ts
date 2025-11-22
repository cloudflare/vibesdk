import { toast } from 'sonner';
import { generateId } from '@/utils/id-generator';
import type { RateLimitError, ConversationMessage } from '@/api-types';

export type ToolEvent = {
    name: string;
    status: 'start' | 'success' | 'error';
    timestamp: number;
    contentLength?: number; // Position in content when event was added (for inline rendering)
    result?: string; // Tool execution result (for completed tools)
};

export type ChatMessage = Omit<ConversationMessage, 'content'> & {
    content: string;
    ui?: {
        isThinking?: boolean;
        toolEvents?: ToolEvent[];
    };
    status?: 'queued' | 'active';
    queuePosition?: number;
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

/**
 * Handle streaming conversation messages
 */
export function handleStreamingMessage(
    messages: ChatMessage[],
    conversationId: string,
    chunk: string,
    isNewMessage: boolean
): ChatMessage[] {
    const existingMessageIndex = messages.findIndex(m => m.conversationId === conversationId && m.role === 'assistant');
    if (existingMessageIndex !== -1 && !isNewMessage) {
        // Append chunk to existing assistant message
        return messages.map((msg, index) =>
            index === existingMessageIndex
                ? { ...msg, content: msg.content + chunk }
                : msg
        );
    } else {
        // Create new streaming assistant message
        return [...messages, createAIMessage(conversationId, chunk, false)];
    }
}

/**
 * Append or update a tool event
 * - Tool 'start': Add with current position for inline rendering
 * - Tool 'success': Update matching 'start' to 'success' in place (always updates, never adds new)
 * - Tool 'error': Add error event with position for inline rendering
 */
export function appendToolEvent(
    messages: ChatMessage[],
    conversationId: string,
    tool: { name: string; status: 'start' | 'success' | 'error'; result?: string }
): ChatMessage[] {
    const idx = messages.findIndex(m => m.conversationId === conversationId && m.role === 'assistant');
    const timestamp = Date.now();

    // If message is not present, create a new placeholder assistant message with tool event
    if (idx === -1) {
        const newMsg: ChatMessage = {
            role: 'assistant',
            conversationId,
            content: '',
            ui: {
                toolEvents: [{
                    name: tool.name,
                    status: tool.status,
                    timestamp,
                    contentLength: 0
                }]
            },
        };
        return [...messages, newMsg];
    }

    return messages.map((m, i) => {
        if (i !== idx) return m;
        
        const current = m.ui?.toolEvents ?? [];
        const currentContentLength = m.content.length;
        
        if (tool.status === 'start') {
            // Add new tool start event with current position
            return {
                ...m,
                ui: {
                    ...m.ui,
                    toolEvents: [...current, {
                        name: tool.name,
                        status: 'start',
                        timestamp,
                        contentLength: currentContentLength
                    }]
                }
            };
        }
        
        if (tool.status === 'success') {
            // Find the matching 'start' event
            const startEventIndex = current.findIndex(ev => ev.name === tool.name && ev.status === 'start');
            
            if (startEventIndex !== -1) {
                const startEvent = current[startEventIndex];
                const contentChanged = startEvent.contentLength !== currentContentLength;
                const isDeepDebug = tool.name === 'deep_debug';
                
                // For deep_debug with content changes: add new success event at end (chronological)
                // For other tools: update in place (avoid duplication)
                if (isDeepDebug && contentChanged) {
                    // Remove start event and add success event at current position
                    return {
                        ...m,
                        ui: {
                            ...m.ui,
                            toolEvents: [
                                ...current.filter((_, j) => j !== startEventIndex),
                                {
                                    name: tool.name,
                                    status: 'success' as const,
                                    timestamp,
                                    contentLength: currentContentLength,
                                    result: tool.result
                                }
                            ]
                        }
                    };
                }
                
                // Update in place for other tools or when no content changed
                return {
                    ...m,
                    ui: {
                        ...m.ui,
                        toolEvents: current.map((ev, j) =>
                            j === startEventIndex
                                ? { 
                                    name: ev.name, 
                                    status: 'success' as const, 
                                    timestamp: startEvent.timestamp, // Keep original timestamp for stable React key
                                    contentLength: ev.contentLength, // Keep original position
                                    result: tool.result // Add result if provided
                                  }
                                : ev
                        )
                    }
                };
            }
            
            // No prior start found, just add success event with position
            return {
                ...m,
                ui: {
                    ...m.ui,
                    toolEvents: [...current, {
                        name: tool.name,
                        status: 'success',
                        timestamp,
                        contentLength: currentContentLength,
                        result: tool.result
                    }]
                }
            };
        }
        
        // Error status - add with position for inline rendering
        return {
            ...m,
            ui: {
                ...m.ui,
                toolEvents: [...current, {
                    name: tool.name,
                    status: 'error',
                    timestamp,
                    contentLength: currentContentLength
                }]
            }
        };
    });
}
