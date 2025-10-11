/**
 * ID Generation Utility
 * Simple wrapper around crypto.randomUUID() for consistent ID generation
 */

export function generateId(): string {
    return crypto.randomUUID();
}