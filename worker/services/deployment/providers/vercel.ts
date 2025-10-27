import { createObjectLogger } from '../../../logger';
import type {
	IDeploymentProvider,
	DeploymentProvider,
	DeploymentResult,
	DeploymentOptions,
	DeploymentConfig,
	DeploymentStatus,
} from '../types';

const logger = createObjectLogger('VercelProvider');

interface VercelDeploymentResponse {
	id: string;
	url: string;
	alias?: string[];
	readyState: 'QUEUED' | 'BUILDING' | 'ERROR' | 'INITIALIZING' | 'READY' | 'CANCELED';
	inspectorUrl?: string;
	buildLogs?: Array<{ text: string; id: string }>;
}

interface VercelFile {
	file: string;
	data: string;
	encoding?: 'utf-8' | 'base64';
}

interface VercelDeploymentRequest {
	name: string;
	files: VercelFile[];
	projectSettings?: {
		framework?: string;
		buildCommand?: string;
		outputDirectory?: string;
		installCommand?: string;
	};
	target?: 'production' | 'preview';
	env?: Record<string, string>;
	build?: {
		env?: Record<string, string>;
	};
}

export class VercelDeploymentProvider implements IDeploymentProvider {
	readonly name: DeploymentProvider = 'vercel';
	private readonly apiBaseUrl = 'https://api.vercel.com';

	async deploy(options: DeploymentOptions, config: DeploymentConfig): Promise<DeploymentResult> {
		try {
			logger.info('Starting Vercel deployment', {
				projectName: options.projectName,
				fileCount: options.files.size,
			});

			if (!config.apiToken) {
				throw new Error('Vercel API token is required');
			}

			const files: VercelFile[] = Array.from(options.files.entries()).map(([path, content]) => ({
				file: path,
				data: content,
				encoding: 'utf-8' as const,
			}));

			const requestBody: VercelDeploymentRequest = {
				name: this.sanitizeProjectName(options.projectName),
				files,
				target: options.production ? 'production' : 'preview',
			};

			if (options.framework || options.buildCommand || options.outputDirectory || options.installCommand) {
				requestBody.projectSettings = {
					framework: options.framework,
					buildCommand: options.buildCommand,
					outputDirectory: options.outputDirectory,
					installCommand: options.installCommand,
				};
			}

			if (options.environmentVariables && Object.keys(options.environmentVariables).length > 0) {
				requestBody.env = options.environmentVariables;
				requestBody.build = {
					env: options.environmentVariables,
				};
			}

			const endpoint = config.projectId
				? `${this.apiBaseUrl}/v13/deployments?projectId=${config.projectId}`
				: `${this.apiBaseUrl}/v13/deployments`;

			logger.info('Sending deployment request to Vercel', { endpoint });

			const response = await fetch(endpoint, {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${config.apiToken}`,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(requestBody),
			});

			if (!response.ok) {
				const errorText = await response.text();
				logger.error('Vercel deployment failed', {
					status: response.status,
					error: errorText,
				});
				throw new Error(`Vercel deployment failed: ${response.status} - ${errorText}`);
			}

			const deployment = (await response.json()) as VercelDeploymentResponse;

			logger.info('Vercel deployment created', {
				deploymentId: deployment.id,
				url: deployment.url,
				readyState: deployment.readyState,
			});

			const deploymentUrl = `https://${deployment.url}`;
			const aliasUrl = deployment.alias?.[0] ? `https://${deployment.alias[0]}` : undefined;

			return {
				success: true,
				deploymentUrl: aliasUrl || deploymentUrl,
				previewUrl: deploymentUrl,
				deploymentId: deployment.id,
				message: `Successfully deployed to Vercel: ${deploymentUrl}`,
			};
		} catch (error) {
			logger.error('Vercel deployment error', { error });
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown deployment error',
				message: 'Failed to deploy to Vercel',
			};
		}
	}

	async getDeploymentStatus(deploymentId: string, config: DeploymentConfig): Promise<DeploymentStatus> {
		try {
			if (!config.apiToken) {
				throw new Error('Vercel API token is required');
			}

			const response = await fetch(`${this.apiBaseUrl}/v13/deployments/${deploymentId}`, {
				method: 'GET',
				headers: {
					Authorization: `Bearer ${config.apiToken}`,
				},
			});

			if (!response.ok) {
				throw new Error(`Failed to get deployment status: ${response.status}`);
			}

			const deployment = (await response.json()) as VercelDeploymentResponse;

			return this.mapVercelStatusToDeploymentStatus(deployment.readyState);
		} catch (error) {
			logger.error('Failed to get Vercel deployment status', { error, deploymentId });
			return 'failed';
		}
	}

	async getDeploymentLogs(deploymentId: string, config: DeploymentConfig): Promise<string[]> {
		try {
			if (!config.apiToken) {
				throw new Error('Vercel API token is required');
			}

			const response = await fetch(`${this.apiBaseUrl}/v2/deployments/${deploymentId}/events`, {
				method: 'GET',
				headers: {
					Authorization: `Bearer ${config.apiToken}`,
				},
			});

			if (!response.ok) {
				throw new Error(`Failed to get deployment logs: ${response.status}`);
			}

			const events = (await response.json()) as { text: string }[];
			return events.map((event) => event.text);
		} catch (error) {
			logger.error('Failed to get Vercel deployment logs', { error, deploymentId });
			return [];
		}
	}

	async cancelDeployment(deploymentId: string, config: DeploymentConfig): Promise<boolean> {
		try {
			if (!config.apiToken) {
				throw new Error('Vercel API token is required');
			}

			const response = await fetch(`${this.apiBaseUrl}/v12/deployments/${deploymentId}/cancel`, {
				method: 'PATCH',
				headers: {
					Authorization: `Bearer ${config.apiToken}`,
				},
			});

			return response.ok;
		} catch (error) {
			logger.error('Failed to cancel Vercel deployment', { error, deploymentId });
			return false;
		}
	}

	private sanitizeProjectName(name: string): string {
		return name
			.toLowerCase()
			.replace(/[^a-z0-9-]/g, '-')
			.replace(/-+/g, '-')
			.replace(/^-|-$/g, '')
			.slice(0, 100);
	}

	private mapVercelStatusToDeploymentStatus(vercelStatus: VercelDeploymentResponse['readyState']): DeploymentStatus {
		switch (vercelStatus) {
			case 'QUEUED':
			case 'INITIALIZING':
				return 'pending';
			case 'BUILDING':
				return 'building';
			case 'READY':
				return 'ready';
			case 'ERROR':
				return 'failed';
			case 'CANCELED':
				return 'cancelled';
			default:
				return 'pending';
		}
	}
}
