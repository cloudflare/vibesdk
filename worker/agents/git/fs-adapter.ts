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
    private sql!: SqlExecutor;  // Assigned in constructor
    public promises!: this;  // Set in init(), required by isomorphic-git
    
    constructor(sql: SqlExecutor) {
        this.sql = sql;
    }
    
    /**
     * Get storage statistics for observability
     */
    getStorageStats(): { totalObjects: number; totalBytes: number; largestObject: { path: string; size: number } | null } {
        const objects = this.sql<{ path: string; data: string; is_dir: number }>`SELECT path, data, is_dir FROM git_objects WHERE is_dir = 0`;
        
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

    init() {
        // Create table
        void this.sql`
            CREATE TABLE IF NOT EXISTS git_objects (
                path TEXT PRIMARY KEY,
                parent_path TEXT NOT NULL DEFAULT '',
                data TEXT NOT NULL,
                is_dir INTEGER NOT NULL DEFAULT 0,
                mtime INTEGER NOT NULL
            )
        `;
        
        // Create indexes for efficient lookups
        void this.sql`CREATE INDEX IF NOT EXISTS idx_git_objects_parent ON git_objects(parent_path, path)`;
        void this.sql`CREATE INDEX IF NOT EXISTS idx_git_objects_is_dir ON git_objects(is_dir, path)`;
        
        // Ensure root directory exists
        void this.sql`INSERT OR IGNORE INTO git_objects (path, parent_path, data, is_dir, mtime) VALUES ('', '', '', 1, ${Date.now()})`;
        
        // promises property required for isomorphic-git
        Object.defineProperty(this, 'promises', {
            value: this,
            enumerable: true,
            writable: false,
            configurable: false
        });
    }

    async readFile(path: string, options?: { encoding?: 'utf8' }): Promise<Uint8Array | string> {
        const normalized = path.replace(/^\/+/, '');
        const result = this.sql<{ data: string; is_dir: number }>`SELECT data, is_dir FROM git_objects WHERE path = ${normalized}`;
        if (!result[0]) {
            const error: NodeJS.ErrnoException = new Error(`ENOENT: no such file or directory, open '${path}'`);
            error.code = 'ENOENT';
            error.errno = -2;
            error.path = path;
            throw error;
        }
        
        if (result[0].is_dir) {
            const error: NodeJS.ErrnoException = new Error(`EISDIR: illegal operation on a directory, read '${path}'`);
            error.code = 'EISDIR';
            error.errno = -21;
            error.path = path;
            throw error;
        }
        
        const base64Data = result[0].data;
        
        if (!base64Data) {
            return options?.encoding === 'utf8' ? '' : new Uint8Array(0);
        }
        
        const binaryString = atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        
        return options?.encoding === 'utf8' ? new TextDecoder().decode(bytes) : bytes;
    }

    async writeFile(path: string, data: Uint8Array | string): Promise<void> {
        const normalized = path.replace(/^\/+/, '');
        
        if (!normalized) {
            throw new Error('Cannot write to root');
        }
        
        // Convert to Uint8Array if string
        const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
        
        // Check size limit
        if (bytes.length > MAX_OBJECT_SIZE) {
            throw new Error(`File too large: ${path} (${bytes.length} bytes, max ${MAX_OBJECT_SIZE})`);
        }
        
        // Check if path exists as directory
        const existing = this.sql<{ is_dir: number }>`SELECT is_dir FROM git_objects WHERE path = ${normalized}`;
        if (existing[0]?.is_dir === 1) {
            const error: NodeJS.ErrnoException = new Error(`EISDIR: illegal operation on a directory, open '${path}'`);
            error.code = 'EISDIR';
            error.errno = -21;
            error.path = path;
            throw error;
        }
        
        // Ensure parent directories exist (git implicitly creates them)
        const parts = normalized.split('/');
        const parentPath = parts.length > 1 ? parts.slice(0, -1).join('/') : '';
        
        if (parts.length > 1) {
            const now = Date.now();
            for (let i = 0; i < parts.length - 1; i++) {
                const dirPath = parts.slice(0, i + 1).join('/');
                const dirParent = i === 0 ? '' : parts.slice(0, i).join('/');
                void this.sql`INSERT OR IGNORE INTO git_objects (path, parent_path, data, is_dir, mtime) VALUES (${dirPath}, ${dirParent}, '', 1, ${now})`;
            }
        }
        
        // Encode to base64 for safe storage
        let base64Content = '';
        if (bytes.length > 0) {
            let binaryString = '';
            for (let i = 0; i < bytes.length; i++) {
                binaryString += String.fromCharCode(bytes[i]);
            }
            base64Content = btoa(binaryString);
        }
        
        void this.sql`INSERT OR REPLACE INTO git_objects (path, parent_path, data, is_dir, mtime) VALUES (${normalized}, ${parentPath}, ${base64Content}, 0, ${Date.now()})`;
    }

    async unlink(path: string): Promise<void> {
        const normalized = path.replace(/^\/+/, '');
        
        const existing = this.sql<{ is_dir: number }>`SELECT is_dir FROM git_objects WHERE path = ${normalized}`;
        if (!existing[0]) {
            const error: NodeJS.ErrnoException = new Error(`ENOENT: no such file or directory, unlink '${path}'`);
            error.code = 'ENOENT';
            error.errno = -2;
            error.path = path;
            throw error;
        }
        if (existing[0].is_dir === 1) {
            const error: NodeJS.ErrnoException = new Error(`EPERM: operation not permitted, unlink '${path}'`);
            error.code = 'EPERM';
            error.errno = -1;
            error.path = path;
            throw error;
        }
        
        void this.sql`DELETE FROM git_objects WHERE path = ${normalized} AND is_dir = 0`;
    }

    async readdir(path: string): Promise<string[]> {
        const normalized = path.replace(/^\/+|\/+$/g, '');
        
        const dirCheck = this.sql<{ is_dir: number }>`SELECT is_dir FROM git_objects WHERE path = ${normalized}`;
        if (!dirCheck[0] || !dirCheck[0].is_dir) {
            const error: NodeJS.ErrnoException = new Error(`ENOENT: no such file or directory, scandir '${path}'`);
            error.code = 'ENOENT';
            error.errno = -2;
            error.path = path;
            throw error;
        }
        
        const rows = this.sql<{ path: string }>`SELECT path FROM git_objects WHERE parent_path = ${normalized}`;
        
        if (!rows || rows.length === 0) return [];

        // Extract just the basename from each path
        const children = rows.map(row => {
            const parts = row.path.split('/');
            return parts[parts.length - 1];
        });

        return children;
    }

    async mkdir(path: string, _options?: any): Promise<void> {
        const normalized = path.replace(/^\/+|\/+$/g, '');
        
        if (!normalized) return;
        
        const parts = normalized.split('/');
        const isDirectChildOfRoot = parts.length === 1;
        
        if (!isDirectChildOfRoot) {
            // Check parent exists first (avoid unnecessary queries)
            const parentPath = parts.slice(0, -1).join('/');
            const parent = this.sql<{ is_dir: number }>`SELECT is_dir FROM git_objects WHERE path = ${parentPath}`;
            if (!parent[0] || parent[0].is_dir !== 1) {
                // Parent doesn't exist - throw ENOENT
                // Isomorphic-git's FileSystem wrapper will catch this and recursively create parent
                const error: NodeJS.ErrnoException = new Error(`ENOENT: no such file or directory, mkdir '${path}'`);
                error.code = 'ENOENT';
                error.errno = -2;
                error.path = path;
                throw error;
            }
        }
        
        // Check if already exists (after parent check to fail fast on missing parent)
        const existing = this.sql<{ is_dir: number }>`SELECT is_dir FROM git_objects WHERE path = ${normalized}`;
        if (existing[0]) {
            if (existing[0].is_dir === 1) {
                return;
            } else {
                const error: NodeJS.ErrnoException = new Error(`EEXIST: file already exists, mkdir '${path}'`);
                error.code = 'EEXIST';
                error.errno = -17;
                error.path = path;
                throw error;
            }
        }
        
        const parentPath = parts.length > 1 ? parts.slice(0, -1).join('/') : '';
        void this.sql`INSERT OR IGNORE INTO git_objects (path, parent_path, data, is_dir, mtime) VALUES (${normalized}, ${parentPath}, '', 1, ${Date.now()})`;
    }

    async rmdir(path: string): Promise<void> {
        const normalized = path.replace(/^\/+|\/+$/g, '');
        
        if (!normalized) {
            throw new Error('Cannot remove root directory');
        }
        
        // Check if exists and is a directory
        const existing = this.sql<{ is_dir: number }>`SELECT is_dir FROM git_objects WHERE path = ${normalized}`;
        if (!existing[0]) {
            const error: NodeJS.ErrnoException = new Error(`ENOENT: no such file or directory, rmdir '${path}'`);
            error.code = 'ENOENT';
            error.errno = -2;
            error.path = path;
            throw error;
        }
        if (existing[0].is_dir !== 1) {
            const error: NodeJS.ErrnoException = new Error(`ENOTDIR: not a directory, rmdir '${path}'`);
            error.code = 'ENOTDIR';
            error.errno = -20;
            error.path = path;
            throw error;
        }
        
        // Check if directory is empty (has no children)
        const children = this.sql<{ path: string }>`SELECT path FROM git_objects WHERE path LIKE ${normalized + '/%'} LIMIT 1`;
        if (children.length > 0) {
            const error: NodeJS.ErrnoException = new Error(`ENOTEMPTY: directory not empty, rmdir '${path}'`);
            error.code = 'ENOTEMPTY';
            error.errno = -39;
            error.path = path;
            throw error;
        }
        
        void this.sql`DELETE FROM git_objects WHERE path = ${normalized}`;
    }

    async stat(path: string): Promise<{ type: 'file' | 'dir'; mode: number; size: number; mtimeMs: number }> {
        const normalized = path.replace(/^\/+/, '');
        const result = this.sql<{ data: string; mtime: number; is_dir: number }>`SELECT data, mtime, is_dir FROM git_objects WHERE path = ${normalized}`;
        if (!result[0]) {
            const error: NodeJS.ErrnoException = new Error(`ENOENT: no such file or directory, stat '${path}'`);
            error.code = 'ENOENT';
            error.errno = -2;
            error.path = path;
            throw error;
        }
        
        const row = result[0];
        const isDir = row.is_dir === 1;
        
        // Calculate actual size for files (base64 is ~1.33x larger than binary)
        let size = 0;
        if (!isDir && row.data) {
            // Approximate binary size from base64 length
            size = Math.floor(row.data.length * 0.75);
        }
        
        const statResult = {
            type: (isDir ? 'dir' : 'file') as 'file' | 'dir',
            mode: isDir ? 0o040755 : 0o100644,
            size,
            mtimeMs: row.mtime,
            // Add full Node.js stat properties for isomorphic-git
            dev: 0,
            ino: 0,
            uid: 0,
            gid: 0,
            ctime: new Date(row.mtime),
            mtime: new Date(row.mtime),
            ctimeMs: row.mtime,
            // Add methods that isomorphic-git expects
            isFile: () => !isDir,
            isDirectory: () => isDir,
            isSymbolicLink: () => false
        };
        return statResult;
    }

    async lstat(path: string) {
        return await this.stat(path);
    }

    async symlink(target: string, path: string): Promise<void> {
        await this.writeFile(path, target);
    }

    async readlink(path: string): Promise<string> {
        return (await this.readFile(path, { encoding: 'utf8' })) as string;
    }

    /**
     * Check if a file or directory exists
     * Required by isomorphic-git's init check
     */
    async exists(path: string): Promise<boolean> {
        try {
            await this.stat(path);
            return true;
        } catch (err) {
            if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
                return false;
            }
            throw err;
        }
    }

    /**
     * Alias for writeFile (isomorphic-git sometimes uses 'write')
     */
    async write(path: string, data: Uint8Array | string): Promise<void> {
        return await this.writeFile(path, data);
    }

    /**
     * Export all git objects for cloning
     * Returns array of {path, data}
     */
    exportGitObjects(): Array<{ path: string; data: Uint8Array }> {
        const objects = this.sql<{ path: string; data: string; is_dir: number }>`
            SELECT path, data, is_dir FROM git_objects WHERE path LIKE '.git/%'
        `;
        
        const exported: Array<{ path: string; data: Uint8Array }> = [];
        
        for (const obj of objects) {
            if (obj.is_dir === 1) continue; // Skip directories, only export files
            
            // Decode base64 to binary
            const binaryString = atob(obj.data);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            
            exported.push({
                path: obj.path,
                data: bytes
            });
        }
        
        return exported;
    }
}