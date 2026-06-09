/**
 * ID Generation Utility for Frontend
 * Simple wrapper around crypto.randomUUID() for consistent ID generation
 */

export function generateId(): string {
    return crypto.randomUUID();
}

export function generateShortId(): string {
    return crypto.randomUUID().replace(/-/g, '').substring(0, 16);
}