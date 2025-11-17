/**
 * Loads and caches compiled modules with dependency resolution
 */

import type { ComponentType } from 'react';
import { DependencyLoader } from './DependencyLoader';
import { globalBlobManager } from './BlobURLManager';

interface ModuleCache {
	loader: DependencyLoader;
	exports: ComponentType<unknown> | Record<string, unknown>;
	contentHash: string;
}

const moduleCache = new Map<string, ModuleCache>();

/**
 * Generate a hash from string content
 * Used for content-based cache keys
 */
function hashCode(str: string): string {
	let hash = 0;
	for (let i = 0; i < str.length; i++) {
		const char = str.charCodeAt(i);
		hash = (hash << 5) - hash + char;
		hash = hash | 0; // Convert to 32-bit integer
	}
	return hash.toString(36);
}

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

	// Use content hash for cache key to prevent collisions
	const contentHash = hashCode(code);
	const cacheKey = `${moduleId}:${contentHash}`;

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

	// Check if we have an old cache entry with different content hash
	const oldCacheKey = Array.from(moduleCache.keys()).find((key) => key.startsWith(`${moduleId}:`));
	if (oldCacheKey && oldCacheKey !== cacheKey) {
		const oldCache = moduleCache.get(oldCacheKey);
		if (oldCache) {
			// Revoke old blob URLs before replacing
			oldCache.loader.clear();
			moduleCache.delete(oldCacheKey);
		}
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
			contentHash,
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
