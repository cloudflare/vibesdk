import { type RefObject, type ReactNode } from 'react';
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
import { PresentationPreview } from './presentation-preview';
import type { FileType, BlueprintType, BehaviorType, ModelConfigsInfo, TemplateDetails } from '@/api-types';
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
	projectType: string;
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

	// Presentation controls
	presentationSpeakerMode?: boolean;
	presentationPreviewMode?: boolean;
	onToggleSpeakerMode?: () => void;
	onTogglePreviewMode?: () => void;
	onExportPdf?: () => void;

	// Template metadata
	templateDetails?: TemplateDetails | null;

	// Other
	behaviorType?: BehaviorType;
	urlChatId?: string;
	isPhase1Complete: boolean;
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
		presentationSpeakerMode,
		presentationPreviewMode,
		onToggleSpeakerMode,
		onTogglePreviewMode,
		onExportPdf,
		behaviorType,
		urlChatId,
		isPhase1Complete,
		websocket,
		previewRef,
		editorRef,
		templateDetails,
	} = props;

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
            console.log('Preview not available');
            return null;
        }

		// Use PresentationPreview for presentations, regular PreviewIframe for apps
		const isPresentation = projectType === 'presentation';

		return renderViewWithHeader(
			<div className="flex items-center gap-2">
				<span className="text-sm font-mono text-text-50/70">
					{blueprint?.title ?? (isPresentation ? 'Presentation' : 'Preview')}
				</span>
				<Copy text={previewUrl} />
				{!isPresentation && (
					<button
						className="p-1 hover:bg-bg-2 rounded transition-colors"
						onClick={onManualRefresh}
						title="Refresh preview"
					>
						<RefreshCw className="size-4 text-text-primary/50" />
					</button>
				)}
			</div>,
			isPresentation ? (
				<PresentationPreview
					previewUrl={previewUrl}
					className="flex-1 w-full h-full"
					shouldRefreshPreview={shouldRefreshPreview}
					manualRefreshTrigger={manualRefreshTrigger}
					webSocket={websocket}
					speakerMode={presentationSpeakerMode}
					previewMode={presentationPreviewMode}
					allFiles={allFiles}
					templateDetails={templateDetails}
				/>
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
			),
			<PreviewHeaderActions
				modelConfigs={modelConfigs}
				onRequestConfigs={onRequestConfigs}
				loadingConfigs={loadingConfigs}
				onGitCloneClick={onGitCloneClick}
				isGitHubExportReady={isGitHubExportReady}
				onGitHubExportClick={githubExport.openModal}
				behaviorType={behaviorType}
				urlChatId={urlChatId}
				isPhase1Complete={isPhase1Complete}
				previewRef={previewRef}
				projectType={projectType}
				speakerMode={presentationSpeakerMode}
				previewMode={presentationPreviewMode}
				onToggleSpeakerMode={onToggleSpeakerMode}
				onTogglePreviewMode={onTogglePreviewMode}
				onExportPdf={onExportPdf}
			/>
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
		if (!activeFile) return null;

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
