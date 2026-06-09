/**
 * GitHub service for repository creation and export
 */

import { Octokit } from '@octokit/rest';
import { createLogger } from '../../logger';
import {
    GitHubRepository,
    CreateRepositoryOptions,
    CreateRepositoryResult,
    GitHubServiceError,
} from './types';
import { GitHubPushResponse, TemplateDetails } from '../sandbox/sandboxTypes';
import { GitCloneService } from '../../agents/git/git-clone-service';
import git from '@ashishkumar472/cf-git';
import http from '@ashishkumar472/cf-git/http/web';
import { prepareCloudflareButton } from '../../utils/deployToCf';
import type { MemFS } from '../../agents/git/memfs';

export class GitHubService {
    private static readonly logger = createLogger('GitHubService');

    static createOctokit(token: string): Octokit {
        if (!token?.trim()) {
            throw new GitHubServiceError('No GitHub token provided', 'NO_TOKEN');
        }
        return new Octokit({ auth: token });
    }
    
    /**
     * Create a new GitHub repository
     */
    static async createUserRepository(
        options: CreateRepositoryOptions
    ): Promise<CreateRepositoryResult> {
        const autoInit = options.auto_init ?? true;
        
        GitHubService.logger.info('Creating GitHub repository', {
            name: options.name,
            private: options.private,
            auto_init: autoInit,
            description: options.description ? 'provided' : 'none'
        });
        
        try {
            const octokit = GitHubService.createOctokit(options.token);
            
            const { data: repository } = await octokit.repos.createForAuthenticatedUser({
                name: options.name,
                description: options.description,
                private: options.private,
                auto_init: autoInit,
            });

            GitHubService.logger.info('Successfully created repository', {
                html_url: repository.html_url
            });

            return {
                success: true,
                repository: repository as GitHubRepository
            };
        } catch (error: unknown) {
            const octokitError = error as { status?: number; message?: string; response?: { data?: { errors?: Array<{ field?: string; message?: string }> } } };
            
            GitHubService.logger.error('Repository creation failed', {
                status: octokitError?.status,
                message: octokitError?.message,
                name: options.name
            });
            
            if (octokitError?.status === 403) {
                return {
                    success: false,
                    error: 'GitHub App lacks required permissions. Please ensure the app has Contents: Write and Metadata: Read permissions, then re-install it.'
                };
            }
            
            // Check if repository already exists (422 Unprocessable Entity)
            if (octokitError?.status === 422) {
                const hasNameExistsError = octokitError?.response?.data?.errors?.some((e) => 
                    e.field === 'name' && e.message?.includes('already exists')
                );
                
                if (hasNameExistsError) {
                    return {
                        success: false,
                        error: `Repository '${options.name}' already exists on this account`,
                        alreadyExists: true,
                        repositoryName: options.name
                    };
                }
            }
            
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to create repository'
            };
        }
    }


    /**
     * Get repository information from GitHub
     */
    static async getRepository(options: {
        owner: string;
        repo: string;
        token: string;
    }): Promise<{ success: boolean; repository?: GitHubRepository; error?: string }> {
        try {
            const octokit = GitHubService.createOctokit(options.token);
            
            const { data: repository } = await octokit.repos.get({
                owner: options.owner,
                repo: options.repo
            });

            GitHubService.logger.info('Successfully fetched repository', {
                html_url: repository.html_url
            });
            
            return { 
                success: true, 
                repository: repository as GitHubRepository 
            };
        } catch (error: unknown) {
            const octokitError = error as { status?: number; message?: string };
            
            GitHubService.logger.error('Failed to fetch repository', {
                owner: options.owner,
                repo: options.repo,
                status: octokitError?.status,
                message: octokitError?.message
            });
            return { 
                success: false, 
                error: error instanceof Error ? error.message : 'Failed to fetch repository' 
            };
        }
    }

    /**
     * Check if repository exists on GitHub
     */
    static async repositoryExists(options: {
        repositoryUrl: string;
        token: string;
    }): Promise<boolean> {
        const repoInfo = GitHubService.extractRepoInfo(options.repositoryUrl);
        
        if (!repoInfo) {
            return false;
        }

        try {
            const octokit = GitHubService.createOctokit(options.token);
            await octokit.repos.get({
                owner: repoInfo.owner,
                repo: repoInfo.repo
            });
            
            return true;
        } catch (error) {
            GitHubService.logger.error('Repository existence check failed', {
                repositoryUrl: options.repositoryUrl,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            return false;
        }
    }

    /**
     * Parse owner and repo name from GitHub URL
     */
    static extractRepoInfo(url: string): { owner: string; repo: string } | null {
        try {
            // Convert SSH URLs to HTTPS
            let cleanUrl = url;
            
            if (url.startsWith('git@github.com:')) {
                cleanUrl = url.replace('git@github.com:', 'https://github.com/');
            }
            
            const urlObj = new URL(cleanUrl);
            const pathParts = urlObj.pathname.split('/').filter(part => part);
            
            if (pathParts.length >= 2) {
                const owner = pathParts[0];
                const repo = pathParts[1].replace('.git', '');
                return { owner, repo };
            }
            
            return null;
        } catch (error) {
            GitHubService.logger.error('Failed to parse repository URL', { url, error });
            return null;
        }
    }

    /**
     * Export git repository to GitHub using native git push protocol
     * Falls back to REST API if push fails
     */
    static async exportToGitHub(options: {
        gitObjects: Array<{ path: string; data: Uint8Array }>;
        templateDetails: TemplateDetails | null;
        appQuery: string;
        appCreatedAt?: Date;
        token: string;
        repositoryUrl: string;
        username: string;
        email: string;
        useGitPush?: boolean; // Feature flag for git push vs REST API
    }): Promise<GitHubPushResponse> {
        try {
            GitHubService.logger.info('Starting GitHub export from DO git', {
                gitObjectCount: options.gitObjects.length,
                repositoryUrl: options.repositoryUrl
            });

            // Build in-memory repo from DO git objects
            const fs = await GitCloneService.buildRepository({
                gitObjects: options.gitObjects,
                templateDetails: options.templateDetails,
                appQuery: options.appQuery,
                appCreatedAt: options.appCreatedAt
            });

            // Modify README to add GitHub deploy button
            await GitHubService.modifyReadmeForGitHub(fs, options.repositoryUrl);

            // Get all commits from built repo
            const commits = await git.log({ fs, dir: '/', depth: 1000 });

            GitHubService.logger.info('Repository built', {
                commitCount: commits.length,
            });
            const pushResult = await GitHubService.pushViaGitProtocol(
                fs,
                options.token,
                options.repositoryUrl,
            );
            return pushResult;
        } catch (error) {
            GitHubService.logger.error('GitHub export failed', error);
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            return {
                success: false,
                error: `GitHub export failed: ${errorMessage}`
            };
        }
    }

    /**
     * Replace [cloudflarebutton] placeholder with deploy button
     */
    private static async modifyReadmeForGitHub(fs: MemFS, githubRepoUrl: string): Promise<void> {
        try {
            // Check if README exists
            try {
                await fs.stat('/README.md');
            } catch {
                GitHubService.logger.info('No README.md found, skipping modification');
                return;
            }

            const contentRaw = await fs.readFile('/README.md', { encoding: 'utf8' });
            const content = typeof contentRaw === 'string' ? contentRaw : new TextDecoder().decode(contentRaw);
            
            if (!content.includes('[cloudflarebutton]')) {
                GitHubService.logger.info('README.md has no [cloudflarebutton] placeholder');
                return;
            }

            const modified = content.replaceAll(
                '[cloudflarebutton]',
                prepareCloudflareButton(githubRepoUrl, 'markdown')
            );

            await fs.writeFile('/README.md', modified);
            await git.add({ fs, dir: '/', filepath: 'README.md' });
            await git.commit({
                fs,
                dir: '/',
                message: 'docs: Add Cloudflare deploy button to README',
                author: { 
                    name: 'vibesdk-bot', 
                    email: 'bot@vibesdk.com',
                    timestamp: Math.floor(Date.now() / 1000)
                }
            });

            GitHubService.logger.info('README.md modified and committed');
        } catch (error) {
            GitHubService.logger.warn('Failed to modify README, continuing without', error);
        }
    }

    /**
     * Normalize commit message for comparison
     */
    private static normalizeCommitMessage(message: string): string {
        return message.trim();
    }

    /**
     * Check if commit is system-generated
     */
    private static isSystemGeneratedCommit(message: string): boolean {
        const normalized = GitHubService.normalizeCommitMessage(message);
        return normalized.startsWith('docs: Add Cloudflare deploy button');
    }

    /**
     * Find last common commit between local and remote
     * Returns index in reversed (oldest-first) local commits and GitHub SHA
     */
    private static findLastCommonCommit(
        localCommits: Awaited<ReturnType<typeof git.log>>,
        remoteCommits: Array<{ sha: string; commit: { message: string } }>
    ): { lastCommonIndex: number; githubSha: string; localOid: string } | null {
        const reversedLocal = [...localCommits].reverse();
        
        // Search from newest to oldest local commit
        for (let i = reversedLocal.length - 1; i >= 0; i--) {
            const localMsg = GitHubService.normalizeCommitMessage(reversedLocal[i].commit.message);
            
            // Find matching remote commit (ignore system commits)
            const matchingRemote = remoteCommits.find(remote => {
                if (GitHubService.isSystemGeneratedCommit(remote.commit.message)) {
                    return false;
                }
                return GitHubService.normalizeCommitMessage(remote.commit.message) === localMsg;
            });
            
            if (matchingRemote) {
                return {
                    lastCommonIndex: i,
                    githubSha: matchingRemote.sha,
                    localOid: reversedLocal[i].oid
                };
            }
        }
        
        return null;
    }

    /**
     * Push to GitHub using native git push protocol
     * Much simpler and faster than REST API approach
     * Automatically handles incremental sync and packfile optimization
     */
    private static async pushViaGitProtocol(
        fs: MemFS,
        token: string,
        repositoryUrl: string,
    ): Promise<GitHubPushResponse> {
        try {
            // Extract repo info for logging
            const repoInfo = GitHubService.extractRepoInfo(repositoryUrl);
            if (!repoInfo) {
                throw new GitHubServiceError('Invalid repository URL format', 'INVALID_REPO_URL');
            }

            const { owner, repo } = repoInfo;
            
            GitHubService.logger.info('Setting up git push', {
                owner,
                repo,
                url: repositoryUrl
            });

            // Convert https://github.com/owner/repo to https://github.com/owner/repo.git
            const gitUrl = repositoryUrl.endsWith('.git') ? repositoryUrl : `${repositoryUrl}.git`;

            // Configure remote
            try {
                // Remove remote if it exists
                await git.deleteRemote({ fs, dir: '/', remote: 'github' }).catch(() => {
                    // Ignore error if remote doesn't exist
                });
            } catch {
                // Ignore
            }

            // Add fresh remote
            await git.addRemote({
                fs,
                dir: '/',
                remote: 'github',
                url: gitUrl
            });

            GitHubService.logger.info('Remote configured, starting push', {
                remote: 'github',
                url: gitUrl
            });

            // Push with force to handle sync
            // Set timeout to prevent hanging
            const PUSH_TIMEOUT_MS = 120000; // 2 minutes
            const pushPromise = git.push({
                fs,
                http, // Built-in Cloudflare Workers HTTP client
                dir: '/',
                remote: 'github',
                ref: 'main',
                force: true, // Allow non-fast-forward pushes for sync
                onAuth: () => ({
                    username: token, // GitHub accepts token as username
                    password: 'x-oauth-basic' // Or just empty string
                }),
                onAuthFailure: (url: any) => {
                    GitHubService.logger.error('Authentication failed', { url });
                },
                onAuthSuccess: (url: any) => {
                    GitHubService.logger.info('Authentication successful', { url });
                },
                onProgress: (progress: any) => {
                    GitHubService.logger.info('Push progress', {
                        phase: progress.phase,
                        loaded: progress.loaded,
                        total: progress.total
                    });
                },
                onMessage: (message) => {
                    GitHubService.logger.info('Git message', { message });
                }
            });

            // Race against timeout
            const timeoutPromise = new Promise<never>((_, reject) => {
                setTimeout(() => {
                    reject(new Error(`Git push timed out after ${PUSH_TIMEOUT_MS}ms`));
                }, PUSH_TIMEOUT_MS);
            });

            const pushResult = await Promise.race([pushPromise, timeoutPromise]);

            GitHubService.logger.info('Git push result', { pushResult });

            // Check if push was successful
            if (!pushResult.ok) {
                throw new Error(pushResult.error || 'Push failed');
            }

            // Get the final commit SHA
            const headCommit = await git.resolveRef({ fs, dir: '/', ref: 'HEAD' });

            return {
                success: true,
                commitSha: headCommit
            };
        } catch (error) {
            GitHubService.logger.error('Git push failed', { 
                error,
                errorMessage: error instanceof Error ? error.message : String(error),
                errorStack: error instanceof Error ? error.stack : undefined
            });
            throw error;
        }
    }

    /**
     * Check remote repository status vs local commits
     * Builds local repo with template to match export structure
     */
    static async checkRemoteStatus(options: {
        gitObjects: Array<{ path: string; data: Uint8Array }>;
        templateDetails: TemplateDetails | null;
        appQuery: string;
        appCreatedAt?: Date;
        repositoryUrl: string;
        token: string;
    }): Promise<{
        compatible: boolean;
        behindBy: number;
        aheadBy: number;
        divergedCommits: Array<{
            sha: string;
            message: string;
            author: string;
            date: string;
        }>;
    }> {
        try {
            const repoInfo = GitHubService.extractRepoInfo(options.repositoryUrl);
            if (!repoInfo) {
                throw new GitHubServiceError('Invalid repository URL', 'INVALID_REPO_URL');
            }

            const { owner, repo } = repoInfo;
            const octokit = GitHubService.createOctokit(options.token);

            // Get remote commits
            const { data: remoteCommits } = await octokit.repos.listCommits({
                owner,
                repo,
                per_page: 100
            });

            // Build local repo with same template as export
            const fs = await GitCloneService.buildRepository({
                gitObjects: options.gitObjects,
                templateDetails: options.templateDetails,
                appQuery: options.appQuery,
                appCreatedAt: options.appCreatedAt
            });

            const localCommits = await git.log({ fs, dir: '/', depth: 100 });

            // Find divergence
            
            // Use shared helper for finding common commits
            const commonCommit = GitHubService.findLastCommonCommit(localCommits, remoteCommits);
            const hasCommonCommit = commonCommit !== null || remoteCommits.length === 0;
            
            const localMessages = new Set(
                localCommits.map(c => GitHubService.normalizeCommitMessage(c.commit.message))
            );
            const remoteMessages = new Set(
                remoteCommits.map(c => GitHubService.normalizeCommitMessage(c.commit.message))
            );
            
            const localOnly = localCommits.filter(c => 
                !remoteMessages.has(GitHubService.normalizeCommitMessage(c.commit.message))
            );
            const remoteOnly = remoteCommits.filter(c => 
                !localMessages.has(GitHubService.normalizeCommitMessage(c.commit.message)) && 
                !GitHubService.isSystemGeneratedCommit(c.commit.message)
            );

            return {
                compatible: hasCommonCommit || remoteCommits.length === 0,
                behindBy: localOnly.length,
                aheadBy: remoteOnly.length,
                divergedCommits: remoteOnly.map(c => ({
                    sha: c.sha,
                    message: c.commit.message,
                    author: c.commit.author?.name || 'Unknown',
                    date: c.commit.author?.date || new Date().toISOString()
                }))
            };
        } catch (error) {
            GitHubService.logger.error('Failed to check remote status', error);
            throw error;
        }
    }

}