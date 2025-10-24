/**
 * Git version control for Durable Objects using isomorphic-git
 */

import git from 'isomorphic-git';
import { SqliteFS, type SqlExecutor } from './fs-adapter';
import { FileOutputType } from '../schemas';

export interface CommitInfo {
    oid: string;
    message: string;
    author: string;
    timestamp: number;
}

type FileSnapshot = Omit<FileOutputType, 'filePurpose'>;

export class GitVersionControl {
    public fs: SqliteFS;
    private author: { name: string; email: string };

    constructor(sql: SqlExecutor, author?: { name: string; email: string }) {
        this.fs = new SqliteFS(sql);
        this.author = author || { name: 'Vibesdk', email: 'vibesdk-bot@cloudflare.com' };
        
        // Initialize SQLite table synchronously
        this.fs.init();
    }

    async init(): Promise<void> {
        // Initialize git repository (isomorphic-git operations are async)
        try {
            console.log('Checking for git repository...');
            this.fs.readdir('/.git');
            console.log('Git repository found');
        } catch {
            console.log('Git repository not found, initializing...');
            try {
                await git.init({ fs: this.fs, dir: '/', defaultBranch: 'main' });
            } catch (error) {
                console.error(`Failed to initialize git repository:`, error);
            }
        }
    }

    async commit(files: FileSnapshot[], message?: string): Promise<string | null> {
        if (!files.length) throw new Error('Cannot create empty commit');

        // Normalize paths (remove leading slashes for git)
        const normalizedFiles = files.map(f => ({
            path: f.filePath.startsWith('/') ? f.filePath.slice(1) : f.filePath,
            content: f.fileContents
        }));

        // Write and stage files first
        for (const file of normalizedFiles) {
            try {
                this.fs.writeFile(file.path, file.content); // Synchronous
                await git.add({ fs: this.fs, dir: '/', filepath: file.path });
            } catch (error) {
                throw new Error(`Failed to write/stage file ${file.path}: ${error instanceof Error ? error.message : String(error)}`);
            }
        }

        // Check if there are actual changes (compare staged vs HEAD)
        let hasChanges = false;
        try {
            const status = await git.statusMatrix({ fs: this.fs, dir: '/' });
            // row[1] = HEAD index, row[2] = STAGE index
            // If they differ, we have changes to commit
            hasChanges = status.some(row => row[1] !== row[2]);
        } catch (e) {
            // First commit or error, assume changes
            hasChanges = true;
        }

        if (!hasChanges) {
            return null; // No actual changes to commit
        }

        return git.commit({
            fs: this.fs,
            dir: '/',
            message: message || `Auto-checkpoint (${new Date().toISOString()})`,
            author: {
                name: this.author.name,
                email: this.author.email,
                timestamp: Math.floor(Date.now() / 1000)
            }
        });
    }

    async log(limit = 50): Promise<CommitInfo[]> {
        try {
            const commits = await git.log({ fs: this.fs, dir: '/', depth: limit, ref: 'main' });
            return commits.map(c => ({
                oid: c.oid,
                message: c.commit.message,
                author: `${c.commit.author.name} <${c.commit.author.email}>`,
                timestamp: c.commit.author.timestamp * 1000
            }));
        } catch {
            return [];
        }
    }

    async checkout(oid: string): Promise<FileSnapshot[]> {
        const { commit } = await git.readCommit({ fs: this.fs, dir: '/', oid });
        const files: FileSnapshot[] = [];
        await this.walkTree(commit.tree, '', files);
        return files;
    }

    private async walkTree(treeOid: string, prefix: string, files: FileSnapshot[]): Promise<void> {
        const { tree } = await git.readTree({ fs: this.fs, dir: '/', oid: treeOid });

        for (const entry of tree) {
            const path = prefix ? `${prefix}/${entry.path}` : entry.path;

            if (entry.type === 'blob') {
                const { blob } = await git.readBlob({ fs: this.fs, dir: '/', oid: entry.oid });
                // Git blobs are binary, decode with proper error handling
                try {
                    const content = new TextDecoder('utf-8').decode(blob);
                    // Check if it's valid text by looking for null bytes
                    if (!content.includes('\0')) {
                        files.push({ filePath: path, fileContents: content });
                    }
                    // Skip binary files (checkout is for reverting code files)
                } catch {
                    // Failed to decode, skip binary file
                }
            } else if (entry.type === 'tree') {
                await this.walkTree(entry.oid, path, files);
            }
        }
    }

    async getHead(): Promise<string | null> {
        try {
            return await git.resolveRef({ fs: this.fs, dir: '/', ref: 'HEAD' });
        } catch {
            return null;
        }
    }

    /**
     * Get storage statistics for monitoring and observability
     */
    getStorageStats(): { totalObjects: number; totalBytes: number; largestObject: { path: string; size: number } | null } {
        return this.fs.getStorageStats();
    }
}