/**
 * Recursive module loader with dependency graph resolution
 */

import { transformCode, preloadBabel } from './BabelCompiler';
import { parseImports, resolveImportPath, isBareImport } from './ImportResolver';
import { resolveBareSpecifier } from './ImportMapManager';
import { globalBlobManager } from './BlobURLManager';

interface LoadedModule {
	blobUrl: string;
	code: string;
	exports?: unknown;
}

interface DependencyLoaderOptions {
	files: Map<string, string>; // filePath -> content
}

export class DependencyLoader {
	private files: Map<string, string>;
	public loadedModules = new Map<string, LoadedModule>();
	private loading = new Set<string>();
	private loadingStack: string[] = []; // Track dependency chain for better error messages

	constructor(options: DependencyLoaderOptions) {
		this.files = options.files;
	}

	async loadModule(filePath: string): Promise<LoadedModule> {
		await preloadBabel();

		// Check cache first
		const cached = this.loadedModules.get(filePath);
		if (cached) {
			return cached;
		}

		// Check for circular dependency
		if (this.loading.has(filePath)) {
			const chain = [...this.loadingStack, filePath].join(' → ');
			throw new Error(`Circular dependency detected: ${chain}`);
		}

		this.loading.add(filePath);
		this.loadingStack.push(filePath);

		try {
			const code = this.files.get(filePath);
			if (!code) {
				throw new Error(`File not found: ${filePath}`);
			}

			console.log(`[DependencyLoader] Loading ${filePath}...`);

			const imports = parseImports(code);
			console.log(`[DependencyLoader] Found ${imports.length} imports in ${filePath}`);

			for (const imp of imports) {
				if (isBareImport(imp.source)) {
					console.log(`[DependencyLoader] Skipping bare import: ${imp.source}`);
					continue;
				}

				const depPath = resolveImportPath(imp.source, filePath, this.files);
				if (!depPath) {
					console.warn(`[DependencyLoader] Could not resolve: ${imp.source} from ${filePath}`);
					continue;
				}

				await this.loadModule(depPath);
			}

			const importRewriteMap: Record<string, string> = {};

			for (const imp of imports) {
				if (isBareImport(imp.source)) {
					const cdnUrl = resolveBareSpecifier(imp.source);
					if (cdnUrl) {
						importRewriteMap[imp.source] = cdnUrl;
					}
					continue;
				}

				const depPath = resolveImportPath(imp.source, filePath, this.files);
				if (!depPath) {
					continue;
				}
				const depModule = this.loadedModules.get(depPath);
				if (!depModule) {
					continue;
				}
				importRewriteMap[imp.source] = depModule.blobUrl;
			}

			const transformed = await transformCode(code, {
				filename: filePath,
				importRewriteMap,
			});

			const blob = new Blob([transformed.code], {
				type: 'application/javascript;charset=utf-8',
			});
			const blobUrl = globalBlobManager.createBlobURL(blob);

			const module: LoadedModule = {
				blobUrl,
				code: transformed.code,
			};
			this.loadedModules.set(filePath, module);

			console.log(`[DependencyLoader] Loaded ${filePath} -> ${blobUrl}`);

			return module;
		} finally {
			this.loading.delete(filePath);
			this.loadingStack.pop();
		}
	}

	async importModule(filePath: string): Promise<unknown> {
		const module = await this.loadModule(filePath);

		if (!module.exports) {
			const imported = await import(/* @vite-ignore */ module.blobUrl);
			module.exports = imported.default || imported;
		}

		return module.exports;
	}

	clear(): void {
		for (const module of this.loadedModules.values()) {
			globalBlobManager.revokeBlobURL(module.blobUrl);
		}
		this.loadedModules.clear();
		this.loading.clear();
		this.loadingStack = [];
	}
}
