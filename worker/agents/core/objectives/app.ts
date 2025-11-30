import { ProjectObjective } from './base';
import { BaseProjectState } from '../state';
import { ProjectType, RuntimeType, ExportResult, ExportOptions, DeployResult, DeployOptions } from '../types';
import { WebSocketMessageResponses } from '../../constants';
import { AppService } from '../../../database/services/AppService';
import type { AgentInfrastructure } from '../AgentCore';
import { GitHubService } from '../../../services/github';

/**
 * AppObjective - Full-Stack Web Applications
 * 
 * Produces: React + Vite + Cloudflare Workers full-stack applications
 * Runtime: Cloudflare Containers (sandbox)
 * Template: R2-backed React templates
 * Export: Deploy to Cloudflare Workers for platform (and soon User's personal Cloudflare account)
 * 
 * This is the EXISTING, ORIGINAL project type.
 * All current production apps are AppObjective.
 */
export class AppObjective<TState extends BaseProjectState = BaseProjectState> 
  extends ProjectObjective<TState> {
  
  constructor(infrastructure: AgentInfrastructure<TState>) {
    super(infrastructure);
  }
  
  // ==========================================
  // IDENTITY
  // ==========================================
  
  getType(): ProjectType {
    return 'app';
  }

  // ==========================================
  // RUNTIME & INFRASTRUCTURE
  // ==========================================
  
  getRuntime(): RuntimeType {
    return 'sandbox';
  }

  // ==========================================
  // DEPLOYMENT & EXPORT
  // ==========================================
  
  async deploy(options?: DeployOptions): Promise<DeployResult> {
    const target = options?.target ?? 'platform';
    if (target !== 'platform') {
      const message = `Unsupported deployment target "${target}" for app projects`;
      this.logger.error(message);
      return { success: false, target, error: message };
    }

    try {
      this.logger.info('Deploying app to Workers for Platforms');
      
      // Ensure sandbox instance exists first
      if (!this.state.sandboxInstanceId) {
        this.logger.info('No sandbox instance, deploying to sandbox first');
        await this.deploymentManager.deployToSandbox();
        
        if (!this.state.sandboxInstanceId) {
          this.logger.error('Failed to deploy to sandbox service');
          this.broadcast(WebSocketMessageResponses.CLOUDFLARE_DEPLOYMENT_ERROR, {
            message: 'Deployment failed: Failed to deploy to sandbox service',
            error: 'Sandbox service unavailable'
          });
          return {
            success: false,
            target,
            error: 'Failed to deploy to sandbox service'
          };
        }
      }

      // Deploy to Cloudflare Workers for Platforms
      const result = await this.deploymentManager.deployToCloudflare({
        target,
        callbacks: {
          onStarted: (data) => {
            this.broadcast(WebSocketMessageResponses.CLOUDFLARE_DEPLOYMENT_STARTED, data);
          },
          onCompleted: (data) => {
            this.broadcast(WebSocketMessageResponses.CLOUDFLARE_DEPLOYMENT_COMPLETED, data);
          },
          onError: (data) => {
            this.broadcast(WebSocketMessageResponses.CLOUDFLARE_DEPLOYMENT_ERROR, data);
          },
        }
      });

      // Update database with deployment ID if successful
      if (result.deploymentUrl && result.deploymentId) {
        const appService = new AppService(this.env);
        await appService.updateDeploymentId(
          this.getAgentId(),
          result.deploymentId
        );
        
        this.logger.info('Updated app deployment ID in database', {
          agentId: this.getAgentId(),
          deploymentId: result.deploymentId
        });
      }

      return {
        success: !!result.deploymentUrl,
        target,
        url: result.deploymentUrl || undefined,
        metadata: {
          deploymentId: result.deploymentId,
          workersUrl: result.deploymentUrl
        }
      };

    } catch (error) {
      this.logger.error('Cloudflare deployment error:', error);
      this.broadcast(WebSocketMessageResponses.CLOUDFLARE_DEPLOYMENT_ERROR, {
        message: 'Deployment failed',
        error: error instanceof Error ? error.message : String(error)
      });
      
      return {
        success: false,
        target,
        error: error instanceof Error ? error.message : 'Unknown deployment error'
      };
    }
  }

  async export(options: ExportOptions): Promise<ExportResult> {
    if (options.kind !== 'github' || !options.github) {
      const error = 'App export requires GitHub context';
      this.logger.error(error, { kind: options.kind });
      return { success: false, error };
    }

    const githubOptions = options.github;

    try {
      this.logger.info('Starting GitHub export using DO git');

      this.broadcast(WebSocketMessageResponses.GITHUB_EXPORT_STARTED, {
        message: `Starting GitHub export to repository "${githubOptions.cloneUrl}"`,
        repositoryName: githubOptions.repositoryHtmlUrl,
        isPrivate: githubOptions.isPrivate
      });

      this.broadcast(WebSocketMessageResponses.GITHUB_EXPORT_PROGRESS, {
        message: 'Preparing git repository...',
        step: 'preparing',
        progress: 20
      });

      const { gitObjects, query, templateDetails } = await this.infrastructure.exportGitObjects();

      this.logger.info('Git objects exported', {
        objectCount: gitObjects.length,
        hasTemplate: !!templateDetails
      });

      let appCreatedAt: Date | undefined = undefined;
      try {
        const agentId = this.getAgentId();
        if (agentId) {
          const appService = new AppService(this.env);
          const app = await appService.getAppDetails(agentId);
          if (app && app.createdAt) {
            appCreatedAt = new Date(app.createdAt);
            this.logger.info('Using app createdAt for template base', {
              createdAt: appCreatedAt.toISOString()
            });
          }
        }
      } catch (error) {
        this.logger.warn('Failed to get app createdAt, using current time', { error });
        appCreatedAt = new Date();
      }

      this.broadcast(WebSocketMessageResponses.GITHUB_EXPORT_PROGRESS, {
        message: 'Uploading to GitHub repository...',
        step: 'uploading_files',
        progress: 40
      });

      const result = await GitHubService.exportToGitHub({
        gitObjects,
        templateDetails,
        appQuery: query,
        appCreatedAt,
        token: githubOptions.token,
        repositoryUrl: githubOptions.repositoryHtmlUrl,
        username: githubOptions.username,
        email: githubOptions.email
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to export to GitHub');
      }

      this.logger.info('GitHub export completed', {
        commitSha: result.commitSha
      });

      if (githubOptions.token && githubOptions.username) {
        try {
          this.setGitHubToken(githubOptions.token, githubOptions.username);
          this.logger.info('GitHub token cached after successful export');
        } catch (cacheError) {
          this.logger.warn('Failed to cache GitHub token', { error: cacheError });
        }
      }

      this.broadcast(WebSocketMessageResponses.GITHUB_EXPORT_PROGRESS, {
        message: 'Finalizing GitHub export...',
        step: 'finalizing',
        progress: 90
      });

      const agentId = this.getAgentId();
      this.logger.info('[DB Update] Updating app with GitHub repository URL', {
        agentId,
        repositoryUrl: githubOptions.repositoryHtmlUrl,
        visibility: githubOptions.isPrivate ? 'private' : 'public'
      });

      const appService = new AppService(this.env);
      const updateResult = await appService.updateGitHubRepository(
        agentId || '',
        githubOptions.repositoryHtmlUrl || '',
        githubOptions.isPrivate ? 'private' : 'public'
      );

      this.logger.info('[DB Update] Database update result', {
        agentId,
        success: updateResult,
        repositoryUrl: githubOptions.repositoryHtmlUrl
      });

      this.broadcast(WebSocketMessageResponses.GITHUB_EXPORT_COMPLETED, {
        message: `Successfully exported to GitHub repository: ${githubOptions.repositoryHtmlUrl}`,
        repositoryUrl: githubOptions.repositoryHtmlUrl,
        cloneUrl: githubOptions.cloneUrl,
        commitSha: result.commitSha
      });

      this.logger.info('GitHub export completed successfully', {
        repositoryUrl: githubOptions.repositoryHtmlUrl,
        commitSha: result.commitSha
      });

      return {
        success: true,
        url: githubOptions.repositoryHtmlUrl,
        metadata: {
          repositoryUrl: githubOptions.repositoryHtmlUrl,
          cloneUrl: githubOptions.cloneUrl,
          commitSha: result.commitSha
        }
      };

    } catch (error) {
      this.logger.error('GitHub export failed', error);
      this.broadcast(WebSocketMessageResponses.GITHUB_EXPORT_ERROR, {
        message: `GitHub export failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return {
        success: false,
        url: options.github.repositoryHtmlUrl,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}
