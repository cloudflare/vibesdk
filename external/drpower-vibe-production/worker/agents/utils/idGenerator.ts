/**
 * Utility functions for generating unique IDs
 */
export class IdGenerator {
    /**
     * Generate a unique conversation ID
     * Format: conv-{timestamp}-{random}
     */
    static generateConversationId(): string {
        return `conv-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    }

    /**
     * Generate a generic unique ID with custom prefix
     */
    static generateId(prefix: string = 'id'): string {
        return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    }
}