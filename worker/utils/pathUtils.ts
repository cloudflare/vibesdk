export function normalizePath(path: string): string {
    // Remove leading/trailing slashes
    path = path.replace(/^\/+/, '').replace(/\/+$/, '');

    // Resolve .. and . segments
    const segments = path.split('/');
    const resolved: string[] = [];

    for (const segment of segments) {
        if (segment === '' || segment === '.') continue;
        if (segment === '..') {
            resolved.pop();
        } else {
            resolved.push(segment);
        }
    }

    return resolved.join('/');
}

export function isPathSafe(path: string): boolean {
    // Prevent directory traversal attacks
    if (path.includes('\0') || path.includes('\\')) {
        return false;
    }

    const normalized = normalizePath(path);

    // Ensure path doesn't escape root
    return !normalized.startsWith('..') &&
           !normalized.includes('/../') &&
           normalized.length > 0;
}
