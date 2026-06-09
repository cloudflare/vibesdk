/**
 * Feature capability types
 *
 * These types define the capabilities and configuration for different project types
 * (app, presentation, general) and are consumed by both backend and frontend.
 */

import type { ProjectType, BehaviorType, ExportOptions } from '../types';

export interface PlatformCapabilitiesConfig {
	features: {
		app: { enabled: boolean };
		presentation: { enabled: boolean };
		general: { enabled: boolean };
	};
	version: string;
}

/**
 * View modes that features can provide.
 * Core views are predefined, but features can extend with custom string views.
 */
export type ViewMode = 'editor' | 'preview' | 'docs' | 'blueprint' | 'terminal' | (string & {});

/**
 * Capabilities that a feature supports.
 * This defines what a feature can do and how it behaves.
 */
export interface FeatureCapabilities {
	// Core capabilities
	hasPreview: boolean;
	hasLiveReload: boolean;
	requiresSandbox: boolean;
	requiresWebSocket: boolean;

	// View capabilities
	supportedViews: ViewMode[];
	defaultView: ViewMode;

	// Export capabilities (uses existing ExportOptions['kind'])
	supportedExports: ExportOptions['kind'][];

	// UI extension points
	hasCustomHeaderActions: boolean;
	hasCustomSidebar: boolean;
	hasCustomFileFilter: boolean;

	// Behavior - determines generation approach (phasic vs agentic)
	behaviorType: BehaviorType;
}

/**
 * Feature definition exposed by capabilities API.
 * Each feature represents a distinct project type with its own capabilities.
 */
export interface FeatureDefinition {
	/** Unique identifier matching ProjectType */
	id: ProjectType;

	/** Human-readable name */
	name: string;

	/** Short description of what this feature does */
	description: string;

	/** Whether this feature is currently enabled on the platform */
	enabled: boolean;

	/** Feature capabilities */
	capabilities: FeatureCapabilities;

	/** Optional URL to load external feature module (for external plugins) */
	moduleUrl?: string;
}

/**
 * View configuration for a feature.
 * Defines how a view is displayed in the UI.
 */
export interface ViewDefinition {
	/** View identifier */
	id: ViewMode;

	/** Short label for the view button/tab */
	label: string;

	/** Icon identifier (resolved on frontend, e.g., 'Eye', 'Code', 'Presentation') */
	iconName: string;

	/** Optional tooltip text */
	tooltip?: string;
}

/**
 * Platform capabilities response from /api/capabilities endpoint.
 */
export interface PlatformCapabilities {
	/** Available features on this platform instance */
	features: FeatureDefinition[];

	/** Platform version */
	version: string;
}

/**
 * Default feature definitions.
 * These serve as the canonical definitions for all built-in features.
 */
export const DEFAULT_FEATURE_DEFINITIONS: Record<ProjectType, Omit<FeatureDefinition, 'enabled'>> = {
	app: {
		id: 'app',
		name: 'Application',
		description: 'Full-stack web applications',
		capabilities: {
			hasPreview: true,
			hasLiveReload: true,
			requiresSandbox: true,
			requiresWebSocket: true,
			supportedViews: ['editor', 'preview', 'docs', 'blueprint'],
			defaultView: 'editor',
			supportedExports: ['github'],
			hasCustomHeaderActions: true,
			hasCustomSidebar: false,
			hasCustomFileFilter: false,
			behaviorType: 'phasic',
		},
	},
	presentation: {
		id: 'presentation',
		name: 'Presentation',
		description: 'Interactive slide presentations',
		capabilities: {
			hasPreview: true,
			hasLiveReload: true,
			requiresSandbox: true,
			requiresWebSocket: true,
			supportedViews: ['editor', 'preview', 'docs'],
			defaultView: 'preview',
			supportedExports: ['github', 'pdf', 'pptx', 'googleslides'],
			hasCustomHeaderActions: true,
			hasCustomSidebar: true,
			hasCustomFileFilter: true,
			behaviorType: 'agentic',
		},
	},
	workflow: {
		id: 'workflow',
		name: 'Workflow',
		description: 'Automated workflows and pipelines',
		capabilities: {
			hasPreview: false,
			hasLiveReload: false,
			requiresSandbox: false,
			requiresWebSocket: true,
			supportedViews: ['editor', 'docs'],
			defaultView: 'editor',
			supportedExports: ['github', 'workflow'],
			hasCustomHeaderActions: true,
			hasCustomSidebar: false,
			hasCustomFileFilter: false,
			behaviorType: 'agentic',
		},
	},
	general: {
		id: 'general',
		name: 'General',
		description: 'General-purpose code generation',
		capabilities: {
			hasPreview: false,
			hasLiveReload: false,
			requiresSandbox: false,
			requiresWebSocket: true,
			supportedViews: ['editor', 'docs'],
			defaultView: 'editor',
			supportedExports: ['github'],
			hasCustomHeaderActions: false,
			hasCustomSidebar: false,
			hasCustomFileFilter: false,
			behaviorType: 'agentic',
		},
	},
};

/**
 * Helper to get the behavior type for a project type.
 */
export function getBehaviorTypeForProject(projectType: ProjectType): BehaviorType {
	return DEFAULT_FEATURE_DEFINITIONS[projectType].capabilities.behaviorType;
}
