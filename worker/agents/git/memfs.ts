/**
 * In-memory filesystem for git clone operations
 * Minimal implementation for isomorphic-git compatibility
 */

export class MemFS {
    private files = new Map<string, Uint8Array>();
    
    /**
     * Write file to memory
     */
    writeFile(path: string, data: string | Uint8Array): void {
        const bytes = typeof data === 'string' 
            ? new TextEncoder().encode(data) 
            : data;
        
        // Normalize path (remove leading slash for consistency)
        const normalized = path.startsWith('/') ? path.slice(1) : path;
        this.files.set(normalized, bytes);
    }
    
    /**
     * Read file from memory
     */
    readFile(path: string, options?: { encoding?: 'utf8' }): Uint8Array | string {
        const normalized = path.startsWith('/') ? path.slice(1) : path;
        const data = this.files.get(normalized);
        
        if (!data) {
            const error: NodeJS.ErrnoException = new Error(`ENOENT: no such file or directory, open '${path}'`);
            error.code = 'ENOENT';
            throw error;
        }
        
        if (options?.encoding === 'utf8') {
            return new TextDecoder().decode(data);
        }
        
        return data;
    }
    
    /**
     * List directory contents
     */
    readdir(dirPath: string): string[] {
        const normalized = dirPath === '/' ? '' : (dirPath.startsWith('/') ? dirPath.slice(1) : dirPath);
        const prefix = normalized ? normalized + '/' : '';
        const results = new Set<string>();
        
        for (const filePath of this.files.keys()) {
            if (filePath.startsWith(prefix)) {
                const relative = filePath.slice(prefix.length);
                const firstPart = relative.split('/')[0];
                if (firstPart) {
                    results.add(firstPart);
                }
            }
        }
        
        return Array.from(results);
    }
    
    /**
     * Get file/directory stats
     */
    stat(path: string) {
        const normalized = path.startsWith('/') ? path.slice(1) : path;
        
        // Check if it's a file
        const data = this.files.get(normalized);
        if (data) {
            return {
                type: 'file' as const,
                mode: 0o100644,
                size: data.length,
                mtimeMs: Date.now(),
                ino: 0,
                uid: 0,
                gid: 0
            };
        }
        
        // Check if it's a directory (has children)
        const prefix = normalized ? normalized + '/' : '';
        for (const filePath of this.files.keys()) {
            if (filePath.startsWith(prefix)) {
                return {
                    type: 'dir' as const,
                    mode: 0o040755,
                    size: 0,
                    mtimeMs: Date.now(),
                    ino: 0,
                    uid: 0,
                    gid: 0
                };
            }
        }
        
        const error: NodeJS.ErrnoException = new Error(`ENOENT: no such file or directory, stat '${path}'`);
        error.code = 'ENOENT';
        throw error;
    }
    
    /**
     * Lstat (same as stat for in-memory fs)
     */
    lstat(path: string) {
        return this.stat(path);
    }
    
    /**
     * Create directory (no-op for in-memory fs)
     */
    mkdir(): void {
        // No-op: directories are implicit in path structure
    }
    
    /**
     * Remove directory (no-op for in-memory fs)
     */
    rmdir(): void {
        // No-op
    }
    
    /**
     * Delete file
     */
    unlink(path: string): void {
        const normalized = path.startsWith('/') ? path.slice(1) : path;
        this.files.delete(normalized);
    }
    
    /**
     * Check if path exists
     */
    exists(path: string): boolean {
        try {
            this.stat(path);
            return true;
        } catch {
            return false;
        }
    }
}
