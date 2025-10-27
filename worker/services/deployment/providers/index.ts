import type { IDeploymentProvider, DeploymentProvider } from '../types';
import { VercelDeploymentProvider } from './vercel';
import { NetlifyDeploymentProvider } from './netlify';
import { GitHubPagesDeploymentProvider } from './github-pages';

export class DeploymentProviderFactory {
	private static providers: Map<DeploymentProvider, IDeploymentProvider> = new Map();

	static getProvider(providerName: DeploymentProvider): IDeploymentProvider {
		let provider = this.providers.get(providerName);

		if (!provider) {
			provider = this.createProvider(providerName);
			this.providers.set(providerName, provider);
		}

		return provider;
	}

	private static createProvider(providerName: DeploymentProvider): IDeploymentProvider {
		switch (providerName) {
			case 'vercel':
				return new VercelDeploymentProvider();
			case 'netlify':
				return new NetlifyDeploymentProvider();
			case 'github-pages':
				return new GitHubPagesDeploymentProvider();
			case 'cloudflare':
				throw new Error('Cloudflare provider uses existing deployment service');
			default:
				throw new Error(`Unknown deployment provider: ${providerName}`);
		}
	}

	static getAllProviders(): DeploymentProvider[] {
		return ['cloudflare', 'vercel', 'netlify', 'github-pages'];
	}
}

export { VercelDeploymentProvider } from './vercel';
export { NetlifyDeploymentProvider } from './netlify';
export { GitHubPagesDeploymentProvider } from './github-pages';
