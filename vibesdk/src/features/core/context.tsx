/**
 * Feature Context Provider
 */

import {
	createContext,
	useState,
	useEffect,
	useCallback,
	useMemo,
	useContext,
	type ReactNode,
} from 'react';
import { featureRegistry } from './registry';
import { apiClient } from '@/lib/api-client';
import type {
	FeatureDefinition,
	ViewDefinition,
	PlatformCapabilities,
	ProjectType,
	FileType,
	TemplateDetails,
} from '@/api-types';
import type {
	FeatureModule,
	FeatureContext as FeatureContextType,
	PreviewComponentProps,
	HeaderActionsProps,
} from './types';

interface FeatureProviderState {
	/** Currently active feature ID */
	activeFeatureId: ProjectType | null;
	/** Loaded feature module (null until loaded) */
	activeModule: FeatureModule | null;
	/** Platform capabilities from backend */
	capabilities: PlatformCapabilities | null;
	/** Loading state for capabilities fetch */
	isLoadingCapabilities: boolean;
	/** Feature context passed to components */
	featureContext: FeatureContextType | null;
}

interface FeatureProviderValue extends FeatureProviderState {
	/** Set the active feature (loads module if needed) */
	setActiveFeature: (id: ProjectType) => Promise<void>;
	/** Update the feature context */
	setFeatureContext: (ctx: FeatureContextType) => void;
	/** Get views for the active feature */
	getViews: () => ViewDefinition[];
	/** Get lazy preview component */
	getPreviewComponent: () => React.ComponentType<PreviewComponentProps> | null;
	/** Get lazy header actions component */
	getHeaderActionsComponent: () => React.ComponentType<HeaderActionsProps> | null;
	/** Process files through feature-specific logic */
	processFiles: (files: FileType[], templateDetails?: TemplateDetails | null) => FileType[];
	/** Refresh capabilities from backend */
	refreshCapabilities: () => Promise<void>;
	/** Get all enabled features */
	getEnabledFeatures: () => FeatureDefinition[];
}

const Context = createContext<FeatureProviderValue | null>(null);

interface FeatureProviderProps {
	children: ReactNode;
	/** Initial feature to activate */
	initialFeatureId?: ProjectType;
}

export function FeatureProvider({ children, initialFeatureId }: FeatureProviderProps) {
	const [state, setState] = useState<FeatureProviderState>({
		activeFeatureId: initialFeatureId ?? null,
		activeModule: null,
		capabilities: null,
		isLoadingCapabilities: true,
		featureContext: null,
	});

	// Fetch capabilities on mount
	const fetchCapabilities = useCallback(async () => {
		try {
			const response = await apiClient.getCapabilities();
			if (response.success && response.data) {
				featureRegistry.updateFromCapabilities(response.data.features);
				setState((prev) => ({
					...prev,
					capabilities: response.data!,
					isLoadingCapabilities: false,
				}));
			} else {
				console.warn('[FeatureProvider] Failed to fetch capabilities:', response);
				setState((prev) => ({ ...prev, isLoadingCapabilities: false }));
			}
		} catch (error) {
			console.error('[FeatureProvider] Error fetching capabilities:', error);
			setState((prev) => ({ ...prev, isLoadingCapabilities: false }));
		}
	}, []);

	useEffect(() => {
		fetchCapabilities();
	}, [fetchCapabilities]);

	// Load feature module when active feature changes
	useEffect(() => {
		if (!state.activeFeatureId) return;

		let cancelled = false;

		async function loadModule() {
			const module = await featureRegistry.load(state.activeFeatureId!);
			if (cancelled) return;
			setState((prev) => ({ ...prev, activeModule: module }));
		}

		loadModule();
		return () => {
			cancelled = true;
		};
	}, [state.activeFeatureId]);

	const setActiveFeature = useCallback(
		async (id: ProjectType) => {
			// Fallback to 'app' if feature not available
			if (!featureRegistry.isAvailable(id)) {
				console.warn(`[FeatureProvider] Feature "${id}" not available, falling back to "app"`);
				id = 'app';
			}

			// Deactivate current feature
			if (state.activeModule?.onDeactivate && state.featureContext) {
				state.activeModule.onDeactivate(state.featureContext);
			}

			setState((prev) => ({ ...prev, activeFeatureId: id, activeModule: null }));

			// Load new feature module
			const module = await featureRegistry.load(id);
			setState((prev) => ({ ...prev, activeModule: module }));

			// Activate new feature
			if (module?.onActivate && state.featureContext) {
				module.onActivate(state.featureContext);
			}
		},
		[state.activeModule, state.featureContext],
	);

	const setFeatureContext = useCallback((ctx: FeatureContextType) => {
		setState((prev) => ({ ...prev, featureContext: ctx }));
	}, []);

	const getViews = useCallback((): ViewDefinition[] => {
		return state.activeModule?.getViews() ?? [];
	}, [state.activeModule]);

	const getPreviewComponent = useCallback(() => {
		if (!state.activeFeatureId) return null;
		return featureRegistry.getLazyPreviewComponent(state.activeFeatureId);
	}, [state.activeFeatureId]);

	const getHeaderActionsComponent = useCallback(() => {
		if (!state.activeFeatureId) return null;
		return featureRegistry.getLazyHeaderActionsComponent(state.activeFeatureId);
	}, [state.activeFeatureId]);

	const processFiles = useCallback(
		(files: FileType[], templateDetails?: TemplateDetails | null): FileType[] => {
			if (!state.activeModule?.processFiles) return files;
			return state.activeModule.processFiles(files, templateDetails);
		},
		[state.activeModule],
	);

	const getEnabledFeatures = useCallback((): FeatureDefinition[] => {
		return featureRegistry.getEnabledFeatures();
	}, []);

	const value: FeatureProviderValue = useMemo(
		() => ({
			...state,
			setActiveFeature,
			setFeatureContext,
			getViews,
			getPreviewComponent,
			getHeaderActionsComponent,
			processFiles,
			refreshCapabilities: fetchCapabilities,
			getEnabledFeatures,
		}),
		[
			state,
			setActiveFeature,
			setFeatureContext,
			getViews,
			getPreviewComponent,
			getHeaderActionsComponent,
			processFiles,
			fetchCapabilities,
			getEnabledFeatures,
		],
	);

	return <Context.Provider value={value}>{children}</Context.Provider>;
}

/**
 * Hook to access feature context
 * Must be used within a FeatureProvider
 */
export function useFeature(): FeatureProviderValue {
	const context = useContext(Context);
	if (!context) {
		throw new Error('useFeature must be used within a FeatureProvider');
	}
	return context;
}
