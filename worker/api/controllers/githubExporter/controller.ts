import { BaseController } from '../baseController';
import { RouteContext } from '../../types/route-context';
import { GitHubService } from '../../../services/github';
import { GitHubExporterOAuthProvider } from '../../../services/oauth/github-exporter';
import { getAgentStub } from '../../../agents';
import { createLogger } from '../../../logger';
import { AppService } from '../../../database/services/AppService';

export interface GitHubExportData {
    success: boolean;
    repositoryUrl?: string;
    error?: string;
}

interface GitHubOAuthCallbackState {
    userId: string;
    timestamp: number;
    purpose: 'repository_export';
    agentId?: string;
    returnUrl: string;
    exportData?: {
        repositoryName: string;
        description?: string;
        isPrivate?: boolean;
    };
}

export class GitHubExporterController extends BaseController {
    static readonly logger = createLogger('GitHubExporterController');

    /**
     * Creates GitHub repository and pushes files from agent
     * If existingRepositoryUrl is provided, skips creation and syncs to existing repo
     */
    private static async createRepositoryAndPush(options: {
        env: Env;
        agentId: string;
        repositoryName: string;
        description?: string;
        isPrivate: boolean;
        token: string;
        username: string;
        existingRepositoryUrl?: string;
    }): Promise<
        | { success: true; repositoryUrl: string } 
        | { success: false; error: string; alreadyExists?: boolean; existingRepositoryUrl?: string }
    > {
        const { env, agentId, repositoryName, description, isPrivate, token, username, existingRepositoryUrl } = options;
        
        try {
            let repositoryUrl: string | undefined;
            let cloneUrl: string | undefined;
            
            // Check database for existing repository if not provided
            let finalExistingRepoUrl = existingRepositoryUrl;
            if (!finalExistingRepoUrl) {
                try {
                    const appService = new AppService(env);
                    const app = await appService.getAppDetails(agentId);
                    finalExistingRepoUrl = app?.githubRepositoryUrl || undefined;
                    
                    if (finalExistingRepoUrl) {
                        this.logger.info('Found existing GitHub repository in database', { 
                            agentId, 
                            repositoryUrl: finalExistingRepoUrl 
                        });
                    }
                } catch (error) {
                    this.logger.warn('Failed to check for existing repository', { error, agentId });
                }
            }
            
            // Determine repository details (sync to existing or create new)
            if (finalExistingRepoUrl) {
                // Check if repository still exists on GitHub
                const exists = await GitHubService.repositoryExists({
                    repositoryUrl: finalExistingRepoUrl,
                    token
                });
                
                if (!exists) {
                    // Repository doesn't exist - clear from database and create new
                    this.logger.info('Repository no longer exists, creating new one', {
                        agentId,
                        oldUrl: finalExistingRepoUrl,
                        repositoryName
                    });
                    
                    try {
                        const appService = new AppService(env);
                        await appService.updateGitHubRepository(agentId, '', 'public');
                    } catch (clearError) {
                        this.logger.warn('Failed to clear repository URL', { error: clearError, agentId });
                    }
                    
                    // Create new repository
                    finalExistingRepoUrl = undefined;
                } else {
                    // Repository exists, use it
                    repositoryUrl = finalExistingRepoUrl;
                    cloneUrl = finalExistingRepoUrl.endsWith('.git') 
                        ? finalExistingRepoUrl 
                        : `${finalExistingRepoUrl}.git`;
                }
            }
            
            if (!finalExistingRepoUrl) {
                this.logger.info('Creating new repository', { agentId, repositoryName });
                
                const createResult = await GitHubService.createUserRepository({
                    name: repositoryName,
                    description,
                    private: isPrivate,
                    token
                });

                if (!createResult.success) {
                    // Repository already exists on GitHub - fetch the actual repository
                    if (createResult.alreadyExists && createResult.repositoryName) {
                        this.logger.warn('Repository already exists, fetching repository info', { 
                            agentId, 
                            repositoryName: createResult.repositoryName 
                        });
                        
                        const repoResult = await GitHubService.getRepository({
                            owner: username,
                            repo: createResult.repositoryName,
                            token
                        });
                        
                        if (repoResult.success && repoResult.repository) {
                            return { 
                                success: false, 
                                error: 'Repository already exists',
                                alreadyExists: true,
                                existingRepositoryUrl: repoResult.repository.html_url
                            };
                        }
                    }
                    
                    return { success: false, error: createResult.error || 'Repository creation failed' };
                }

                if (!createResult.repository) {
                    return { success: false, error: 'Repository creation failed' };
                }

                const { repository } = createResult;
                repositoryUrl = repository.html_url;
                cloneUrl = repository.clone_url;
                
                this.logger.info('Repository created', { agentId, repositoryUrl });
            }

            // Ensure repository URLs are set
            if (!repositoryUrl || !cloneUrl) {
                return { 
                    success: false, 
                    error: 'Failed to determine repository URLs' 
                };
            }

            // Push files to repository
            this.logger.info('Pushing files to repository', { agentId, repositoryUrl });
            
            const agentStub = await getAgentStub(env, agentId);
            const pushResult = await agentStub.pushToGitHub({
                cloneUrl,
                repositoryHtmlUrl: repositoryUrl,
                isPrivate,
                token,
                email: 'vibesdk-bot@cloudflare.com',
                username
            });

            if (!pushResult?.success) {
                return { 
                    success: false, 
                    error: pushResult?.error || (finalExistingRepoUrl ? 'Sync failed' : 'File push failed')
                };
            }

            const operationType = finalExistingRepoUrl ? 'Sync' : 'Export';
            this.logger.info(`${operationType} completed`, { agentId, repositoryUrl });
            
            return { success: true, repositoryUrl };
        } catch (error) {
            this.logger.error('Repository operation failed', { error, agentId, repositoryName });
            return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
        }
    }

    static async handleOAuthCallback(
        request: Request,
        env: Env,
        _ctx: ExecutionContext,
        context: RouteContext,
    ): Promise<Response> {
        try {
            const code = context.queryParams.get('code');
            const stateParam = context.queryParams.get('state');
            const error = context.queryParams.get('error');

            if (error) {
                this.logger.error('OAuth authorization error', { error });
                return Response.redirect(
                    `${new URL(request.url).origin}/settings?integration=github&status=error&reason=${encodeURIComponent(error)}`,
                    302,
                );
            }

            if (!code) {
                return Response.redirect(
                    `${new URL(request.url).origin}/settings?integration=github&status=error&reason=missing_code`,
                    302,
                );
            }

            let parsedState: GitHubOAuthCallbackState | null = null;
            
            if (stateParam) {
                try {
                    parsedState = JSON.parse(
                        Buffer.from(stateParam, 'base64').toString(),
                    ) as GitHubOAuthCallbackState;
                } catch (error) {
                    this.logger.error('Failed to parse OAuth state parameter', error);
                }
            }

            if (!parsedState || !parsedState.userId) {
                return Response.redirect(
                    `${new URL(request.url).origin}/settings?integration=github&status=error&reason=invalid_state`,
                    302,
                );
            }

            const { userId, purpose, agentId, exportData, returnUrl } = parsedState;

            const baseUrl = new URL(request.url).origin;
            const oauthProvider = GitHubExporterOAuthProvider.create(env, baseUrl);

            const tokenResult = await oauthProvider.exchangeCodeForTokens(code);

            if (!tokenResult || !tokenResult.accessToken) {
                this.logger.error('Failed to exchange OAuth code', { userId });
                
                return Response.redirect(
                    `${returnUrl}?github_export=error&reason=token_exchange_failed`,
                    302,
                );
            }

            this.logger.info('OAuth authorization successful', {
                userId,
                purpose
            });

            if (purpose === 'repository_export' && exportData && agentId) {
                const result = await this.createRepositoryAndPush({
                    env,
                    agentId,
                    repositoryName: exportData.repositoryName,
                    description: exportData.description,
                    isPrivate: exportData.isPrivate || false,
                    token: tokenResult.accessToken,
                    username: 'vibesdk-bot'
                });

                if (!result.success) {
                    return Response.redirect(
                        `${returnUrl}?github_export=error&reason=${encodeURIComponent(result.error)}`,
                        302,
                    );
                }

                this.logger.info('OAuth export completed', { userId, agentId, repositoryUrl: result.repositoryUrl });

                return Response.redirect(
                    `${returnUrl}?github_export=success&repository_url=${encodeURIComponent(result.repositoryUrl)}`,
                    302,
                );
            }

            return Response.redirect(
                `${returnUrl}?integration=github&status=oauth_success`,
                302,
            );
        } catch (error) {
            this.logger.error('Failed to handle OAuth callback', error);
            return Response.redirect(
                `${new URL(request.url).origin}/settings?integration=github&status=error`,
                302,
            );
        }
    }

    static async initiateGitHubExport(
        request: Request,
        env: Env,
        _ctx: ExecutionContext,
        context: RouteContext,
    ): Promise<Response> {
        try {
            if (!context.user) {
                return GitHubExporterController.createErrorResponse<never>(
                    'Authentication required',
                    401,
                );
            }

            const body = await request.json() as {
                repositoryName: string;
                description?: string;
                isPrivate?: boolean;
                agentId: string;
            };

            this.logger.info('Export initiated', { userId: context.user.id, agentId: body.agentId });

            if (!body.repositoryName) {
                return GitHubExporterController.createErrorResponse<never>(
                    'Repository name is required',
                    400,
                );
            }

            if (!body.agentId) {
                return GitHubExporterController.createErrorResponse<never>(
                    'Instance ID is required for file pushing',
                    400,
                );
            }

            const agentStub = await getAgentStub(env, body.agentId);
            const cachedToken = await agentStub.getGitHubToken();
            
            if (cachedToken) {
                this.logger.info('Using cached token', { agentId: body.agentId, username: cachedToken.username });
                
                const result = await this.createRepositoryAndPush({
                    env,
                    agentId: body.agentId,
                    repositoryName: body.repositoryName,
                    description: body.description,
                    isPrivate: body.isPrivate ?? false,
                    token: cachedToken.token,
                    username: cachedToken.username
                });
                
                if (result.success) {
                    this.logger.info('Direct export completed', { repositoryUrl: result.repositoryUrl, agentId: body.agentId });
                    return GitHubExporterController.createSuccessResponse({
                        success: true,
                        repositoryUrl: result.repositoryUrl,
                        skippedOAuth: true
                    });
                }
                
                const isTemporaryError = result.error?.includes('rate limit') || 
                                        result.error?.includes('timeout') ||
                                        result.error?.includes('ECONNRESET');
                
                if (isTemporaryError) {
                    this.logger.warn('Temporary error, keeping token', { error: result.error, agentId: body.agentId });
                    return GitHubExporterController.createErrorResponse(
                        result.error || 'Temporary GitHub error',
                        503
                    );
                }
            } else {
                this.logger.info('No cached token, initiating OAuth', { agentId: body.agentId });
            }

            const state: GitHubOAuthCallbackState = {
                userId: context.user.id,
                timestamp: Date.now(),
                purpose: 'repository_export',
                agentId: body.agentId,
                exportData: {
                    repositoryName: body.repositoryName,
                    description: body.description,
                    isPrivate: body.isPrivate
                },
                returnUrl: request.headers.get('referer') || `${new URL(request.url).origin}/chat`,
            };

            const baseUrl = new URL(request.url).origin;
            const oauthProvider = GitHubExporterOAuthProvider.create(env, baseUrl);

            const authUrl = await oauthProvider.getAuthorizationUrl(
                Buffer.from(JSON.stringify(state)).toString('base64')
            );

            this.logger.info('Initiating OAuth flow', { userId: context.user.id, agentId: body.agentId });

            return GitHubExporterController.createSuccessResponse<{ authUrl: string }>({
                authUrl
            });
        } catch (error) {
            this.logger.error('Failed to initiate GitHub export', error);
            return GitHubExporterController.createErrorResponse<never>(
                'Failed to initiate GitHub export',
                500,
            );
        }
    }

    static async checkRemoteStatus(
        request: Request,
        env: Env,
        _ctx: ExecutionContext,
        context: RouteContext,
    ): Promise<Response> {
        try {
            if (!context.user) {
                return GitHubExporterController.createErrorResponse<never>(
                    'Authentication required',
                    401
                );
            }

            const body = await request.json() as {
                repositoryUrl: string;
                agentId: string;
            };

            if (!body.repositoryUrl || !body.agentId) {
                return GitHubExporterController.createErrorResponse<never>(
                    'Repository URL and agent ID are required',
                    400
                );
            }

            const agentStub = await getAgentStub(env, body.agentId);
            
            // Try to get cached token
            const cachedToken = await agentStub.getGitHubToken();
            
            if (!cachedToken) {
                return GitHubExporterController.createErrorResponse<never>(
                    'No cached GitHub token. Please re-authenticate.',
                    401
                );
            }

            // Export git objects and template details
            const { gitObjects, query, templateDetails } = await agentStub.exportGitObjects();
            
            // Get app createdAt
            let appCreatedAt: Date | undefined;
            try {
                const appService = new AppService(env);
                const app = await appService.getAppDetails(body.agentId);
                if (app && app.createdAt) {
                    appCreatedAt = new Date(app.createdAt);
                }
            } catch (error) {
                this.logger.warn('Failed to get app createdAt for sync check', { error });
            }
            
            // Check remote status
            const status = await GitHubService.checkRemoteStatus({
                gitObjects,
                templateDetails,
                appQuery: query,
                appCreatedAt,
                repositoryUrl: body.repositoryUrl,
                token: cachedToken.token
            });

            return GitHubExporterController.createSuccessResponse(status);
        } catch (error) {
            this.logger.error('Failed to check remote status', error);
            return GitHubExporterController.createErrorResponse<never>(
                'Failed to check remote status',
                500
            );
        }
    }
}
