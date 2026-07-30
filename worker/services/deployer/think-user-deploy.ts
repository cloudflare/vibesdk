import type { BranchDeploymentBundle } from '@space-do/space';
import { CloudflareAPI } from './api/cloudflare-api';
import { WorkerDeployer } from './deployer';
import type { AssetConfig, WorkerBinding, WorkerObservability } from './types';
import { createAssetManifest } from './utils';

const APP_BINDING = 'VIBE_APP';
const OBSERVABILITY: WorkerObservability = {
	enabled: false,
	head_sampling_rate: 1,
	logs: {
		enabled: true,
		head_sampling_rate: 1,
		persist: true,
		invocation_logs: true,
	},
	traces: {
		enabled: true,
		persist: true,
		head_sampling_rate: 1,
	},
};

export interface ThinkUserDeploymentResult {
	deploymentId: string;
	deploymentUrl: string;
}

function normalizeModule(value: string | Record<string, unknown>): string {
	if (typeof value === 'string') return value;
	if (typeof value.text === 'string') return value.text;
	throw new Error('The generated Worker contains a non-text module that cannot be published');
}

export function sanitizeWorkerName(value: string): string {
	const normalized = value
		.toLowerCase()
		.replace(/[^a-z0-9-]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 63);
	return normalized || 'vibe-app';
}

function exportsApp(moduleSource: string): boolean {
	return /export\s+(?:declare\s+)?class\s+App\b/.test(moduleSource)
		|| /export\s*\{[^}]*\bApp\b[^}]*\}/s.test(moduleSource)
		|| /\bApp\s+as\s+App\b/.test(moduleSource);
}

function buildEntryModule(mainModule: string, hasAssets: boolean, hasApp: boolean): string {
	const specifier = mainModule.startsWith('.') ? mainModule : `./${mainModule}`;
	const appExport = hasApp
		? `export { App } from ${JSON.stringify(specifier)};\n`
		: 'import { DurableObject } from "cloudflare:workers";\nexport class App extends DurableObject {}\n';
	const assetRouting = hasAssets
		? 'const assetResponse = await env.ASSETS.fetch(request); if (assetResponse.status !== 404) return assetResponse; const accept = request.headers.get("accept") || ""; if (request.method === "GET" && accept.includes("text/html")) { const indexUrl = new URL("/index.html", request.url); const indexResponse = await env.ASSETS.fetch(new Request(indexUrl, request)); if (indexResponse.status !== 404) return indexResponse; } '
		: '';
	const appRouting = hasApp
		? `return env.${APP_BINDING}.get(env.${APP_BINDING}.idFromName("main")).fetch(request);`
		: 'return new Response("Not Found", { status: 404 });';
	return `${appExport}export default { async fetch(request, env) { ${assetRouting}${appRouting} } };`;
}

interface ThinkBundleArtifacts {
	scriptName: string;
	modules: Map<string, string>;
	entry: string;
	compatibilityDate: string;
	assets: Record<string, { hash: string; size: number }> | undefined;
	assetContents: Map<string, Buffer>;
	bindings: WorkerBinding[];
	assetsConfig: AssetConfig | undefined;
	migration: { tag: string; new_sqlite_classes: string[] }[] | undefined;
}

async function buildThinkBundleArtifacts(
	bundle: BranchDeploymentBundle,
	appName: string,
): Promise<ThinkBundleArtifacts> {
	const scriptName = sanitizeWorkerName(appName);
	const modules = new Map<string, string>();
	for (const [name, value] of Object.entries(bundle.modules)) {
		modules.set(name, normalizeModule(value));
	}
	const mainModuleSource = modules.get(bundle.mainModule);
	if (!mainModuleSource) {
		throw new Error(`Generated Worker entry module not found: ${bundle.mainModule}`);
	}
	const hasApp = exportsApp(mainModuleSource);

	const assetBuffers = new Map<string, ArrayBuffer>();
	const assetContents = new Map<string, Buffer>();
	for (const [rawPath, content] of Object.entries(bundle.assets)) {
		const path = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
		const bytes = new TextEncoder().encode(content);
		assetBuffers.set(path, bytes.buffer as ArrayBuffer);
		assetContents.set(path, Buffer.from(bytes));
	}
	const assets = assetBuffers.size > 0
		? await createAssetManifest(assetBuffers)
		: undefined;
	const bindings: WorkerBinding[] = [];
	if (hasApp) {
		bindings.push({
			name: APP_BINDING,
			type: 'durable_object_namespace',
			class_name: 'App',
		});
	}
	if (assets) {
		bindings.push({ name: 'ASSETS', type: 'assets' });
	}
	const assetsConfig: AssetConfig | undefined = assets
		? {
			...bundle.assetConfig,
			binding: 'ASSETS',
			run_worker_first: true,
		}
	: undefined;
	if (!assets && !hasApp) {
		throw new Error('Generated Worker has neither static assets nor an App Durable Object export');
	}
	const migration = hasApp
		? [{ tag: `vibe-app-${bundle.commitHash.slice(0, 12)}`, new_sqlite_classes: ['App'] }]
		: undefined;
	const entry = buildEntryModule(bundle.mainModule, Boolean(assets), hasApp);

	return {
		scriptName,
		modules,
		entry,
		compatibilityDate: bundle.compatibilityDate,
		assets,
		assetContents,
		bindings,
		assetsConfig,
		migration,
	};
}

async function deployArtifacts(
	deployer: WorkerDeployer,
	artifacts: ThinkBundleArtifacts,
	dispatchNamespace: string | undefined,
): Promise<void> {
	if (artifacts.assets) {
		await deployer.deployWithAssets(
			artifacts.scriptName,
			artifacts.entry,
			artifacts.compatibilityDate,
			artifacts.assets,
			artifacts.assetContents,
			artifacts.bindings,
			undefined,
			dispatchNamespace,
			artifacts.assetsConfig,
			artifacts.modules,
			undefined,
			artifacts.migration,
			OBSERVABILITY,
		);
	} else {
		await deployer.deploySimple(
			artifacts.scriptName,
			artifacts.entry,
			artifacts.compatibilityDate,
			artifacts.bindings,
			undefined,
			dispatchNamespace,
			artifacts.modules,
			undefined,
			artifacts.migration,
			OBSERVABILITY,
		);
	}
}

export async function deployThinkBundleToUserAccount(input: {
	accountId: string;
	accessToken: string;
	appName: string;
	bundle: BranchDeploymentBundle;
}): Promise<ThinkUserDeploymentResult> {
	const artifacts = await buildThinkBundleArtifacts(input.bundle, input.appName);
	const deployer = new WorkerDeployer(input.accountId, input.accessToken);
	await deployArtifacts(deployer, artifacts, undefined);

	const api = new CloudflareAPI(input.accountId, input.accessToken);
	await api.enableWorkersDev(artifacts.scriptName);
	const subdomain = await api.getWorkersDevSubdomain();
	return {
		deploymentId: artifacts.scriptName,
		deploymentUrl: `https://${artifacts.scriptName}.${subdomain}.workers.dev`,
	};
}

/**
 * Deploy a think bundle to the platform's Workers-for-Platforms dispatch
 * namespace using platform credentials. No workers.dev enablement — the
 * app is reachable through the dispatch custom domain (preview domain).
 */
export async function deployThinkBundleToPlatform(input: {
	accountId: string;
	apiToken: string;
	dispatchNamespace: string;
	previewDomain: string;
	appName: string;
	bundle: BranchDeploymentBundle;
}): Promise<ThinkUserDeploymentResult> {
	const artifacts = await buildThinkBundleArtifacts(input.bundle, input.appName);
	const deployer = new WorkerDeployer(input.accountId, input.apiToken);
	await deployArtifacts(deployer, artifacts, input.dispatchNamespace);

	return {
		deploymentId: artifacts.scriptName,
		deploymentUrl: `https://${artifacts.scriptName}.${input.previewDomain}`,
	};
}
