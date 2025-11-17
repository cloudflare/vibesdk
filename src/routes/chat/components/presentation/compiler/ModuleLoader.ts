/**
 * Loads and caches compiled modules with dependency resolution
 */

import type { ComponentType } from 'react';
import { DependencyLoader } from './DependencyLoader';

interface ModuleCache {
	loader: DependencyLoader;
	exports: ComponentType<unknown> | Record<string, unknown>;
}

const moduleCache = new Map<string, ModuleCache>();

export interface LoadModuleOptions {
	/** Source code to compile */
	code: string;
	/** Unique identifier for this module (used for caching) */
	moduleId: string;
	/** Filename for source maps and debugging */
	filename: string;
	/** All available files (for resolving dependencies) */
	allFiles?: Map<string, string>;
}

export interface LoadModuleResult {
	/** Module exports (default export or named exports object) */
	exports: ComponentType<unknown> | Record<string, unknown>;
	/** Blob URL (for cleanup) */
	blobUrl: string;
	/** Compiled code (for debugging) */
	code: string;
}

/**
 * Load and compile a module with dependencies
 * Returns the module's exports
 */
export async function loadModule(options: LoadModuleOptions): Promise<LoadModuleResult> {
	const { code, moduleId, allFiles } = options;

	const cacheKey = `${moduleId}:${code.length}`;

	// Check cache
	const cached = moduleCache.get(cacheKey);
	if (cached) {
		const loaderModule = cached.loader.loadedModules.get(moduleId);
		return {
			exports: cached.exports,
			blobUrl: loaderModule?.blobUrl || '',
			code: loaderModule?.code || '',
		};
	}

	try {
		// Create file map
		const files = allFiles || new Map<string, string>();
		if (!files.has(moduleId)) {
			files.set(moduleId, code);
		}

		// Create dependency loader
		const loader = new DependencyLoader({ files });

		// Load module and dependencies
		const module = await loader.importModule(moduleId);

		// Get loaded module info
		const loaderModule = loader.loadedModules.get(moduleId);
		if (!loaderModule) {
			throw new Error(`Module ${moduleId} was not loaded properly`);
		}

		// Cache result
		const cacheEntry: ModuleCache = {
			loader,
			exports: module as ComponentType<unknown> | Record<string, unknown>,
		};
		moduleCache.set(cacheKey, cacheEntry);

		return {
			exports: module as ComponentType<unknown> | Record<string, unknown>,
			blobUrl: loaderModule.blobUrl,
			code: loaderModule.code,
		};
	} catch (error) {
		console.error(`[ModuleLoader] Failed to load module ${moduleId}:`, error);
		throw new Error(
			`Module loading failed for ${moduleId}: ${error instanceof Error ? error.message : 'Unknown error'}`,
		);
	}
}

/**
 * Clear module cache
 */
export function clearModuleCache(): void {
	// Revoke blob URLs to free memory
	for (const cached of moduleCache.values()) {
		cached.loader.clear();
	}
	moduleCache.clear();
}
