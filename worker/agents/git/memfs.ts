/**
 * In-memory filesystem for git clone operations
 * Full async implementation for isomorphic-git compatibility
 */

/** Strip all leading slashes so '//.gitignore' becomes '.gitignore' */
function normalize(p: string): string {
    return p.replace(/^\/+/, '');
}

export class MemFS {
    private files = new Map<string, Uint8Array>();
    private symlinks = new Map<string, string>();

    constructor() {
        // promises property required for isomorphic-git
        Object.defineProperty(this, 'promises', {
            value: this,
            enumerable: true,
            writable: false,
            configurable: false
        });
    }
    
    async writeFile(path: string, data: string | Uint8Array): Promise<void> {
        const bytes = typeof data === 'string' 
            ? new TextEncoder().encode(data) 
            : data;
        
        const normalized = normalize(path);
        this.files.set(normalized, bytes);
    }
    
    async readFile(path: string, options?: { encoding?: 'utf8' | string }): Promise<Uint8Array | string> {
        const normalized = normalize(path);
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
    
    async readdir(dirPath: string): Promise<string[]> {
        const normalized = normalize(dirPath);
        const prefix = normalized ? normalized + '/' : '';
        const results = new Set<string>();

        for (const filePath of this.files.keys()) {
            if (filePath.startsWith(prefix)) {
                const relative = filePath.slice(prefix.length);
                const firstPart = relative.split('/')[0];
                if (firstPart) results.add(firstPart);
            }
        }
        for (const linkPath of this.symlinks.keys()) {
            if (linkPath.startsWith(prefix)) {
                const relative = linkPath.slice(prefix.length);
                const firstPart = relative.split('/')[0];
                if (firstPart) results.add(firstPart);
            }
        }

        return Array.from(results);
    }
    
    private makeStat(type: 'file' | 'dir', mode: number, size: number, isSymlink = false) {
        const now = Date.now();
        return {
            type,
            mode,
            size,
            mtimeMs: now,
            ino: 0,
            uid: 0,
            gid: 0,
            dev: 0,
            ctime: new Date(now),
            mtime: new Date(now),
            ctimeMs: now,
            isFile: () => type === 'file',
            isDirectory: () => type === 'dir',
            isSymbolicLink: () => isSymlink,
        };
    }

    async stat(path: string) {
        const normalized = normalize(path);

        // Resolve symlinks for stat (follow the link)
        if (this.symlinks.has(normalized)) {
            const target = this.symlinks.get(normalized)!;
            const targetData = this.files.get(normalize(target));
            return this.makeStat('file', 0o100644, targetData?.length ?? 0);
        }

        const data = this.files.get(normalized);
        if (data) {
            return this.makeStat('file', 0o100644, data.length);
        }

        // Check if it's a directory (has children in files or symlinks)
        const prefix = normalized ? normalized + '/' : '';
        for (const filePath of this.files.keys()) {
            if (filePath.startsWith(prefix)) {
                return this.makeStat('dir', 0o040755, 0);
            }
        }
        for (const linkPath of this.symlinks.keys()) {
            if (linkPath.startsWith(prefix)) {
                return this.makeStat('dir', 0o040755, 0);
            }
        }

        const error: NodeJS.ErrnoException = new Error(`ENOENT: no such file or directory, stat '${path}'`);
        error.code = 'ENOENT';
        throw error;
    }

    async lstat(path: string) {
        const normalized = normalize(path);

        // lstat does NOT follow symlinks
        if (this.symlinks.has(normalized)) {
            return this.makeStat('file', 0o120000, 0, true);
        }

        return this.stat(path);
    }
    
    async mkdir(_path: string, _options?: any): Promise<void> {
        // No-op: directories implicit in paths
    }
    
    async rmdir(_path: string): Promise<void> {
        // No-op
    }
    
    async rename(oldPath: string, newPath: string): Promise<void> {
        const oldNormalized = normalize(oldPath);
        const newNormalized = normalize(newPath);
        
        const data = this.files.get(oldNormalized);
        if (data) {
            this.files.set(newNormalized, data);
            this.files.delete(oldNormalized);
        }
    }
    
    async chmod(_path: string, _mode: number): Promise<void> {
        // No-op
    }
    
    async readlink(path: string): Promise<string> {
        const normalized = normalize(path);
        const target = this.symlinks.get(normalized);
        if (!target) {
            const error: NodeJS.ErrnoException = new Error(`ENOENT: no such file or directory, readlink '${path}'`);
            error.code = 'ENOENT';
            throw error;
        }
        return target;
    }

    async symlink(target: string, path: string): Promise<void> {
        const normalized = normalize(path);
        this.symlinks.set(normalized, target);
    }
    
    async unlink(path: string): Promise<void> {
        const normalized = normalize(path);
        this.files.delete(normalized);
        this.symlinks.delete(normalized);
    }

    /** Get all file paths in the working tree (excludes .git/ and symlinks) */
    getWorkingTreeFiles(): string[] {
        return Array.from(this.files.keys())
            .map(p => normalize(p))
            .filter(p => p && !p.startsWith('.git/') && p !== '.git');
    }
}
