import { WorkerDeployer } from './deployer';
import {
	WorkerBinding,
	DeployConfig,
	DispatchDeployConfig,
	WranglerConfig,
} from './types';
import {
	validateConfig,
	buildWorkerBindings,
} from './utils/index';
import { parse } from 'jsonc-parser';

/**
 * Pure deployment configuration builder
 * Transforms Wrangler config into deployment-ready configuration
 */
export function buildDeploymentConfig(
	config: WranglerConfig,
	workerContent: string,
	accountId: string,
	apiToken: string,
	assetsManifest?: Record<string, { hash: string; size: number }>,
	compatibilityFlags?: string[],
): DeployConfig {
	const hasAssets = assetsManifest && Object.keys(assetsManifest).length > 0;
	const bindings = buildWorkerBindings(config, hasAssets) as WorkerBinding[];

	return {
		accountId,
		apiToken,
		scriptName: config.name,
		compatibilityDate: config.compatibility_date,
		compatibilityFlags: compatibilityFlags || config.compatibility_flags,
		workerContent,
		assets: assetsManifest,
		bindings: bindings.length > 0 ? bindings : undefined,
		vars: config.vars,
	};
}

/**
 * Pure function to parse wrangler configuration from content string
 */
export function parseWranglerConfig(configContent: string): WranglerConfig {
	const config = parse(configContent) as WranglerConfig;
	validateConfig(config);
	return config;
}

/**
 * Deploy a Cloudflare Worker with the provided configuration and assets
 */
export async function deployWorker(
	deployConfig: DeployConfig,
	fileContents?: Map<string, Buffer>,
	additionalModules?: Map<string, string>,
	migrations?: WranglerConfig['migrations'],
	assetsConfig?: WranglerConfig['assets'],
	dispatchNamespace?: string,
): Promise<void> {
	const deployer = new WorkerDeployer(
		deployConfig.accountId,
		deployConfig.apiToken,
	);

	if (deployConfig.assets && fileContents) {
		await deployer.deployWithAssets(
			deployConfig.scriptName,
			deployConfig.workerContent,
			deployConfig.compatibilityDate,
			deployConfig.assets,
			fileContents,
			deployConfig.bindings,
			deployConfig.vars,
			dispatchNamespace,
			assetsConfig,
			additionalModules,
			deployConfig.compatibilityFlags,
			migrations,
		);
	} else {
		await deployer.deploySimple(
			deployConfig.scriptName,
			deployConfig.workerContent,
			deployConfig.compatibilityDate,
			deployConfig.bindings,
			deployConfig.vars,
			dispatchNamespace,
			additionalModules,
			deployConfig.compatibilityFlags,
			migrations,
		);
	}
}

/**
 * Deploy to Workers for Platforms (Dispatch namespace)
 */
export async function deployToDispatch(
	deployConfig: DispatchDeployConfig,
	fileContents?: Map<string, Buffer>,
	additionalModules?: Map<string, string>,
	migrations?: WranglerConfig['migrations'],
	assetsConfig?: WranglerConfig['assets'],
): Promise<void> {
	await deployWorker(
		deployConfig,
		fileContents,
		additionalModules,
		migrations,
		assetsConfig,
		deployConfig.dispatchNamespace,
	);
}
