/**
 * SQLite filesystem adapter for isomorphic-git
 * One DO = one Git repo, stored directly in SQLite
 * 
 * Limits:
 * - Cloudflare DO SQLite: 10GB total storage
 * - Max parameter size: ~1MB per SQL statement parameter
 * - Git objects are base64-encoded to safely store binary data
 */

export interface SqlExecutor {
    <T = unknown>(query: TemplateStringsArray, ...values: (string | number | boolean | null)[]): T[];
}

// 1MB limit for Cloudflare DO SQL parameters, leave some headroom
const MAX_OBJECT_SIZE = 900 * 1024; // 900KB

export class SqliteFS {
    constructor(private sql: SqlExecutor) {}
    
    /**
     * Get storage statistics for observability
     */
    getStorageStats(): { totalObjects: number; totalBytes: number; largestObject: { path: string; size: number } | null } {
        const objects = this.sql<{ path: string; data: string }>`SELECT path, data FROM git_objects`;
        
        if (!objects || objects.length === 0) {
            return { totalObjects: 0, totalBytes: 0, largestObject: null };
        }
        
        let totalBytes = 0;
        let largestObject: { path: string; size: number } | null = null;
        
        for (const obj of objects) {
            const size = obj.data.length; // Base64 encoded size
            totalBytes += size;
            
            if (!largestObject || size > largestObject.size) {
                largestObject = { path: obj.path, size };
            }
        }
        
        return {
            totalObjects: objects.length,
            totalBytes,
            largestObject
        };
    }

    init(): void {
        this.sql`
            CREATE TABLE IF NOT EXISTS git_objects (
                path TEXT PRIMARY KEY,
                data TEXT NOT NULL,
                mtime INTEGER NOT NULL
            )
        `;
        
        // Create index for efficient directory listings
        this.sql`CREATE INDEX IF NOT EXISTS idx_git_objects_path ON git_objects(path)`;
    }

    readFile(path: string, options?: { encoding?: 'utf8' }): Uint8Array | string {
        // Normalize path (remove leading slashes)
        const normalized = path.replace(/^\/+/, '');
        const result = this.sql<{ data: string }>`SELECT data FROM git_objects WHERE path = ${normalized}`;
        if (!result[0]) throw new Error(`ENOENT: ${path}`);
        
        const base64Data = result[0].data;
        
        // Decode from base64
        const binaryString = atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        
        return options?.encoding === 'utf8' ? new TextDecoder().decode(bytes) : bytes;
    }

    writeFile(path: string, data: Uint8Array | string): void {
        // Normalize path (remove leading slashes)
        const normalized = path.replace(/^\/+/, '');
        
        // Convert to Uint8Array if string
        const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
        
        // Check size limit
        if (bytes.length > MAX_OBJECT_SIZE) {
            throw new Error(`File too large: ${path} (${bytes.length} bytes, max ${MAX_OBJECT_SIZE})`);
        }
        
        // Encode to base64 for safe storage
        let binaryString = '';
        for (let i = 0; i < bytes.length; i++) {
            binaryString += String.fromCharCode(bytes[i]);
        }
        const base64Content = btoa(binaryString);
        
        this.sql`INSERT OR REPLACE INTO git_objects (path, data, mtime) VALUES (${normalized}, ${base64Content}, ${Date.now()})`;
        
        // Only log if approaching size limit (no overhead for normal files)
        if (bytes.length > MAX_OBJECT_SIZE * 0.8) {
            console.warn(`[Git Storage] Large file: ${normalized} is ${(bytes.length / 1024).toFixed(1)}KB (limit: ${(MAX_OBJECT_SIZE / 1024).toFixed(1)}KB)`);
        }
    }

    unlink(path: string): void {
        // Normalize path (remove leading slashes)
        const normalized = path.replace(/^\/+/, '');
        this.sql`DELETE FROM git_objects WHERE path = ${normalized}`;
    }

    readdir(path: string): string[] {
        // Normalize path (remove leading/trailing slashes)
        const normalized = path.replace(/^\/+|\/+$/g, '');
        
        let result;
        if (normalized === '') {
            // Root directory - get all paths
            result = this.sql<{ path: string }>`SELECT path FROM git_objects`;
        } else {
            // Subdirectory - match prefix
            result = this.sql<{ path: string }>`SELECT path FROM git_objects WHERE path LIKE ${normalized + '/%'}`;
        }
        
        if (!result || result.length === 0) return [];

        const children = new Set<string>();
        const prefixLen = normalized ? normalized.length + 1 : 0;
        
        for (const row of result) {
            const relativePath = normalized ? row.path.substring(prefixLen) : row.path;
            const first = relativePath.split('/')[0];
            if (first) children.add(first);
        }

        return Array.from(children);
    }

    mkdir(_path: string): void {
        // No-op: directories are implicit in Git
    }

    rmdir(path: string): void {
        // Normalize path (remove leading/trailing slashes)
        const normalized = path.replace(/^\/+|\/+$/g, '');
        this.sql`DELETE FROM git_objects WHERE path LIKE ${normalized + '%'}`;
    }

    stat(path: string): { type: 'file' | 'dir'; mode: number; size: number; mtimeMs: number } {
        // Normalize path (remove leading slashes)
        const normalized = path.replace(/^\/+/, '');
        const result = this.sql<{ data: string; mtime: number }>`SELECT data, mtime FROM git_objects WHERE path = ${normalized}`;
        if (!result[0]) throw new Error(`ENOENT: ${path}`);
        
        const row = result[0];
        return { type: 'file', mode: 0o100644, size: row.data.length, mtimeMs: row.mtime };
    }

    lstat(path: string) {
        return this.stat(path);
    }

    symlink(target: string, path: string): void {
        this.writeFile(path, target);
    }

    readlink(path: string): string {
        return this.readFile(path, { encoding: 'utf8' }) as string;
    }
}