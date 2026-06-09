/**
 * Frontend feature types
 */

import type { ComponentType, RefObject } from 'react';
import type { WebSocket } from 'partysocket';
import type {
	FileType,
	TemplateDetails,
	BlueprintType,
	ModelConfigsInfo,
	BehaviorType,
	ProjectType,
	ViewMode,
	ViewDefinition,
} from '@/api-types';

/**
 * Context passed to all feature components.
 * Contains the shared state and callbacks needed by feature-specific UI.
 */
export interface FeatureContext {
	// Project identity
	projectType: ProjectType;
	behaviorType: BehaviorType;

	// Preview
	previewUrl?: string;
	websocket?: WebSocket;

	// File state
	files: FileType[];
	activeFile?: FileType;

	// View state
	currentView: ViewMode;
	onViewChange: (view: ViewMode) => void;

	// Metadata
	templateDetails?: TemplateDetails | null;
	modelConfigs?: ModelConfigsInfo;
	blueprint?: BlueprintType | null;

	// Refs
	previewRef: RefObject<HTMLIFrameElement | null>;
	editorRef: RefObject<HTMLDivElement | null>;

	// Refresh controls
	shouldRefreshPreview: boolean;
	manualRefreshTrigger: number;
	onManualRefresh: () => void;

	// Feature-specific state (typed per feature module)
	featureState: Record<string, unknown>;
	setFeatureState: (key: string, value: unknown) => void;
}

/**
 * Props for feature preview components
 */
export interface PreviewComponentProps extends FeatureContext {
	className?: string;
}

/**
 * Props for feature header action components
 */
export interface HeaderActionsProps extends FeatureContext {
	onGitCloneClick: () => void;
	isGitHubExportReady: boolean;
	onGitHubExportClick: () => void;
	loadingConfigs: boolean;
	onRequestConfigs: () => void;
}

/**
 * Feature module interface - what each feature plugin must implement.
 */
export interface FeatureModule {
	/** Feature ID - must match a ProjectType */
	id: ProjectType;

	/** Get view definitions for this feature */
	getViews(): ViewDefinition[];

	/** Main preview component */
	PreviewComponent: ComponentType<PreviewComponentProps>;

	/** Optional custom header actions */
	HeaderActionsComponent?: ComponentType<HeaderActionsProps>;

	/** Optional file processor (e.g., filter demo slides for presentations) */
	processFiles?(files: FileType[], templateDetails?: TemplateDetails | null): FileType[];

	/** Optional lifecycle hook when feature is activated */
	onActivate?(context: FeatureContext): void;

	/** Optional lifecycle hook when feature is deactivated */
	onDeactivate?(context: FeatureContext): void;
}

/**
 * Feature loader function type for lazy loading
 */
export type FeatureLoader = () => Promise<{ default: FeatureModule }>;
