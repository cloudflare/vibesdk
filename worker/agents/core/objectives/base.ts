import { BaseProjectState } from '../state';
import {
	ProjectType,
	ExportResult,
	ExportOptions,
	DeployResult,
	DeployOptions,
} from '../types';
import { AgentComponent } from '../AgentComponent';
import type { AgentInfrastructure } from '../AgentCore';
import { WebSocketMessageResponses } from '../../constants';
import { AppService } from '../../../database/services/AppService';
import { GitHubService } from '../../../services/github';
import {
	getAdditionalExportStrategy,
	type AdditionalExportStrategy,
	type ExportContext,
} from './strategies';

export class ProjectObjective<
	TState extends BaseProjectState = BaseProjectState,
> extends AgentComponent<TState> {
	private projectType: ProjectType;
	private additionalExportStrategy: AdditionalExportStrategy | null;

	protected githubTokenCache: {
		token: string;
		username: string;
		expiresAt: number;
	} | null = null;

	constructor(
		infrastructure: AgentInfrastructure<TState>,
		projectType: ProjectType,
	) {
		super(infrastructure);
		this.projectType = projectType;
		this.additionalExportStrategy = getAdditionalExportStrategy(projectType);
	}

	getType(): ProjectType {
		return this.projectType;
	}

	async deploy(options?: DeployOptions): Promise<DeployResult> {
		const target = options?.target ?? 'platform';
		if (target !== 'platform') {
			return {
				success: false,
				target,
				error: `Unsupported deployment target "${target}"`,
			};
		}

		try {
			this.logger.info('Deploying to Workers for Platforms', {
				projectType: this.projectType,
			});

			if (!this.state.sandboxInstanceId) {
				this.logger.info('No sandbox instance, deploying to sandbox first');
				await this.deploymentManager.deployToSandbox();

				if (!this.state.sandboxInstanceId) {
					this.broadcast(WebSocketMessageResponses.CLOUDFLARE_DEPLOYMENT_ERROR, {
						message: 'Deployment failed: Sandbox service unavailable',
						error: 'Sandbox service unavailable',
					});
					return {
						success: false,
						target,
						error: 'Failed to deploy to sandbox service',
					};
				}
			}

			const result = await this.deploymentManager.deployToCloudflare({
				target,
				callbacks: {
					onStarted: (data) =>
						this.broadcast(WebSocketMessageResponses.CLOUDFLARE_DEPLOYMENT_STARTED, data),
					onCompleted: (data) =>
						this.broadcast(WebSocketMessageResponses.CLOUDFLARE_DEPLOYMENT_COMPLETED, data),
					onError: (data) =>
						this.broadcast(WebSocketMessageResponses.CLOUDFLARE_DEPLOYMENT_ERROR, data),
				},
			});

			if (result.deploymentUrl && result.deploymentId) {
				const appService = new AppService(this.env);
				await appService.updateDeploymentId(this.getAgentId(), result.deploymentId);
				this.logger.info('Updated deployment ID in database', {
					deploymentId: result.deploymentId,
				});
			}

			return {
				success: !!result.deploymentUrl,
				target,
				url: result.deploymentUrl || undefined,
				metadata: {
					deploymentId: result.deploymentId,
					workersUrl: result.deploymentUrl,
				},
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown deployment error';
			this.logger.error('Deployment failed', error);
			this.broadcast(WebSocketMessageResponses.CLOUDFLARE_DEPLOYMENT_ERROR, {
				message: 'Deployment failed',
				error: message,
			});
			return { success: false, target, error: message };
		}
	}

	async export(options: ExportOptions): Promise<ExportResult> {
		if (options.kind === 'github') {
			return this.exportToGitHub(options);
		}

		if (this.additionalExportStrategy?.getSupportedKinds().includes(options.kind)) {
			return this.additionalExportStrategy.export(options, this.createExportContext());
		}

		return {
			success: false,
			error: `Export kind '${options.kind}' not supported for ${this.projectType}`,
		};
	}

	private async exportToGitHub(options: ExportOptions): Promise<ExportResult> {
		if (!options.github) {
			return { success: false, error: 'GitHub export requires github options' };
		}

		const githubOptions = options.github;

		try {
			this.logger.info('Starting GitHub export');

			this.broadcast(WebSocketMessageResponses.GITHUB_EXPORT_STARTED, {
				message: `Starting GitHub export to repository "${githubOptions.cloneUrl}"`,
				repositoryName: githubOptions.repositoryHtmlUrl,
				isPrivate: githubOptions.isPrivate,
			});

			this.broadcast(WebSocketMessageResponses.GITHUB_EXPORT_PROGRESS, {
				message: 'Preparing git repository...',
				step: 'preparing',
				progress: 20,
			});

			const { gitObjects, query, templateDetails } =
				await this.infrastructure.exportGitObjects();

			this.logger.info('Git objects exported', {
				objectCount: gitObjects.length,
				hasTemplate: !!templateDetails,
			});

			let appCreatedAt: Date | undefined;
			try {
				const agentId = this.getAgentId();
				if (agentId) {
					const appService = new AppService(this.env);
					const app = await appService.getAppDetails(agentId);
					if (app?.createdAt) {
						appCreatedAt = new Date(app.createdAt);
					}
				}
			} catch {
				appCreatedAt = new Date();
			}

			this.broadcast(WebSocketMessageResponses.GITHUB_EXPORT_PROGRESS, {
				message: 'Uploading to GitHub repository...',
				step: 'uploading_files',
				progress: 40,
			});

			const result = await GitHubService.exportToGitHub({
				gitObjects,
				templateDetails,
				appQuery: query,
				appCreatedAt,
				token: githubOptions.token,
				repositoryUrl: githubOptions.repositoryHtmlUrl,
				username: githubOptions.username,
				email: githubOptions.email,
			});

			if (!result.success) {
				throw new Error(result.error || 'Failed to export to GitHub');
			}

			if (githubOptions.token && githubOptions.username) {
				this.setGitHubToken(githubOptions.token, githubOptions.username);
			}

			this.broadcast(WebSocketMessageResponses.GITHUB_EXPORT_PROGRESS, {
				message: 'Finalizing GitHub export...',
				step: 'finalizing',
				progress: 90,
			});

			const agentId = this.getAgentId();
			const appService = new AppService(this.env);
			await appService.updateGitHubRepository(
				agentId || '',
				githubOptions.repositoryHtmlUrl || '',
				githubOptions.isPrivate ? 'private' : 'public',
			);

			this.broadcast(WebSocketMessageResponses.GITHUB_EXPORT_COMPLETED, {
				message: `Successfully exported to GitHub repository: ${githubOptions.repositoryHtmlUrl}`,
				repositoryUrl: githubOptions.repositoryHtmlUrl,
				cloneUrl: githubOptions.cloneUrl,
				commitSha: result.commitSha,
			});

			this.logger.info('GitHub export completed', {
				repositoryUrl: githubOptions.repositoryHtmlUrl,
				commitSha: result.commitSha,
			});

			return {
				success: true,
				url: githubOptions.repositoryHtmlUrl,
				metadata: {
					repositoryUrl: githubOptions.repositoryHtmlUrl,
					cloneUrl: githubOptions.cloneUrl,
					commitSha: result.commitSha,
				},
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			this.logger.error('GitHub export failed', error);
			this.broadcast(WebSocketMessageResponses.GITHUB_EXPORT_ERROR, {
				message: `GitHub export failed: ${message}`,
				error: message,
			});
			return {
				success: false,
				url: options.github?.repositoryHtmlUrl,
				error: message,
			};
		}
	}

	private createExportContext(): ExportContext {
		return {
			env: this.env,
			logger: this.logger,
			agentId: this.getAgentId(),
			state: this.state,
			broadcast: this.broadcast.bind(this),
		};
	}

	setGitHubToken(token: string, username: string, ttl: number = 3600000): void {
		this.githubTokenCache = {
			token,
			username,
			expiresAt: Date.now() + ttl,
		};
	}

	getGitHubToken(): { token: string; username: string } | null {
		if (!this.githubTokenCache) return null;
		if (Date.now() >= this.githubTokenCache.expiresAt) {
			this.githubTokenCache = null;
			return null;
		}
		return {
			token: this.githubTokenCache.token,
			username: this.githubTokenCache.username,
		};
	}

	clearGitHubToken(): void {
		this.githubTokenCache = null;
	}
}
