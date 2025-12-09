/**
 * Feature Registration Entry Point
 *
 * Features are lazy-loaded - the registry only holds references to the loaders,
 * actual modules are loaded on demand when a feature is activated.
 */

import { featureRegistry } from './core/registry';
import { DEFAULT_FEATURE_DEFINITIONS } from '@/api-types';

// Re-export core types and utilities
export { featureRegistry } from './core/registry';
export { FeatureProvider, useFeature } from './core/context';

export type {
	FeatureModule,
	FeatureLoader,
	FeatureContext,
	PreviewComponentProps,
	HeaderActionsProps,
} from './core/types';

/**
 * Register all built-in features.
 *
 * Each feature is registered with:
 * 1. A definition (from DEFAULT_FEATURE_DEFINITIONS, enabled by default for registration)
 * 2. A lazy loader that dynamically imports the feature module
 *
 * The actual enabled/disabled state is determined by the backend capabilities API
 * and updated via featureRegistry.updateFromCapabilities().
 */
function registerBuiltInFeatures(): void {
	// App feature
	featureRegistry.register(
		{ ...DEFAULT_FEATURE_DEFINITIONS.app, enabled: true },
		() => import('./app'),
	);

	// Presentation feature - slide presentations
	featureRegistry.register(
		{ ...DEFAULT_FEATURE_DEFINITIONS.presentation, enabled: true },
		() => import('./presentation'),
	);


	// General feature - general-purpose code generation
	featureRegistry.register(
		{ ...DEFAULT_FEATURE_DEFINITIONS.general, enabled: true },
		() => import('./general'),
	);
}

// Register features immediately on module load
registerBuiltInFeatures();
