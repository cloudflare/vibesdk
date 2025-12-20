import { type RefObject, type ReactNode, Suspense, useState, useCallback } from 'react';
import { WebSocket } from 'partysocket';
import { MonacoEditor } from '../../../components/monaco-editor/monaco-editor';
import { motion } from 'framer-motion';
import { RefreshCw } from 'lucide-react';
import { Blueprint } from './blueprint';
import { FileExplorer } from './file-explorer';
import { PreviewIframe } from './preview-iframe';
import { MarkdownDocsPreview } from './markdown-docs-preview';
import { ViewContainer } from './view-container';
import { ViewHeader } from './view-header';
import { PreviewHeaderActions } from './preview-header-actions';
import { EditorHeaderActions } from './editor-header-actions';
import { Copy } from './copy';
import { featureRegistry } from '@/features';
import type { FileType, BlueprintType, BehaviorType, ModelConfigsInfo, TemplateDetails, ProjectType } from '@/api-types';
import type { ContentDetectionResult } from '../utils/content-detector';
import type { GitHubExportHook } from '@/hooks/use-github-export';
import type { Edit } from '../hooks/use-chat';

interface MainContentPanelProps {
	// View state
	view: 'editor' | 'preview' | 'docs' | 'blueprint' | 'terminal' | 'presentation';
	onViewChange: (mode: 'preview' | 'editor' | 'docs' | 'blueprint' | 'presentation') => void;

	// Content detection
	hasDocumentation: boolean;
	contentDetection: ContentDetectionResult;

	// Preview state
	projectType: ProjectType;
	previewUrl?: string;
	previewAvailable: boolean;
	showTooltip: boolean;
	shouldRefreshPreview: boolean;
	manualRefreshTrigger: number;
	onManualRefresh: () => void;

	// Blueprint
	blueprint?: BlueprintType | null;

	// Editor state
	activeFile?: FileType;
	allFiles: FileType[];
	edit?: Edit | null;
	onFileClick: (file: FileType) => void;

	// Generation state
	isGenerating: boolean;
	isGeneratingBlueprint: boolean;

	// Model configs
	modelConfigs?: ModelConfigsInfo;
	loadingConfigs: boolean;
	onRequestConfigs: () => void;

	// Git/GitHub actions
	onGitCloneClick: () => void;
	isGitHubExportReady: boolean;
	githubExport: GitHubExportHook;

	// Template metadata
	templateDetails?: TemplateDetails | null;

	// Other
	behaviorType?: BehaviorType;
	websocket?: WebSocket;

	// Refs
	previewRef: RefObject<HTMLIFrameElement | null>;
	editorRef: RefObject<HTMLDivElement | null>;
}

export function MainContentPanel(props: MainContentPanelProps) {
	const {
		view,
		onViewChange,
		hasDocumentation,
		contentDetection,
		projectType,
		previewUrl,
		previewAvailable,
		showTooltip,
		shouldRefreshPreview,
		manualRefreshTrigger,
		onManualRefresh,
		blueprint,
		activeFile,
		allFiles,
		edit,
		onFileClick,
		isGenerating,
		isGeneratingBlueprint,
		modelConfigs,
		loadingConfigs,
		onRequestConfigs,
		onGitCloneClick,
		isGitHubExportReady,
		githubExport,
		behaviorType,
		websocket,
		previewRef,
		editorRef,
		templateDetails,
	} = props;

	// Feature-specific state management
	const [featureState, setFeatureStateInternal] = useState<Record<string, unknown>>({});
	const setFeatureState = useCallback((key: string, value: unknown) => {
		setFeatureStateInternal(prev => ({ ...prev, [key]: value }));
	}, []);

	const commonHeaderProps = {
		view: view as 'preview' | 'editor' | 'docs' | 'blueprint' | 'presentation',
		onViewChange,
		previewAvailable,
		showTooltip,
		hasDocumentation,
		previewUrl,
		projectType,
	};

	const renderViewWithHeader = (
		centerContent: ReactNode,
		viewContent: ReactNode,
		rightActions?: ReactNode,
		headerOverrides?: Partial<typeof commonHeaderProps>
	) => (
		<ViewContainer>
			<ViewHeader
				{...commonHeaderProps}
				{...headerOverrides}
				centerContent={centerContent}
				rightActions={rightActions}
			/>
			{viewContent}
		</ViewContainer>
	);

	const renderDocsView = () => {
		if (!hasDocumentation) return null;

		const markdownFiles = Object.values(contentDetection.Contents)
			.filter(bundle => bundle.type === 'markdown')
			.flatMap(bundle => bundle.files);

		if (markdownFiles.length === 0) return null;

		return renderViewWithHeader(
			<span className="text-sm font-mono text-text-50/70">Documentation</span>,
			<MarkdownDocsPreview
				files={markdownFiles}
				isGenerating={isGenerating || isGeneratingBlueprint}
			/>
		);
	};

	const renderPreviewView = () => {
		if (!previewUrl) {
			return null;
		}

		// Get feature capabilities to determine preview behavior
		const featureCapabilities = featureRegistry.getCapabilities(projectType);
		const featureDefinition = featureRegistry.getDefinition(projectType);
		const previewTitle = blueprint?.title ?? featureDefinition?.name ?? 'Preview';

		// Check if we should show the refresh button (presentations handle refresh differently)
		const showManualRefresh = featureCapabilities?.hasLiveReload ?? true;

		// Get lazy-loaded preview component from feature registry
		const FeaturePreviewComponent = featureRegistry.getLazyPreviewComponent(projectType);

		// Fallback to default PreviewIframe if no feature-specific component
		const previewContent = FeaturePreviewComponent ? (
			<Suspense
				fallback={
					<div className="flex-1 w-full h-full flex items-center justify-center bg-bg-3">
						<RefreshCw className="size-6 text-accent animate-spin" />
					</div>
				}
			>
				<FeaturePreviewComponent
					projectType={projectType}
					behaviorType={behaviorType ?? 'phasic'}
					previewUrl={previewUrl}
					websocket={websocket}
					files={allFiles}
					activeFile={activeFile}
					currentView={view}
					onViewChange={(v) => onViewChange(v as 'preview' | 'editor' | 'docs' | 'blueprint' | 'presentation')}
					templateDetails={templateDetails}
					modelConfigs={modelConfigs}
					blueprint={blueprint}
					previewRef={previewRef}
					editorRef={editorRef}
					shouldRefreshPreview={shouldRefreshPreview}
					manualRefreshTrigger={manualRefreshTrigger}
					onManualRefresh={onManualRefresh}
					featureState={featureState}
					setFeatureState={setFeatureState}
					className="flex-1 w-full h-full border-0"
				/>
			</Suspense>
		) : (
			<PreviewIframe
				src={previewUrl}
				ref={previewRef}
				className="flex-1 w-full h-full border-0"
				title="Preview"
				shouldRefreshPreview={shouldRefreshPreview}
				manualRefreshTrigger={manualRefreshTrigger}
				webSocket={websocket}
			/>
		);

		// Get lazy-loaded header actions component from feature registry
		const FeatureHeaderActionsComponent = featureRegistry.getLazyHeaderActionsComponent(projectType);

		// Fallback to PreviewHeaderActions if no feature-specific component
		const headerActions = FeatureHeaderActionsComponent ? (
			<Suspense fallback={null}>
				<FeatureHeaderActionsComponent
					projectType={projectType}
					behaviorType={behaviorType ?? 'phasic'}
					previewUrl={previewUrl}
					websocket={websocket}
					files={allFiles}
					activeFile={activeFile}
					currentView={view}
					onViewChange={(v) => onViewChange(v as 'preview' | 'editor' | 'docs' | 'blueprint' | 'presentation')}
					templateDetails={templateDetails}
					modelConfigs={modelConfigs}
					blueprint={blueprint}
					previewRef={previewRef}
					editorRef={editorRef}
					shouldRefreshPreview={shouldRefreshPreview}
					manualRefreshTrigger={manualRefreshTrigger}
					onManualRefresh={onManualRefresh}
					featureState={featureState}
					setFeatureState={setFeatureState}
					onGitCloneClick={onGitCloneClick}
					isGitHubExportReady={isGitHubExportReady}
					onGitHubExportClick={githubExport.openModal}
					loadingConfigs={loadingConfigs}
					onRequestConfigs={onRequestConfigs}
				/>
			</Suspense>
		) : (
			<PreviewHeaderActions
				modelConfigs={modelConfigs}
				onRequestConfigs={onRequestConfigs}
				loadingConfigs={loadingConfigs}
				onGitCloneClick={onGitCloneClick}
				isGitHubExportReady={isGitHubExportReady}
				onGitHubExportClick={githubExport.openModal}
				previewRef={previewRef}
			/>
		);

		return renderViewWithHeader(
			<div className="flex items-center gap-2">
				<span className="text-sm font-mono text-text-50/70">
					{previewTitle}
				</span>
				<Copy text={previewUrl} />
				{showManualRefresh && (
					<button
						className="p-1 hover:bg-bg-2 rounded transition-colors"
						onClick={onManualRefresh}
						title="Refresh preview"
					>
						<RefreshCw className="size-4 text-text-primary/50" />
					</button>
				)}
			</div>,
			previewContent,
			headerActions
		);
	};

	const renderBlueprintView = () =>
		renderViewWithHeader(
			<div className="flex items-center gap-2">
				<span className="text-sm text-text-50/70 font-mono">Blueprint.md</span>
				{previewUrl && <Copy text={previewUrl} />}
			</div>,
			<div className="flex-1 overflow-y-auto bg-bg-3">
				<div className="py-12 mx-auto">
					<Blueprint
						blueprint={blueprint ?? ({} as BlueprintType)}
						className="w-full max-w-2xl mx-auto"
					/>
				</div>
			</div>
		);

	const renderEditorView = () => {
		// Defensive fallback: show file explorer with empty editor if no activeFile
		if (!activeFile) {
			return renderViewWithHeader(
				<div className="flex items-center gap-2">
					<span className="text-sm font-mono text-text-50/70">Select a file</span>
				</div>,
				<div className="flex-1 relative">
					<div className="absolute inset-0 flex" ref={editorRef}>
						<FileExplorer
							files={allFiles}
							currentFile={undefined}
							onFileClick={onFileClick}
						/>
						<div className="flex-1 flex items-center justify-center bg-bg-3">
							<span className="text-text-50/50 text-sm">No file selected</span>
						</div>
					</div>
				</div>,
				<EditorHeaderActions
					modelConfigs={modelConfigs}
					onRequestConfigs={onRequestConfigs}
					loadingConfigs={loadingConfigs}
					onGitCloneClick={onGitCloneClick}
					isGitHubExportReady={isGitHubExportReady}
					onGitHubExportClick={githubExport.openModal}
					editorRef={editorRef}
				/>
			);
		}

		return renderViewWithHeader(
			<div className="flex items-center gap-2">
				<span className="text-sm font-mono text-text-50/70">{activeFile.filePath}</span>
				{previewUrl && <Copy text={previewUrl} />}
			</div>,
			<div className="flex-1 relative">
				<div className="absolute inset-0 flex" ref={editorRef}>
					<FileExplorer
						files={allFiles}
						currentFile={activeFile}
						onFileClick={onFileClick}
					/>
					<div className="flex-1">
						<MonacoEditor
							className="h-full"
							createOptions={{
								value: activeFile.fileContents || '',
								language: activeFile.language || 'plaintext',
								readOnly: true,
								minimap: { enabled: false },
								lineNumbers: 'on',
								scrollBeyondLastLine: false,
								fontSize: 13,
								theme: 'vibesdk',
								automaticLayout: true,
							}}
							find={edit?.filePath === activeFile.filePath ? edit.search : undefined}
							replace={edit?.filePath === activeFile.filePath ? edit.replacement : undefined}
						/>
					</div>
				</div>
			</div>,
			<EditorHeaderActions
				modelConfigs={modelConfigs}
				onRequestConfigs={onRequestConfigs}
				loadingConfigs={loadingConfigs}
				onGitCloneClick={onGitCloneClick}
				isGitHubExportReady={isGitHubExportReady}
				onGitHubExportClick={githubExport.openModal}
				editorRef={editorRef}
			/>
		);
	};

	const renderView = () => {
		switch (view) {
			case 'docs':
				return renderDocsView();
			case 'preview':
			case 'presentation': // Presentations now use preview view
				return renderPreviewView();
			case 'blueprint':
				return renderBlueprintView();
			case 'editor':
				return renderEditorView();
			default:
				return null;
		}
	};

	return (
		<motion.div
			className="flex-1 flex flex-col overflow-hidden"
			initial={{ opacity: 0, scale: 0.84 }}
			animate={{ opacity: 1, scale: 1 }}
			transition={{ duration: 0.3, ease: 'easeInOut' }}
		>
			{renderView()}
		</motion.div>
	);
}
