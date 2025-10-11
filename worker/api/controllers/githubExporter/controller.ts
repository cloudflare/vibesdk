import { BaseController } from '../baseController';
import { RouteContext } from '../../types/route-context';
import { GitHubService } from '../../../services/github';
import { GitHubExporterOAuthProvider } from '../../../services/oauth/github-exporter';
import { getAgentStub } from '../../../agents';
import { createLogger } from '../../../logger';

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
    static logger = createLogger('GitHubExporterController');
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

            if (purpose === 'repository_export' && exportData) {
                const createResult = await GitHubService.createUserRepository({
                    name: exportData.repositoryName,
                    description: exportData.description,
                    private: exportData.isPrivate || false,
                    token: tokenResult.accessToken
                });

                if (!createResult.success || !createResult.repository) {
                    this.logger.error('Failed to create repository during export', {
                        error: createResult.error,
                        userId,
                        repositoryName: exportData.repositoryName
                    });
                    return Response.redirect(
                        `${returnUrl}?github_export=error&reason=${encodeURIComponent(createResult.error || 'repository_creation_failed')}`,
                        302,
                    );
                }

                this.logger.info('Repository created successfully, now pushing files', {
                    userId,
                    repositoryUrl: createResult.repository.html_url,
                    repositoryName: exportData.repositoryName,
                    agentId
                });

                if (agentId) {
                    try {
                        const agentStub = await getAgentStub(env, agentId, true, this.logger);

                        const pushRequest = {
                            cloneUrl: createResult.repository.clone_url,
                            repositoryHtmlUrl: createResult.repository.html_url,
                            isPrivate: createResult.repository.private,
                            token: tokenResult.accessToken,
                            email: 'noreply@vibesdk.com',
                            username: 'vibesdk-bot',
                            commitMessage: `Initial commit - Generated app\n\n🤖 Generated with vibesdk\nRepository: ${exportData.repositoryName}`
                        };

                        this.logger.info('Pushing files to repository via agent', {
                            agentId,
                            repositoryUrl: createResult.repository.html_url
                        });

                        const pushResult = await agentStub.pushToGitHub(pushRequest);

                        if (!pushResult?.success) {
                            this.logger.error('Failed to push files to repository', {
                                error: pushResult?.error,
                                agentId,
                                repositoryUrl: createResult.repository.html_url
                            });
                            return Response.redirect(
                                `${returnUrl}?github_export=error&reason=${encodeURIComponent(pushResult?.error || 'file_push_failed')}`,
                                302,
                            );
                        }

                        this.logger.info('Successfully completed GitHub export with files', {
                            userId,
                            agentId,
                            repositoryUrl: createResult.repository.html_url,
                            repositoryName: exportData.repositoryName
                        });
                    } catch (pushError) {
                        this.logger.error('Error during file push', {
                            error: pushError,
                            agentId,
                            repositoryUrl: createResult.repository.html_url
                        });
                        return Response.redirect(
                            `${returnUrl}?github_export=error&reason=${encodeURIComponent('file_push_error')}`,
                            302,
                        );
                    }
                } else {
                    this.logger.warn('No agentId provided - repository created but files not pushed', {
                        repositoryUrl: createResult.repository.html_url
                    });
                }

                return Response.redirect(
                    `${returnUrl}?github_export=success&repository_url=${encodeURIComponent(createResult.repository.html_url)}`,
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

            this.logger.info('Initiating GitHub export with OAuth', {
                userId: context.user.id,
                repositoryName: body.repositoryName,
            });

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
}
