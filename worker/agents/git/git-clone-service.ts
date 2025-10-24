/**
 * Git clone service for building and serving repositories
 * Handles template rebasing and git HTTP protocol
 */

import git from 'isomorphic-git';
import { MemFS } from './memfs';
import { SqliteFS } from './fs-adapter';
import { createLogger } from '../../logger';
import type { TemplateDetails as SandboxTemplateDetails } from '../../services/sandbox/sandboxTypes';

const logger = createLogger('GitCloneService');

export interface RepositoryBuildOptions {
    agentGitFS: SqliteFS;
    templateDetails: SandboxTemplateDetails | null | undefined;
    appQuery: string;
}

export class GitCloneService {
    /**
     * Build in-memory git repository by rebasing agent's git history on template files
     * 
     * Strategy:
     * 1. Create base commit with template files
     * 2. Export all git objects from agent's repo (SqliteFS)
     * 3. Import git objects into MemFS
     * 4. Update refs to point to agent's commits
     * 
     * Result: Template base + agent's commit history on top
     */
    static async buildRepository(options: RepositoryBuildOptions): Promise<MemFS> {
        const { agentGitFS, templateDetails, appQuery } = options;
        const fs = new MemFS();
        
        try {
            logger.info('Building git repository with template rebasing', { 
                templateName: templateDetails?.name,
                templateFileCount: templateDetails ? Object.keys(templateDetails.allFiles).length : 0
            });
            
            // Step 1: Create base commit with template files
            await git.init({ fs, dir: '/', defaultBranch: 'main' });
            
            if (templateDetails?.allFiles) {
                // Write template files
                for (const [path, content] of Object.entries(templateDetails.allFiles)) {
                    fs.writeFile(path, content);
                }
                
                // Stage and commit template files
                await git.add({ fs, dir: '/', filepath: '.' });
                const templateCommitOid = await git.commit({
                    fs,
                    dir: '/',
                    message: `Template: ${templateDetails.name}\n\nBase template for Vibesdk application\nQuery: ${appQuery}`,
                    author: {
                        name: 'Vibesdk Template',
                        email: 'templates@cloudflare.dev',
                        timestamp: Math.floor(Date.now() / 1000)
                    }
                });
                
                logger.info('Created template base commit', { oid: templateCommitOid });
            }
            
            // Step 2: Check if agent has git history
            const agentHasGitRepo = await this.hasGitRepository(agentGitFS);
            
            if (agentHasGitRepo) {
                // Step 3: Export all git objects from agent's repo and import to MemFS
                await this.copyGitObjects(agentGitFS, fs);
                
                // Step 4: Get agent's HEAD
                try {
                    const agentHeadOid = await git.resolveRef({ fs: agentGitFS, dir: '/', ref: 'HEAD' });
                    
                    // Update main branch to point to agent's HEAD
                    // This effectively rebases agent's commits on top of template
                    await git.writeRef({
                        fs,
                        dir: '/',
                        ref: 'refs/heads/main',
                        value: agentHeadOid,
                        force: true
                    });
                    
                    logger.info('Rebased agent history on template', { 
                        agentHead: agentHeadOid 
                    });
                } catch (error) {
                    logger.warn('Could not rebase agent history', { error });
                    // Template commit is already in place, continue
                }
            } else {
                logger.info('No agent git history found, using template only');
            }
            
            logger.info('Git repository built successfully');
            return fs;
        } catch (error) {
            logger.error('Failed to build git repository', { error });
            throw new Error(`Failed to build repository: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Check if agent has initialized git repository
     */
    private static async hasGitRepository(agentFS: SqliteFS): Promise<boolean> {
        try {
            agentFS.readdir('/.git');
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Copy all git objects from agent's SqliteFS to MemFS
     * This includes commits, trees, and blobs
     */
    private static async copyGitObjects(sourceFS: SqliteFS, targetFS: MemFS): Promise<void> {
        try {
            // Copy the entire .git directory structure
            await this.copyDirectory(sourceFS, targetFS, '/.git');
            logger.info('Copied git objects from agent to MemFS');
        } catch (error) {
            logger.error('Failed to copy git objects', { error });
            throw error;
        }
    }

    /**
     * Recursively copy directory from source to target filesystem
     */
    private static async copyDirectory(
        sourceFS: SqliteFS,
        targetFS: MemFS,
        dirPath: string
    ): Promise<void> {
        const entries = sourceFS.readdir(dirPath);
        
        for (const entry of entries) {
            const fullPath = `${dirPath}/${entry}`;
            
            try {
                const stat = sourceFS.stat(fullPath);
                
                if (stat.type === 'file') {
                    // Copy file
                    const data = sourceFS.readFile(fullPath);
                    targetFS.writeFile(fullPath, data as Uint8Array);
                } else if (stat.type === 'dir') {
                    // Recursively copy directory
                    await this.copyDirectory(sourceFS, targetFS, fullPath);
                }
            } catch (error) {
                logger.warn(`Failed to copy ${fullPath}`, { error });
                // Continue with other files
            }
        }
    }

    /**
     * Handle git info/refs request
     * Returns advertisement of available refs for git clone
     */
    static async handleInfoRefs(fs: MemFS): Promise<string> {
        try {
            const head = await git.resolveRef({ fs, dir: '/', ref: 'HEAD' });
            const branches = await git.listBranches({ fs, dir: '/' });
            
            // Git HTTP protocol: info/refs response format
            let response = '001e# service=git-upload-pack\n0000';
            
            // HEAD ref with capabilities
            const headLine = `${head} HEAD\0side-band-64k thin-pack ofs-delta agent=git/isomorphic-git\n`;
            response += this.formatPacketLine(headLine);
            
            // Branch refs
            for (const branch of branches) {
                const oid = await git.resolveRef({ fs, dir: '/', ref: `refs/heads/${branch}` });
                response += this.formatPacketLine(`${oid} refs/heads/${branch}\n`);
            }
            
            // Flush packet
            response += '0000';
            
            return response;
        } catch (error) {
            logger.error('Failed to handle info/refs', { error });
            throw new Error(`Failed to get refs: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Handle git upload-pack request (actual clone operation)
     * Generates and returns packfile for git client
     */
    static async handleUploadPack(fs: MemFS): Promise<Uint8Array> {
        try {
            // For initial implementation, send all objects
            // Future optimization: parse client wants from request body
            const head = await git.resolveRef({ fs, dir: '/', ref: 'HEAD' });
            
            // Walk the commit tree to get all objects
            const { commit } = await git.readCommit({ fs, dir: '/', oid: head });
            const objects = [head, commit.tree];
            
            // Recursively collect all tree and blob objects
            const collectTreeObjects = async (treeOid: string): Promise<void> => {
                objects.push(treeOid);
                const { tree } = await git.readTree({ fs, dir: '/', oid: treeOid });
                
                for (const entry of tree) {
                    objects.push(entry.oid);
                    if (entry.type === 'tree') {
                        await collectTreeObjects(entry.oid);
                    }
                }
            };
            
            await collectTreeObjects(commit.tree);
            
            logger.info('Generating packfile', { objectCount: objects.length });
            
            // Create packfile with all objects
            const packResult = await git.packObjects({ 
                fs, 
                dir: '/', 
                oids: objects
            });
            
            // packObjects returns { packfile: Uint8Array }
            const packfile = packResult.packfile;
            
            if (!packfile) {
                throw new Error('Failed to generate packfile');
            }
            
            // Wrap packfile in sideband format for git protocol
            return this.wrapInSideband(packfile);
        } catch (error) {
            logger.error('Failed to handle upload-pack', { error });
            throw new Error(`Failed to generate pack: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Format git packet line (4-byte hex length + data)
     */
    private static formatPacketLine(data: string): string {
        const length = data.length + 4;
        const hexLength = length.toString(16).padStart(4, '0');
        return hexLength + data;
    }

    /**
     * Wrap packfile data in sideband format
     * Sideband-64k protocol for multiplexing pack data and progress
     */
    private static wrapInSideband(packfile: Uint8Array): Uint8Array {
        // Simple implementation: send packfile in one sideband message
        // Channel 1 = pack data
        const header = new Uint8Array([1]); // Sideband channel 1
        const result = new Uint8Array(header.length + packfile.length);
        result.set(header, 0);
        result.set(packfile, header.length);
        return result;
    }
}
