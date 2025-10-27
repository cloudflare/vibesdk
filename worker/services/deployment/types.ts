export type DeploymentProvider = 'cloudflare' | 'vercel' | 'netlify' | 'github-pages';

export type DeploymentStatus = 'pending' | 'building' | 'deploying' | 'ready' | 'failed' | 'cancelled';

export interface DeploymentConfig {
	provider: DeploymentProvider;
	apiToken?: string;
	apiKey?: string;
	projectId?: string;
	accountId?: string;
	siteId?: string;
	githubToken?: string;
	githubRepo?: string;
	githubBranch?: string;
	customDomain?: string;
	environmentVariables?: Record<string, string>;
}

export interface DeploymentResult {
	success: boolean;
	deploymentUrl?: string;
	previewUrl?: string;
	deploymentId?: string;
	buildId?: string;
	error?: string;
	message?: string;
	logs?: string[];
}

export interface DeploymentFile {
	path: string;
	content: string | Buffer;
	encoding?: 'utf-8' | 'base64';
}

export interface DeploymentOptions {
	files: Map<string, string>;
	projectName: string;
	framework?: string;
	buildCommand?: string;
	outputDirectory?: string;
	installCommand?: string;
	environmentVariables?: Record<string, string>;
	production?: boolean;
}

export interface IDeploymentProvider {
	readonly name: DeploymentProvider;

	deploy(options: DeploymentOptions, config: DeploymentConfig): Promise<DeploymentResult>;

	getDeploymentStatus?(deploymentId: string, config: DeploymentConfig): Promise<DeploymentStatus>;

	cancelDeployment?(deploymentId: string, config: DeploymentConfig): Promise<boolean>;

	deleteDeployment?(deploymentId: string, config: DeploymentConfig): Promise<boolean>;

	getDeploymentLogs?(deploymentId: string, config: DeploymentConfig): Promise<string[]>;
}

export interface ProviderCredentials {
	provider: DeploymentProvider;
	apiToken?: string;
	apiKey?: string;
	accountId?: string;
	projectId?: string;
	siteId?: string;
	githubToken?: string;
}
