import { createObjectLogger } from '../../logger';
import { DeploymentProviderFactory } from './providers';
import type {
	DeploymentProvider,
	DeploymentConfig,
	DeploymentOptions,
	DeploymentResult,
	DeploymentStatus,
} from './types';

const logger = createObjectLogger('DeploymentService');

export interface DeploymentCredentials {
	vercelApiToken?: string;
	vercelProjectId?: string;
	netlifyApiToken?: string;
	netlifySiteId?: string;
	githubToken?: string;
	githubRepo?: string;
	githubBranch?: string;
	cloudflareAccountId?: string;
	cloudflareApiToken?: string;
}

export class DeploymentService {
	constructor(private readonly credentials: DeploymentCredentials) {}

	async deploy(
		provider: DeploymentProvider,
		options: DeploymentOptions,
		customConfig?: Partial<DeploymentConfig>,
	): Promise<DeploymentResult> {
		try {
			logger.info('Starting deployment', {
				provider,
				projectName: options.projectName,
				fileCount: options.files.size,
			});

			if (provider === 'cloudflare') {
				throw new Error('Cloudflare deployments should use the existing sandbox service');
			}

			const config = this.buildConfig(provider, customConfig);
			const deploymentProvider = DeploymentProviderFactory.getProvider(provider);

			const result = await deploymentProvider.deploy(options, config);

			logger.info('Deployment completed', {
				provider,
				success: result.success,
				deploymentUrl: result.deploymentUrl,
			});

			return result;
		} catch (error) {
			logger.error('Deployment failed', { provider, error });
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown deployment error',
				message: `Failed to deploy to ${provider}`,
			};
		}
	}

	async getDeploymentStatus(
		provider: DeploymentProvider,
		deploymentId: string,
		customConfig?: Partial<DeploymentConfig>,
	): Promise<DeploymentStatus> {
		try {
			if (provider === 'cloudflare') {
				throw new Error('Cloudflare deployments should use the existing sandbox service');
			}

			const config = this.buildConfig(provider, customConfig);
			const deploymentProvider = DeploymentProviderFactory.getProvider(provider);

			if (!deploymentProvider.getDeploymentStatus) {
				logger.warn('Provider does not support status checking', { provider });
				return 'pending';
			}

			return await deploymentProvider.getDeploymentStatus(deploymentId, config);
		} catch (error) {
			logger.error('Failed to get deployment status', { provider, deploymentId, error });
			return 'failed';
		}
	}

	async getDeploymentLogs(
		provider: DeploymentProvider,
		deploymentId: string,
		customConfig?: Partial<DeploymentConfig>,
	): Promise<string[]> {
		try {
			if (provider === 'cloudflare') {
				throw new Error('Cloudflare deployments should use the existing sandbox service');
			}

			const config = this.buildConfig(provider, customConfig);
			const deploymentProvider = DeploymentProviderFactory.getProvider(provider);

			if (!deploymentProvider.getDeploymentLogs) {
				logger.warn('Provider does not support log retrieval', { provider });
				return [];
			}

			return await deploymentProvider.getDeploymentLogs(deploymentId, config);
		} catch (error) {
			logger.error('Failed to get deployment logs', { provider, deploymentId, error });
			return [];
		}
	}

	async cancelDeployment(
		provider: DeploymentProvider,
		deploymentId: string,
		customConfig?: Partial<DeploymentConfig>,
	): Promise<boolean> {
		try {
			if (provider === 'cloudflare') {
				throw new Error('Cloudflare deployments should use the existing sandbox service');
			}

			const config = this.buildConfig(provider, customConfig);
			const deploymentProvider = DeploymentProviderFactory.getProvider(provider);

			if (!deploymentProvider.cancelDeployment) {
				logger.warn('Provider does not support deployment cancellation', { provider });
				return false;
			}

			return await deploymentProvider.cancelDeployment(deploymentId, config);
		} catch (error) {
			logger.error('Failed to cancel deployment', { provider, deploymentId, error });
			return false;
		}
	}

	private buildConfig(provider: DeploymentProvider, customConfig?: Partial<DeploymentConfig>): DeploymentConfig {
		const baseConfig: Partial<DeploymentConfig> = {
			provider,
			...customConfig,
		};

		switch (provider) {
			case 'vercel':
				return {
					...baseConfig,
					provider: 'vercel',
					apiToken: customConfig?.apiToken || this.credentials.vercelApiToken,
					projectId: customConfig?.projectId || this.credentials.vercelProjectId,
				};

			case 'netlify':
				return {
					...baseConfig,
					provider: 'netlify',
					apiToken: customConfig?.apiToken || this.credentials.netlifyApiToken,
					siteId: customConfig?.siteId || this.credentials.netlifySiteId,
				};

			case 'github-pages':
				return {
					...baseConfig,
					provider: 'github-pages',
					githubToken: customConfig?.githubToken || this.credentials.githubToken,
					githubRepo: customConfig?.githubRepo || this.credentials.githubRepo,
					githubBranch: customConfig?.githubBranch || this.credentials.githubBranch || 'gh-pages',
				};

			case 'cloudflare':
				return {
					...baseConfig,
					provider: 'cloudflare',
					accountId: customConfig?.accountId || this.credentials.cloudflareAccountId,
					apiToken: customConfig?.apiToken || this.credentials.cloudflareApiToken,
				};

			default:
				throw new Error(`Unknown provider: ${provider}`);
		}
	}

	static getSupportedProviders(): DeploymentProvider[] {
		return DeploymentProviderFactory.getAllProviders();
	}

	hasCredentials(provider: DeploymentProvider): boolean {
		switch (provider) {
			case 'vercel':
				return Boolean(this.credentials.vercelApiToken);
			case 'netlify':
				return Boolean(this.credentials.netlifyApiToken);
			case 'github-pages':
				return Boolean(this.credentials.githubToken && this.credentials.githubRepo);
			case 'cloudflare':
				return Boolean(this.credentials.cloudflareAccountId && this.credentials.cloudflareApiToken);
			default:
				return false;
		}
	}
}
