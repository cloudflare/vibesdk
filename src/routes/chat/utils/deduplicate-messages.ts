import type { ChatMessage } from './message-helpers';

/**
 * Deduplicates consecutive assistant messages with identical content.
 * 
 * This handles cases where the backend sends duplicate responses after tool execution,
 * even when tool messages appear between them.
 * 
 * Algorithm:
 * - Keeps all non-assistant messages
 * - For each assistant message, checks if the last assistant (not necessarily adjacent) has identical content
 * - If duplicate found, skips the current message
 * 
 * @param messages - Array of chat messages to deduplicate
 * @returns Deduplicated array of messages
 */
export function deduplicateMessages(messages: readonly ChatMessage[]): ChatMessage[] {
    if (messages.length === 0) return [];
    
    const result: ChatMessage[] = [];
    let lastAssistantContent: string | null = null;
    
    for (const msg of messages) {
        if (msg.role !== 'assistant') {
            // Keep all non-assistant messages (user, tool, etc.)
            result.push(msg);
            continue;
        }
        
        // For assistant messages, check against last assistant content
        if (lastAssistantContent !== null && msg.content === lastAssistantContent) {
            // Skip this duplicate
            continue;
        }
        
        // Not a duplicate - keep it and update last content
        result.push(msg);
        lastAssistantContent = msg.content;
    }
    
    return result;
}

/**
 * Check if a new assistant message would be a duplicate of the last assistant message.
 * Used for live streaming to prevent adding duplicates.
 * 
 * @param messages - Current messages array
 * @param newContent - Content of the new assistant message
 * @returns true if this would be a duplicate, false otherwise
 */
export function isAssistantMessageDuplicate(
    messages: readonly ChatMessage[],
    newContent: string
): boolean {
    // Find the last assistant message
    for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === 'assistant') {
            return messages[i].content === newContent;
        }
    }
    return false; // No previous assistant message found
}
