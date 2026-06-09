/**
 * Git clone service for building and serving repositories
 * Handles template rebasing and git HTTP protocol
 */

import git from '@ashishkumar472/cf-git';
import { MemFS } from './memfs';
import { createLogger } from '../../logger';
import type { TemplateDetails as SandboxTemplateDetails } from '../../services/sandbox/sandboxTypes';

const logger = createLogger('GitCloneService');

export interface RepositoryBuildOptions {
    gitObjects: Array<{ path: string; data: Uint8Array }>;
    templateDetails: SandboxTemplateDetails | null | undefined;
    appQuery: string;
    appCreatedAt?: Date;  // App creation timestamp for deterministic template commit
}

export class GitCloneService {
    /**
     * Build in-memory git repository by rebasing agent's git history on template files
     * 
     * Strategy:
     * 1. Create base commit with template files
     * 2. Import exported git objects from agent
     * 3. Update refs to point to agent's commits
     * 
     * Result: Template base + agent's commit history on top
     */
    static async buildRepository(options: RepositoryBuildOptions): Promise<MemFS> {
        const { gitObjects, templateDetails, appQuery, appCreatedAt } = options;
        const fs = new MemFS();
        
        try {
            logger.info('Building git repository with template rebase', { 
                templateName: templateDetails?.name,
                gitObjectCount: gitObjects.length
            });
            
            // If no agent commits yet, just create template base
            if (gitObjects.length === 0) {
                await git.init({ fs, dir: '/', defaultBranch: 'main' });
                
                if (templateDetails && templateDetails.allFiles) {
                    // Create template commit
                    for (const [path, content] of Object.entries(templateDetails.allFiles)) {
                        await fs.writeFile(path, content as string);
                        await git.add({ fs, dir: '/', filepath: path });
                    }
                    await git.commit({
                        fs, dir: '/',
                        message: `Template: ${templateDetails.name}`,
                        author: { 
                            name: 'Vibesdk', 
                            email: 'template@vibesdk.com',
                            timestamp: appCreatedAt ? Math.floor(appCreatedAt.getTime() / 1000) : 0
                        }
                    });
                }
                
                return fs;
            }
            
            await git.init({ fs, dir: '/', defaultBranch: 'main' });
            
            // Create template base commit
            let baseCommit: string | null = null;
            if (templateDetails && templateDetails.allFiles && Object.keys(templateDetails.allFiles).length > 0) {
                logger.info('Creating template base', { 
                    templateName: templateDetails.name,
                    fileCount: Object.keys(templateDetails.allFiles).length
                });
                
                for (const [path, content] of Object.entries(templateDetails.allFiles)) {
                    await fs.writeFile(path, content as string);
                    await git.add({ fs, dir: '/', filepath: path });
                }
                
                baseCommit = await git.commit({
                    fs, dir: '/',
                    message: `Template: ${templateDetails.name}\n\nBase template for ${appQuery}`,
                    author: { 
                        name: 'Vibesdk', 
                        email: 'template@vibesdk.com',
                        timestamp: appCreatedAt ? Math.floor(appCreatedAt.getTime() / 1000) : 0
                    }
                });
                
                logger.info('Template base created', { baseCommit });
            }
            
            // Find agent's HEAD from exported objects
            const headFile = gitObjects.find(obj => obj.path === '.git/HEAD');
            const headContent = headFile ? new TextDecoder().decode(headFile.data).trim() : null;
            
            let agentHeadOid: string | null = null;
            if (headContent && headContent.startsWith('ref: ')) {
                // HEAD is a ref, resolve it
                const refPath = headContent.slice(5).trim();
                const refFile = gitObjects.find(obj => obj.path === `.git/${refPath}`);
                agentHeadOid = refFile ? new TextDecoder().decode(refFile.data).trim() : null;
            } else if (headContent && headContent.length === 40) {
                // HEAD is direct SHA
                agentHeadOid = headContent;
            }
            
            if (!agentHeadOid) {
                throw new Error('Could not determine agent HEAD from exported objects');
            }
            
            logger.info('Found agent original HEAD', { agentHeadOid });
            
            // Import git objects (skip refs to preserve template base)
            logger.info('Importing agent git objects', { count: gitObjects.length });
            let importedCount = 0;
            for (const obj of gitObjects) {
                if (obj.path.startsWith('.git/refs/') || obj.path === '.git/HEAD' || obj.path === '.git/packed-refs') {
                    continue;
                }
                await fs.writeFile(obj.path, obj.data);
                importedCount++;
            }
            logger.info('Imported git objects (excluding refs)', { importedCount });
            
            // Get agent's commit history (oldest to newest)
            const agentLog = await git.log({ fs, dir: '/', ref: agentHeadOid });
            const commitsOldestFirst = agentLog.reverse();
            
            logger.info('Replaying agent commits on template base', { 
                commitCount: commitsOldestFirst.length,
                hasTemplate: !!baseCommit
            });
            
            // Replay agent commits on top of template base
            for (const commitInfo of commitsOldestFirst) {
                // Collect files from agent's commit tree
                const agentFiles: Array<{ path: string; oid: string }> = [];
                
                const walkTree = async (treeOid: string, basePath: string = '') => {
                    const { tree } = await git.readTree({ fs, dir: '/', oid: treeOid });
                    
                    for (const entry of tree) {
                        const fullPath = basePath ? `${basePath}/${entry.path}` : entry.path;
                        
                        if (entry.type === 'blob') {
                            agentFiles.push({ path: fullPath, oid: entry.oid });
                        } else if (entry.type === 'tree') {
                            await walkTree(entry.oid, fullPath);
                        }
                    }
                };
                
                await walkTree(commitInfo.commit.tree);
                
                // Write agent files
                for (const file of agentFiles) {
                    const { blob } = await git.readBlob({ fs, dir: '/', oid: file.oid });
                    await fs.writeFile(file.path, blob);
                }
                
                // Stage all files (template + agent)
                const allFiles: string[] = [];
                const getAllFiles = async (dir: string): Promise<void> => {
                    const entries = await fs.readdir(dir);
                    for (const entry of entries) {
                        const fullPath = dir === '/' ? entry : `${dir}/${entry}`;
                        if (entry === '.git' || fullPath === '.git') continue;
                        
                        const stat = await fs.stat(fullPath);
                        if (stat.type === 'dir') {
                            await getAllFiles(fullPath);
                        } else {
                            allFiles.push(fullPath.startsWith('/') ? fullPath.slice(1) : fullPath);
                        }
                    }
                };
                
                await getAllFiles('/');
                
                for (const filepath of allFiles) {
                    await git.add({ fs, dir: '/', filepath });
                }
                
                // Commit with original metadata
                await git.commit({
                    fs,
                    dir: '/',
                    message: commitInfo.commit.message,
                    author: commitInfo.commit.author,
                    committer: commitInfo.commit.committer || commitInfo.commit.author
                });
            }
            
            logger.info('Repository built with proper template base and agent commits');
            return fs;
        } catch (error) {
            logger.error('Failed to build git repository', { error });
            throw new Error(`Failed to build repository: ${error instanceof Error ? error.message : String(error)}`);
        }
    }


    /**
     * Handle git info/refs request
     * Returns advertisement of available refs for git clone
     */
    static async handleInfoRefs(fs: MemFS): Promise<string> {
        try {
            logger.info('Generating info/refs response');
            
            const head = await git.resolveRef({ fs, dir: '/', ref: 'HEAD' });
            logger.info('Resolved HEAD', { head });
            
            // Manually list branches from .git/refs/heads/ to avoid git.listBranches() hanging
            let branches: string[] = [];
            try {
                const headsDir = await fs.readdir('.git/refs/heads');
                branches = headsDir.filter((name: string) => !name.startsWith('.'));
                logger.info('Found branches', { branches });
            } catch (err) {
                logger.warn('No branches found', { error: err });
                branches = [];
            }
            
            // Git HTTP protocol: info/refs response format
            let response = '001e# service=git-upload-pack\n0000';
            
            // HEAD ref with capabilities
            const headLine = `${head} HEAD\0side-band-64k thin-pack ofs-delta agent=git/isomorphic-git\n`;
            response += this.formatPacketLine(headLine);
            
            // Branch refs
            for (const branch of branches) {
                try {
                    const oid = await git.resolveRef({ fs, dir: '/', ref: `refs/heads/${branch}` });
                    response += this.formatPacketLine(`${oid} refs/heads/${branch}\n`);
                    logger.info('Added branch ref', { branch, oid });
                } catch (err) {
                    logger.warn('Failed to resolve branch', { branch, error: err });
                }
            }
            
            // Flush packet
            response += '0000';
            
            logger.info('Generated info/refs response', { responseLength: response.length });
            return response;
        } catch (error) {
            logger.error('Failed to handle info/refs', { error });
            throw new Error(`Failed to get refs: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Handle git upload-pack request (actual clone operation)
     * Only includes reachable objects from HEAD for optimal pack size
     */
    static async handleUploadPack(fs: MemFS): Promise<Uint8Array> {
        try {
            // Collect only reachable objects from HEAD
            const reachableObjects = new Set<string>();
            
            // Get HEAD ref
            const head = await git.resolveRef({ fs, dir: '/', ref: 'HEAD' });
            reachableObjects.add(head);
            
            // Walk commit history
            const commits = await git.log({ fs, dir: '/', ref: 'HEAD' });
            
            for (const commit of commits) {
                // Add commit OID
                reachableObjects.add(commit.oid);
                
                // Add tree OID
                reachableObjects.add(commit.commit.tree);
                
                // Walk tree to get all blobs recursively
                try {
                    const collectTreeObjects = async (treeOid: string) => {
                        reachableObjects.add(treeOid);
                        const treeData = await git.readTree({ fs, dir: '/', oid: treeOid });
                        
                        for (const entry of treeData.tree) {
                            reachableObjects.add(entry.oid);
                            
                            // If it's a tree, recurse
                            if (entry.type === 'tree') {
                                await collectTreeObjects(entry.oid);
                            }
                        }
                    };
                    
                    await collectTreeObjects(commit.commit.tree);
                } catch (error) {
                    logger.warn('Failed to read tree for commit', { 
                        commitOid: commit.oid, 
                        error: error instanceof Error ? error.message : String(error)
                    });
                }
            }
            
            logger.info('Generating packfile with reachable objects only', { 
                objectCount: reachableObjects.size,
                commitCount: commits.length 
            });
            
            const packResult = await git.packObjects({ 
                fs, 
                dir: '/', 
                oids: Array.from(reachableObjects)
            });
            
            const packfile = packResult.packfile;
            
            if (!packfile) {
                throw new Error('Failed to generate packfile');
            }
            
            // NAK packet: "0008NAK\n"
            const nakPacket = new Uint8Array([
                0x30, 0x30, 0x30, 0x38,
                0x4e, 0x41, 0x4b,
                0x0a
            ]);
            
            // Wrap packfile in sideband format
            const sideband = this.wrapInSideband(packfile);
            
            // Concatenate NAK + sideband packfile
            const result = new Uint8Array(nakPacket.length + sideband.length);
            result.set(nakPacket, 0);
            result.set(sideband, nakPacket.length);
            
            return result;
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
     * Wrap packfile in sideband-64k format
     */
    private static wrapInSideband(packfile: Uint8Array): Uint8Array {
        const CHUNK_SIZE = 65515;
        const chunks: Uint8Array[] = [];
        let offset = 0;
        while (offset < packfile.length) {
            const chunkSize = Math.min(CHUNK_SIZE, packfile.length - offset);
            const chunk = packfile.slice(offset, offset + chunkSize);
            
            const packetLength = 4 + 1 + chunkSize;
            const lengthHex = packetLength.toString(16).padStart(4, '0');
            const packet = new Uint8Array(4 + 1 + chunkSize);
            for (let i = 0; i < 4; i++) {
                packet[i] = lengthHex.charCodeAt(i);
            }
            packet[4] = 0x01;
            packet.set(chunk, 5);
            
            chunks.push(packet);
            offset += chunkSize;
        }
        
        const flush = new Uint8Array([0x30, 0x30, 0x30, 0x30]);
        chunks.push(flush);
        const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
        const result = new Uint8Array(totalLength);
        let resultOffset = 0;
        for (const chunk of chunks) {
            result.set(chunk, resultOffset);
            resultOffset += chunk.length;
        }
        
        return result;
    }
}
