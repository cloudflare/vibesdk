/**
 * Feature Registry
 *
 * Central registry for managing feature modules
 */

import { lazy, type ComponentType } from 'react';
import type { FeatureDefinition, ProjectType } from '@/api-types';
import type {
	FeatureModule,
	FeatureLoader,
	PreviewComponentProps,
	HeaderActionsProps,
} from './types';

interface RegisteredFeature {
	definition: FeatureDefinition;
	loader: FeatureLoader;
	module?: FeatureModule;
	isLoaded: boolean;
}

class FeatureRegistry {
	private features = new Map<ProjectType, RegisteredFeature>();
	private loadingPromises = new Map<ProjectType, Promise<FeatureModule>>();

	/**
	 * Register a feature with its definition and lazy loader
	 */
	register(definition: FeatureDefinition, loader: FeatureLoader): void {
		this.features.set(definition.id, {
			definition,
			loader,
			isLoaded: false,
		});
	}

	/**
	 * Update feature definitions from backend capabilities response
	 */
	updateFromCapabilities(definitions: FeatureDefinition[]): void {
		for (const def of definitions) {
			const existing = this.features.get(def.id);
			if (existing) {
				existing.definition = def;
			}
		}
	}

	/**
	 * Get all registered feature definitions
	 */
	getAllFeatures(): FeatureDefinition[] {
		return Array.from(this.features.values()).map((f) => f.definition);
	}

	/**
	 * Get only enabled feature definitions
	 */
	getEnabledFeatures(): FeatureDefinition[] {
		return Array.from(this.features.values())
			.filter((f) => f.definition.enabled)
			.map((f) => f.definition);
	}

	/**
	 * Check if a feature is registered and enabled
	 */
	isAvailable(id: ProjectType): boolean {
		const feature = this.features.get(id);
		return feature?.definition.enabled ?? false;
	}

	/**
	 * Get feature definition by ID
	 */
	getDefinition(id: ProjectType): FeatureDefinition | null {
		return this.features.get(id)?.definition ?? null;
	}

	/**
	 * Load a feature module dynamically
	 */
	async load(id: ProjectType): Promise<FeatureModule | null> {
		const feature = this.features.get(id);
		if (!feature) {
			console.warn(`[FeatureRegistry] Feature "${id}" not registered`);
			return null;
		}

		// Return cached module if already loaded
		if (feature.isLoaded && feature.module) {
			return feature.module;
		}

		// Dedupe concurrent load requests
		const existingPromise = this.loadingPromises.get(id);
		if (existingPromise) {
			return existingPromise;
		}

		// Load the module
		const loadPromise = feature
			.loader()
			.then(({ default: module }) => {
				feature.module = module;
				feature.isLoaded = true;
				this.loadingPromises.delete(id);
				return module;
			})
			.catch((error) => {
				console.error(`[FeatureRegistry] Failed to load feature "${id}":`, error);
				this.loadingPromises.delete(id);
				throw error;
			});

		this.loadingPromises.set(id, loadPromise);
		return loadPromise;
	}

	/**
	 * Get a loaded feature module (returns null if not loaded yet)
	 */
	getModule(id: ProjectType): FeatureModule | null {
		return this.features.get(id)?.module ?? null;
	}

	/**
	 * Get a lazy-loaded preview component for a feature
	 */
	getLazyPreviewComponent(id: ProjectType): ComponentType<PreviewComponentProps> | null {
		const feature = this.features.get(id);
		if (!feature) return null;

		return lazy(async () => {
			const module = await this.load(id);
			if (!module) {
				throw new Error(`Failed to load feature: ${id}`);
			}
			return { default: module.PreviewComponent };
		});
	}

	/**
	 * Get a lazy-loaded header actions component for a feature
	 */
	getLazyHeaderActionsComponent(id: ProjectType): ComponentType<HeaderActionsProps> | null {
		const feature = this.features.get(id);
		if (!feature?.definition.capabilities.hasCustomHeaderActions) {
			return null;
		}

		return lazy(async () => {
			const module = await this.load(id);
			if (!module?.HeaderActionsComponent) {
				throw new Error(`Feature "${id}" has no header actions component`);
			}
			return { default: module.HeaderActionsComponent };
		});
	}

	/**
	 * Get capabilities for a feature
	 */
	getCapabilities(id: ProjectType) {
		return this.features.get(id)?.definition.capabilities ?? null;
	}

	/**
	 * Reset registry state
	 */
	reset(): void {
		this.features.forEach((feature) => {
			feature.module = undefined;
			feature.isLoaded = false;
		});
		this.loadingPromises.clear();
	}
}

// Singleton instance
export const featureRegistry = new FeatureRegistry();
