import { createObjectLogger } from '../../../logger';
import type {
	IDeploymentProvider,
	DeploymentProvider,
	DeploymentResult,
	DeploymentOptions,
	DeploymentConfig,
	DeploymentStatus,
} from '../types';

const logger = createObjectLogger('NetlifyProvider');

interface NetlifySite {
	id: string;
	name: string;
	url: string;
	admin_url: string;
	ssl_url?: string;
	custom_domain?: string;
}

interface NetlifyDeploy {
	id: string;
	site_id: string;
	state: 'ready' | 'building' | 'error' | 'processing' | 'preparing' | 'uploaded' | 'uploading';
	deploy_url: string;
	deploy_ssl_url?: string;
	admin_url: string;
	error_message?: string;
	build_log_url?: string;
}

interface NetlifyFileDigest {
	[path: string]: string;
}

export class NetlifyDeploymentProvider implements IDeploymentProvider {
	readonly name: DeploymentProvider = 'netlify';
	private readonly apiBaseUrl = 'https://api.netlify.com/api/v1';

	async deploy(options: DeploymentOptions, config: DeploymentConfig): Promise<DeploymentResult> {
		try {
			logger.info('Starting Netlify deployment', {
				projectName: options.projectName,
				fileCount: options.files.size,
			});

			if (!config.apiToken) {
				throw new Error('Netlify API token is required');
			}

			const site = await this.getOrCreateSite(options.projectName, config);
			logger.info('Using Netlify site', { siteId: site.id, siteName: site.name });

			const files: Record<string, string> = {};
			const fileDigests: NetlifyFileDigest = {};

			for (const [path, content] of options.files.entries()) {
				files[path] = content;
				fileDigests[path] = await this.generateSHA1(content);
			}

			const deployBody = {
				files: fileDigests,
				draft: !options.production,
				branch: 'main',
			};

			logger.info('Creating Netlify deploy', { siteId: site.id });

			const deployResponse = await fetch(`${this.apiBaseUrl}/sites/${site.id}/deploys`, {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${config.apiToken}`,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(deployBody),
			});

			if (!deployResponse.ok) {
				const errorText = await deployResponse.text();
				logger.error('Failed to create Netlify deploy', {
					status: deployResponse.status,
					error: errorText,
				});
				throw new Error(`Failed to create deploy: ${deployResponse.status} - ${errorText}`);
			}

			const deploy = (await deployResponse.json()) as NetlifyDeploy & {
				required?: string[];
			};

			const requiredFiles = deploy.required || [];

			logger.info('Uploading required files', { count: requiredFiles.length });

			if (requiredFiles.length > 0) {
				await this.uploadFiles(site.id, deploy.id, requiredFiles, files, config.apiToken);
			}

			const updatedDeploy = await this.waitForDeployment(site.id, deploy.id, config.apiToken);

			if (updatedDeploy.state === 'error') {
				throw new Error(`Deployment failed: ${updatedDeploy.error_message || 'Unknown error'}`);
			}

			const deploymentUrl = updatedDeploy.deploy_ssl_url || updatedDeploy.deploy_url;

			logger.info('Netlify deployment completed', {
				deploymentId: updatedDeploy.id,
				url: deploymentUrl,
				state: updatedDeploy.state,
			});

			return {
				success: true,
				deploymentUrl,
				previewUrl: deploymentUrl,
				deploymentId: updatedDeploy.id,
				buildId: updatedDeploy.id,
				message: `Successfully deployed to Netlify: ${deploymentUrl}`,
			};
		} catch (error) {
			logger.error('Netlify deployment error', { error });
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown deployment error',
				message: 'Failed to deploy to Netlify',
			};
		}
	}

	async getDeploymentStatus(deploymentId: string, config: DeploymentConfig): Promise<DeploymentStatus> {
		try {
			if (!config.apiToken || !config.siteId) {
				throw new Error('Netlify API token and site ID are required');
			}

			const response = await fetch(`${this.apiBaseUrl}/sites/${config.siteId}/deploys/${deploymentId}`, {
				method: 'GET',
				headers: {
					Authorization: `Bearer ${config.apiToken}`,
				},
			});

			if (!response.ok) {
				throw new Error(`Failed to get deployment status: ${response.status}`);
			}

			const deploy = (await response.json()) as NetlifyDeploy;

			return this.mapNetlifyStatusToDeploymentStatus(deploy.state);
		} catch (error) {
			logger.error('Failed to get Netlify deployment status', { error, deploymentId });
			return 'failed';
		}
	}

	async getDeploymentLogs(deploymentId: string, config: DeploymentConfig): Promise<string[]> {
		try {
			if (!config.apiToken || !config.siteId) {
				throw new Error('Netlify API token and site ID are required');
			}

			const response = await fetch(`${this.apiBaseUrl}/sites/${config.siteId}/deploys/${deploymentId}`, {
				method: 'GET',
				headers: {
					Authorization: `Bearer ${config.apiToken}`,
				},
			});

			if (!response.ok) {
				throw new Error(`Failed to get deployment logs: ${response.status}`);
			}

			const deploy = (await response.json()) as NetlifyDeploy;

			if (deploy.build_log_url) {
				const logsResponse = await fetch(deploy.build_log_url);
				if (logsResponse.ok) {
					const logsText = await logsResponse.text();
					return logsText.split('\n');
				}
			}

			return [];
		} catch (error) {
			logger.error('Failed to get Netlify deployment logs', { error, deploymentId });
			return [];
		}
	}

	async cancelDeployment(deploymentId: string, config: DeploymentConfig): Promise<boolean> {
		try {
			if (!config.apiToken || !config.siteId) {
				throw new Error('Netlify API token and site ID are required');
			}

			const response = await fetch(`${this.apiBaseUrl}/sites/${config.siteId}/deploys/${deploymentId}/cancel`, {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${config.apiToken}`,
				},
			});

			return response.ok;
		} catch (error) {
			logger.error('Failed to cancel Netlify deployment', { error, deploymentId });
			return false;
		}
	}

	private async getOrCreateSite(projectName: string, config: DeploymentConfig): Promise<NetlifySite> {
		if (!config.apiToken) {
			throw new Error('Netlify API token is required');
		}

		if (config.siteId) {
			const response = await fetch(`${this.apiBaseUrl}/sites/${config.siteId}`, {
				method: 'GET',
				headers: {
					Authorization: `Bearer ${config.apiToken}`,
				},
			});

			if (response.ok) {
				return (await response.json()) as NetlifySite;
			}
		}

		const siteName = this.sanitizeSiteName(projectName);

		const createResponse = await fetch(`${this.apiBaseUrl}/sites`, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${config.apiToken}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				name: siteName,
				custom_domain: config.customDomain,
			}),
		});

		if (!createResponse.ok) {
			const errorText = await createResponse.text();
			throw new Error(`Failed to create Netlify site: ${createResponse.status} - ${errorText}`);
		}

		return (await createResponse.json()) as NetlifySite;
	}

	private async uploadFiles(
		siteId: string,
		deployId: string,
		requiredFiles: string[],
		files: Record<string, string>,
		apiToken: string,
	): Promise<void> {
		const uploadPromises = requiredFiles.map(async (filePath) => {
			const content = files[filePath];
			if (!content) {
				logger.warn('Required file not found', { filePath });
				return;
			}

			const digest = await this.generateSHA1(content);

			const response = await fetch(`${this.apiBaseUrl}/deploys/${deployId}/files/${filePath}`, {
				method: 'PUT',
				headers: {
					Authorization: `Bearer ${apiToken}`,
					'Content-Type': 'application/octet-stream',
				},
				body: content,
			});

			if (!response.ok) {
				logger.error('Failed to upload file', {
					filePath,
					status: response.status,
				});
				throw new Error(`Failed to upload file ${filePath}: ${response.status}`);
			}
		});

		await Promise.all(uploadPromises);
	}

	private async waitForDeployment(siteId: string, deployId: string, apiToken: string): Promise<NetlifyDeploy> {
		const maxAttempts = 60;
		const pollInterval = 2000;

		for (let attempt = 0; attempt < maxAttempts; attempt++) {
			const response = await fetch(`${this.apiBaseUrl}/sites/${siteId}/deploys/${deployId}`, {
				method: 'GET',
				headers: {
					Authorization: `Bearer ${apiToken}`,
				},
			});

			if (!response.ok) {
				throw new Error(`Failed to check deployment status: ${response.status}`);
			}

			const deploy = (await response.json()) as NetlifyDeploy;

			if (deploy.state === 'ready' || deploy.state === 'error') {
				return deploy;
			}

			await new Promise((resolve) => setTimeout(resolve, pollInterval));
		}

		throw new Error('Deployment timeout exceeded');
	}

	private async generateSHA1(content: string): Promise<string> {
		const encoder = new TextEncoder();
		const data = encoder.encode(content);
		const hashBuffer = await crypto.subtle.digest('SHA-1', data);
		const hashArray = Array.from(new Uint8Array(hashBuffer));
		return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
	}

	private sanitizeSiteName(name: string): string {
		return name
			.toLowerCase()
			.replace(/[^a-z0-9-]/g, '-')
			.replace(/-+/g, '-')
			.replace(/^-|-$/g, '')
			.slice(0, 63);
	}

	private mapNetlifyStatusToDeploymentStatus(netlifyStatus: NetlifyDeploy['state']): DeploymentStatus {
		switch (netlifyStatus) {
			case 'preparing':
			case 'uploaded':
			case 'uploading':
				return 'pending';
			case 'processing':
			case 'building':
				return 'building';
			case 'ready':
				return 'ready';
			case 'error':
				return 'failed';
			default:
				return 'pending';
		}
	}
}
