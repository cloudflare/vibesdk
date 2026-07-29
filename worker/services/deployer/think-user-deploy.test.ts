import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BranchDeploymentBundle } from '@space-do/space';
import { sanitizeWorkerName } from './think-user-deploy';

const deployWithAssets = vi.fn();
const deploySimple = vi.fn();
const enableWorkersDev = vi.fn();
const getWorkersDevSubdomain = vi.fn();

vi.mock('./deployer', () => ({
	WorkerDeployer: vi.fn().mockImplementation(() => ({
		deployWithAssets,
		deploySimple,
	})),
}));

vi.mock('./api/cloudflare-api', () => ({
	CloudflareAPI: vi.fn().mockImplementation(() => ({
		enableWorkersDev,
		getWorkersDevSubdomain,
	})),
}));

// Import after mocks are registered
const { deployThinkBundleToUserAccount, deployThinkBundleToPlatform } = await import('./think-user-deploy');

function makeBundle(overrides?: Partial<BranchDeploymentBundle>): BranchDeploymentBundle {
	return {
		modules: {
			'index.js': 'export class App {}\nexport default { fetch() { return new Response("ok"); } };',
		},
		mainModule: 'index.js',
		assets: { '/index.html': '<html><body>hi</body></html>' },
		assetConfig: {},
		compatibilityDate: '2025-01-01',
		commitHash: 'abcdef1234567890abcdef',
		...overrides,
	} as unknown as BranchDeploymentBundle;
}

describe('sanitizeWorkerName', () => {
	it('creates a stable Workers-compatible script name', () => {
		expect(sanitizeWorkerName(' Vibe: My New App! ')).toBe('vibe-my-new-app');
	});

	it('limits names and provides a fallback', () => {
		expect(sanitizeWorkerName('!@#$')).toBe('vibe-app');
		expect(sanitizeWorkerName('A'.repeat(100))).toHaveLength(63);
	});
});

describe('deployThinkBundleToPlatform', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('deploys into the dispatch namespace and returns a preview-domain URL', async () => {
		const result = await deployThinkBundleToPlatform({
			accountId: 'platform-account',
			apiToken: 'platform-token',
			dispatchNamespace: 'vibesdk-default-namespace',
			previewDomain: 'build-preview.cloudflare.dev',
			appName: 'My App',
			bundle: makeBundle(),
		});

		expect(result.deploymentId).toBe('my-app');
		expect(result.deploymentUrl).toBe('https://my-app.build-preview.cloudflare.dev');
		expect(deployWithAssets).toHaveBeenCalledTimes(1);
		// dispatchNamespace is the 8th positional arg of deployWithAssets
		expect(deployWithAssets.mock.calls[0][7]).toBe('vibesdk-default-namespace');
		// Platform deploys never touch workers.dev
		expect(enableWorkersDev).not.toHaveBeenCalled();
		expect(getWorkersDevSubdomain).not.toHaveBeenCalled();
	});

	it('falls back to a simple deploy when the bundle has no assets', async () => {
		await deployThinkBundleToPlatform({
			accountId: 'platform-account',
			apiToken: 'platform-token',
			dispatchNamespace: 'vibesdk-default-namespace',
			previewDomain: 'build-preview.cloudflare.dev',
			appName: 'My App',
			bundle: makeBundle({ assets: {} }),
		});

		expect(deploySimple).toHaveBeenCalledTimes(1);
		// dispatchNamespace is the 6th positional arg of deploySimple
		expect(deploySimple.mock.calls[0][5]).toBe('vibesdk-default-namespace');
		expect(deployWithAssets).not.toHaveBeenCalled();
	});
});

describe('deployThinkBundleToUserAccount', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		getWorkersDevSubdomain.mockResolvedValue('user-sub');
	});

	it('deploys without a dispatch namespace and enables workers.dev', async () => {
		const result = await deployThinkBundleToUserAccount({
			accountId: 'user-account',
			accessToken: 'user-token',
			appName: 'My App',
			bundle: makeBundle(),
		});

		expect(deployWithAssets).toHaveBeenCalledTimes(1);
		expect(deployWithAssets.mock.calls[0][7]).toBeUndefined();
		expect(enableWorkersDev).toHaveBeenCalledWith('my-app');
		expect(result.deploymentUrl).toBe('https://my-app.user-sub.workers.dev');
	});
});
