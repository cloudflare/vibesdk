import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	type FormEvent,
} from 'react';
import {
	useParams,
	useSearchParams,
	useNavigate,
	useLocation,
} from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import {
	ExternalLink,
	LoaderCircle,
	RotateCcw,
} from 'lucide-react';
import {
	BookmarkSimpleIcon,
	DotsThree,
	DotsThreeIcon,
	GitBranch,
	Globe,
	Lock,
	LockOpen,
} from '@phosphor-icons/react';
import {
	Badge,
	Button,
	DropdownMenu,
	useKumoToastManager,
	cn,
} from '@cloudflare/kumo';
import { UserMessage, AIMessage } from './components/messages';
import { PhaseTimeline } from './components/phase-timeline';
import { type DebugMessage } from './components/debug-panel';
import { DeploymentControls } from './components/deployment-controls';
import { useChat } from './hooks/use-chat';
import {
	type ModelConfigsInfo,
	type BlueprintType,
	type PhasicBlueprint,
	SUPPORTED_IMAGE_MIME_TYPES,
	type AppDetailsData,
	type ProjectType,
	type FileType,
	type BehaviorType,
	type CloudflareDeploymentErrorCode,
	isAgenticLikeBehavior,
} from '@/api-types';
import type { ChatMessage } from './utils/message-helpers';
import { featureRegistry, useFeature } from '@/features';
import { useFileContentStream } from './hooks/use-file-content-stream';
import { logger } from '@/utils/logger';
import { startCloudflareConnect } from '@/lib/cloudflare-connect';
import {
	useApp,
	useToggleAppFavorite,
	useUpdateAppVisibility,
} from '@/hooks/use-app';
import { useAuth } from '@/contexts/auth-context';
import { useGitHubExport } from '@/hooks/use-github-export';
import { useAutoScroll } from '@/hooks/use-auto-scroll';
import { useImageUpload } from '@/hooks/use-image-upload';
import { useDragDrop } from '@/hooks/use-drag-drop';
import { sendWebSocketMessage } from './utils/websocket-helpers';
import {
	RollbackContext,
	type RollbackHandler,
} from './contexts/rollback-context';
import {
	detectContentType,
	isDocumentationPath,
	isMarkdownFile,
} from './utils/content-detector';
import { mergeFiles } from '@/utils/file-helpers';
import { ChatModals } from './components/chat-modals';
import { MainContentPanel } from './components/main-content-panel';
import { ChatInput } from './components/chat-input';
import { ClarifyingQuestionsPopup } from './components/clarifying-questions-popup';
import { useLimitsContext } from '@/contexts/limits-context';
import {
	checkCanSendPrompt,
	getBackendLimitDialog,
	getDeployGateDialog,
} from '@/utils/usage-limit-checker';
import { queryKeys } from '@/lib/query-keys';
import { ApiError } from '@/lib/api-client';
import { capitalizeFirstLetter } from '@/lib/utils';
import { usePageHeader } from '@/components/layout/header-context';
import { CloudflareLogo } from '@/components/icons/logos';

const isPhasicBlueprint = (
	blueprint?: BlueprintType | null,
): blueprint is PhasicBlueprint =>
	!!blueprint && 'implementationRoadmap' in blueprint;

/**
 * The think behavior's reload places the seeded first user prompt at index 0 of
 * `runningHistory`. That would collide with the always-rendered top
 * `UserMessage` (driven by `query`/`displayQuery`) and — because the
 * "main" message slot is rendered unconditionally as an `AIMessage` —
 * surface again as an assistant bubble below it. Filter only for
 * think; phasic/agentic rely on the `fetching-chat` placeholder
 * occupying index 0 and are unaffected.
 */
function dropLeadingUserForThink(
	messages: ChatMessage[],
	behaviorType: BehaviorType,
): ChatMessage[] {
	if (behaviorType !== 'think') return messages;
	return messages[0]?.role === 'user' ? messages.slice(1) : messages;
}

function ChatSession() {
	const { chatId: urlChatId } = useParams();

	const [searchParams] = useSearchParams();
	const location = useLocation();
	const userQuery = searchParams.get('query');
	const urlProjectType = searchParams.get('projectType') || 'app';
	const urlBehaviorType = searchParams.get(
		'behaviorType',
	) as BehaviorType | null;

	// Only auto-start a brand-new session when it originated from in-app
	// navigation (e.g. the home prompt box sets `fromPrompt`). Sessions opened
	// from a pasted/external link require explicit confirmation, since the
	// query is interpolated into the agent's system prompt.
	const startedFromInApp =
		(location.state as { fromPrompt?: boolean } | null)?.fromPrompt ===
		true;
	const autoStart = urlChatId !== 'new' || startedFromInApp;

	// Extract images from URL params if present
	const userImages = useMemo(() => {
		const imagesParam = searchParams.get('images');
		if (!imagesParam) return undefined;
		try {
			return JSON.parse(decodeURIComponent(imagesParam));
		} catch (error) {
			console.error('Failed to parse images from URL:', error);
			return undefined;
		}
	}, [searchParams]);

	// Load existing app data if chatId is provided
	const { app, loading: appLoading, refetch: refetchApp } = useApp(urlChatId);
	const { mutateAsync: updateVisibility, isPending: isUpdatingVisibility } =
		useUpdateAppVisibility(app?.id);
	const { mutateAsync: toggleFavorite } = useToggleAppFavorite(app?.id);
	const toast = useKumoToastManager();

	// If we have an existing app, use its data
	const displayQuery = app
		? app.originalPrompt || app.title
		: userQuery || '';
	const appTitle = app?.title;
	const isFavorited = app?.userFavorited || false;

	// Manual refresh trigger for preview
	const [manualRefreshTrigger, setManualRefreshTrigger] = useState(0);

	// Debug message utilities
	const addDebugMessage = useCallback(
		(
			type: DebugMessage['type'],
			message: string,
			details?: string,
			source?: string,
			messageType?: string,
			rawMessage?: unknown,
		) => {
			const debugMessage: DebugMessage = {
				id: `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
				timestamp: Date.now(),
				type,
				message,
				details,
				source,
				messageType,
				rawMessage,
			};

			setDebugMessages((prev) => [...prev, debugMessage]);
		},
		[],
	);

	const clearDebugMessages = useCallback(() => {
		setDebugMessages([]);
	}, []);

	// Deploy gate popup (backend-reported Cloudflare connection failures)
	const [showDeployGateDialog, setShowDeployGateDialog] = useState<React.ReactElement | null>(null);
	const handleCloudflareDeployGate = useCallback((code: CloudflareDeploymentErrorCode) => {
		const dialog = getDeployGateDialog(
			code,
			() => { void startCloudflareConnect(window.location.href); },
			() => setShowDeployGateDialog(null),
		);
		if (dialog) setShowDeployGateDialog(dialog);
	}, []);

	const {
		messages,
		edit,
		bootstrapFiles,
		chatId,
		query,
		files,
		isGeneratingBlueprint,
		isBootstrapping,
		totalFiles,
		websocket,
		sendUserMessage,
		blueprint,
		previewUrl,
		clearEdit,
		projectStages,
		phaseTimeline,
		isThinking,
		// Deployment and generation control
		isDeploying,
		cloudflareDeploymentUrl,
		deploymentError,
		isRedeployReady,
		isGenerationPaused,
		isGenerating,
		handleStopGeneration,
		handleResumeGeneration,
		handleDeployToCloudflare,
		// Preview refresh control
		shouldRefreshPreview,
		// Preview deployment state
		isPreviewDeploying,
		// Issue tracking and debugging state
		runtimeErrorCount,
		staticIssueCount,
		isDebugging,
		// Behavior type from backend
		behaviorType,
		projectType,
		// Template metadata
		templateDetails,
		// Backend error dialog state
		backendErrorDialog,
		setBackendErrorDialog,
		// Externally-sourced session start gate
		awaitingStartConfirmation,
		confirmStart,
		// Clarifying questions popup state
		clarifyingQuestions,
		submitClarifyingAnswers,
		dismissClarifyingQuestions,
	} = useChat({
		chatId: urlChatId,
		query: userQuery,
		images: userImages,
		projectType: urlProjectType as ProjectType,
		behaviorType: urlBehaviorType ?? undefined,
		autoStart,
		onDebugMessage: addDebugMessage,
		onCloudflareDeployGate: handleCloudflareDeployGate,
	});

	// GitHub export functionality - use urlChatId directly from URL params
	const githubExport = useGitHubExport(websocket, urlChatId, refetchApp);
	const { user } = useAuth();
	const queryClient = useQueryClient();
	const isOwner = !!app && app.userId === user?.id;

	const handleToggleVisibility = useCallback(async () => {
		if (!app || !user || !isOwner) {
			toast.add({
				title: 'You can only change visibility of your own apps',
				variant: 'error',
			});
			return;
		}

		try {
			const newVisibility =
				app.visibility === 'private' ? 'public' : 'private';
			const result = await updateVisibility(newVisibility);

			toast.add({
				title:
					result.message ||
					`App is now ${newVisibility === 'private' ? 'private' : 'public'}`,
				variant: 'success',
			});
		} catch (error) {
			console.error('Error updating app visibility:', error);
			toast.add({
				title:
					error instanceof ApiError
						? error.message
						: 'Failed to update visibility',
				variant: 'error',
			});
		}
	}, [app, user, isOwner, updateVisibility, toast]);

	const handleFavorite = useCallback(async () => {
		if (!app) return;
		try {
			const newState = await toggleFavorite();
			toast.add({
				title: newState
					? 'Added to bookmarks'
					: 'Removed from bookmarks',
				variant: 'success',
			});
		} catch (error) {
			console.error('Favorite error:', error);
			toast.add({
				title:
					error instanceof ApiError
						? error.message
						: 'Failed to update bookmarks',
				variant: 'error',
			});
		}
	}, [app, toggleFavorite, toast]);

	const navigate = useNavigate();

	const [activeFilePath, setActiveFilePath] = useState<string>();
	const [view, setView] = useState<
		| 'editor'
		| 'preview'
		| 'docs'
		| 'blueprint'
		| 'terminal'
		| 'presentation'
		| 'database'
		| 'repo'
	>('editor');

	// Terminal state
	// const [terminalLogs, setTerminalLogs] = useState<TerminalLog[]>([]);

	// Debug panel state
	const [debugMessages, setDebugMessages] = useState<DebugMessage[]>([]);
	const deploymentControlsRef = useRef<HTMLDivElement>(null);

	const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);
	const [isGitCloneModalOpen, setIsGitCloneModalOpen] = useState(false);

	// Deploy target for think apps: user-account deploys are gated behind the
	// platform's ENABLE_USER_ACCOUNT_DEPLOY flag (surfaced via capabilities).
	const { capabilities } = useFeature();
	const userAccountDeployEnabled = capabilities?.userAccountDeploy ?? false;

	const headerTitle = blueprint?.title || appTitle;
	const showHeader = Boolean(
		headerTitle || chatId || appLoading || app?.visibility,
	);

	const headerContent = useMemo(() => {
		if (!showHeader) return null;

		if (appLoading) {
			return {
				leading: (
					<div className="flex items-center gap-2 text-kumo-subtle text-sm">
						<LoaderCircle className="size-4 animate-spin" />
						Loading app...
					</div>
				),
			};
		}

		return {
			leading: (
				<div className="min-w-0 flex-1 flex items-center gap-2">
					<div
						className="text-sm font-semibold max-w-sm truncate min-w-0"
						title={headerTitle || undefined}
					>
						{headerTitle}
					</div>
					{app?.visibility && (
						<Badge
							className="shrink-0"
							variant={
								app.visibility === 'private'
									? 'secondary'
									: 'success'
							}
						>
							<span className="inline-flex items-center gap-1">
								<Globe className="h-3 w-3" weight="duotone" />
								{capitalizeFirstLetter(app.visibility)}
							</span>
						</Badge>
					)}
				</div>
			),
			trailing: (
				<>
					{behaviorType === 'think' && chatId && !appLoading && (
						<>
							{cloudflareDeploymentUrl && (
								<Button
									variant="ghost"
									className="h-8 shrink-0 px-2 text-xs text-text-tertiary hover:bg-kumo-elevated hover:text-text-primary"
									onClick={() => window.open(cloudflareDeploymentUrl, '_blank', 'noopener,noreferrer')}
								>
									<ExternalLink className="size-3.5" />
									View Live
								</Button>
							)}
							<Button
								variant="secondary"
								size="sm"
								disabled={isDeploying || files.length === 0}
								onClick={() => handleDeployToCloudflare(chatId || '', userAccountDeployEnabled ? 'user' : 'platform')}
							>
								{isDeploying ? (
									<LoaderCircle className="size-3.5 animate-spin" />
								) : (
									<CloudflareLogo className="size-3.5" />
								)}
								{isDeploying
									? 'Deploying...'
									: cloudflareDeploymentUrl
										? 'Redeploy'
										: userAccountDeployEnabled
											? 'Deploy to My Account'
											: 'Deploy'}
							</Button>
						</>
					)}
					{isOwner && app?.visibility === 'private' && (
						<Button
							variant="secondary"
							size="sm"
							onClick={handleToggleVisibility}
							disabled={isUpdatingVisibility}
							loading={isUpdatingVisibility}
							icon={
								<LockOpen
									className="size-3.5"
									weight="duotone"
								/>
							}
						>
							Make public
						</Button>
					)}
					{isOwner && app?.visibility === 'public' && (
						<Button
							variant="secondary"
							size="sm"
							onClick={() => navigate(`/app/${app.id}`)}
							icon={<ExternalLink className="size-3.5" />}
						>
							View public preview
						</Button>
					)}
					{app && (
						<DropdownMenu>
							<DropdownMenu.Trigger
								render={
									<Button
										variant="secondary"
										size="sm"
										shape="square"
										aria-label="More actions"
										icon={<DotsThree className="h-4 w-4" />}
									/>
								}
							/>
							<DropdownMenu.Content align="end">
								<DropdownMenu.Item
									icon={BookmarkSimpleIcon}
									onClick={() => {
										void handleFavorite();
									}}
								>
									{isFavorited ? 'Bookmarked' : 'Bookmark'}
								</DropdownMenu.Item>
								{isOwner && app.visibility === 'public' && (
									<DropdownMenu.Item
										icon={Lock}
										onClick={handleToggleVisibility}
									>
										Make private
									</DropdownMenu.Item>
								)}
								<DropdownMenu.Item
									icon={GitBranch}
									onClick={() => setIsGitCloneModalOpen(true)}
								>
									Clone
								</DropdownMenu.Item>
							</DropdownMenu.Content>
						</DropdownMenu>
					)}
				</>
			),
		};
	}, [
		showHeader,
		appLoading,
		headerTitle,
		app,
		isOwner,
		navigate,
		isUpdatingVisibility,
		handleToggleVisibility,
		handleFavorite,
		isFavorited,
		behaviorType,
		chatId,
		cloudflareDeploymentUrl,
		isDeploying,
		files,
		handleDeployToCloudflare,
		userAccountDeployEnabled,
	]);

	usePageHeader(headerContent);

	// Usage limits state
	const { data: limitsData, loading: limitsLoading } = useLimitsContext();
	const [showLimitDialog, setShowLimitDialog] =
		useState<React.ReactElement | null>(null);

	// Debug: Log when backend error dialog state changes
	useEffect(() => {
		console.log(
			'🔍 Backend error dialog state changed:',
			backendErrorDialog,
		);
	}, [backendErrorDialog]);

	// Model config info state
	const [modelConfigs, setModelConfigs] = useState<
		ModelConfigsInfo | undefined
	>();
	const [loadingConfigs, setLoadingConfigs] = useState(false);

	// Handler for model config info requests
	const handleRequestConfigs = useCallback(() => {
		if (!websocket) return;

		setLoadingConfigs(true);
		websocket.send(
			JSON.stringify({
				type: 'get_model_configs',
			}),
		);
	}, [websocket]);

	// Listen for model config info WebSocket messages
	useEffect(() => {
		if (!websocket) return;

		const handleMessage = (event: MessageEvent) => {
			try {
				const message = JSON.parse(event.data);
				if (message.type === 'model_configs_info') {
					setModelConfigs(message.configs);
					setLoadingConfigs(false);
				}
			} catch (error) {
				logger.error(
					'Error parsing WebSocket message for model configs:',
					error,
				);
			}
		};

		websocket.addEventListener('message', handleMessage);

		return () => {
			websocket.removeEventListener('message', handleMessage);
		};
	}, [websocket]);

	const hasSeenPreview = useRef(false);
	const prevMarkdownCountRef = useRef(0);
	const hasSwitchedFile = useRef(false);
	// const wasChatDisabled = useRef(true);
	// const hasShownWelcome = useRef(false);

	const editorRef = useRef<HTMLDivElement>(null);
	const previewRef = useRef<HTMLIFrameElement>(null);
	const messagesContainerRef = useRef<HTMLDivElement>(null);

	const [newMessage, setNewMessage] = useState('');
	const [showTooltip, setShowTooltip] = useState(false);

	const { images, addImages, removeImage, clearImages, isProcessing } =
		useImageUpload({
			onError: (error) => {
				console.error('Chat image upload error:', error);
			},
		});

	// Fake stream bootstrap files
	const { streamedFiles: streamedBootstrapFiles } = useFileContentStream(
		bootstrapFiles,
		{
			tps: 600,
			enabled: isBootstrapping,
		},
	);

	// Merge streamed bootstrap files with generated files
	const allFiles = useMemo(() => {
		let result: FileType[];

		if (templateDetails?.allFiles) {
			const templateFiles = Object.entries(templateDetails.allFiles).map(
				([filePath, fileContents]) => ({
					filePath,
					fileContents,
				}),
			);
			result = mergeFiles(templateFiles, files);
		} else {
			result = files;
		}

		// Use feature module's processFiles if available (e.g., for presentations to filter demo slides)
		const featureModule = featureRegistry.getModule(projectType);
		if (featureModule?.processFiles) {
			result = featureModule.processFiles(result, templateDetails);
		}

		return result;
	}, [files, templateDetails, projectType]);

	const handleFileClick = useCallback((file: FileType) => {
		logger.debug('handleFileClick()', file);
		clearEdit();
		setActiveFilePath(file.filePath);
		setView('editor');
		if (!hasSwitchedFile.current) {
			hasSwitchedFile.current = true;
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const handleViewModeChange = useCallback(
		(
			mode:
				| 'preview'
				| 'editor'
				| 'docs'
				| 'blueprint'
				| 'presentation'
				| 'database'
				| 'repo',
		) => {
			setView(mode);
		},
		[],
	);

	const handleResetConversation = useCallback(() => {
		if (!websocket) return;
		sendWebSocketMessage(websocket, 'clear_conversation');
		setIsResetDialogOpen(false);
	}, [websocket]);

	// Rollback is think-only. Disabled (null) for other behaviors so the tool
	// cards hide the control. Blocks while a turn/deploy is in flight.
	const rollbackHandler = useMemo<RollbackHandler>(() => {
		if (behaviorType !== 'think') return null;
		return (commitHash: string) => {
			if (!websocket) return;
			if (isGenerating || isDeploying) {
				toast.add({
					title: 'Please wait for the current action to finish before rolling back.',
					type: 'error',
				});
				return;
			}
			sendWebSocketMessage(websocket, 'rollback_to_commit', {
				commitHash,
			});
			toast.add({
				title: 'Rolling back and redeploying…',
				type: 'info',
			});
		};
	}, [behaviorType, websocket, isGenerating, isDeploying, toast]);

	// // Terminal functions
	// const handleTerminalCommand = useCallback((command: string) => {
	// 	if (websocket && websocket.readyState === WebSocket.OPEN) {
	// 		// Add command to terminal logs
	// 		const commandLog: TerminalLog = {
	// 			id: `cmd-${Date.now()}`,
	// 			content: command,
	// 			type: 'command',
	// 			timestamp: Date.now()
	// 		};
	// 		setTerminalLogs(prev => [...prev, commandLog]);

	// 		// Send command via WebSocket
	// 		websocket.send(JSON.stringify({
	// 			type: 'terminal_command',
	// 			command,
	// 			timestamp: Date.now()
	// 		}));
	// 	}
	// }, [websocket, setTerminalLogs]);

	const generatingCount = useMemo(
		() =>
			files.reduce(
				(count, file) => (file.isGenerating ? count + 1 : count),
				0,
			),
		[files],
	);

	const codeGenState = useMemo(() => {
		return projectStages.find((stage) => stage.id === 'code')?.status;
	}, [projectStages]);

	const generatingFile = useMemo(() => {
		// code gen status should be active
		if (codeGenState === 'active') {
			for (let i = files.length - 1; i >= 0; i--) {
				if (files[i].isGenerating) return files[i];
			}
		}
		return undefined;
	}, [files, codeGenState]);

	const activeFile = useMemo(() => {
		if (!hasSwitchedFile.current && generatingFile) {
			return generatingFile;
		}
		if (!hasSwitchedFile.current && isBootstrapping) {
			return streamedBootstrapFiles.find(
				(file) => file.filePath === activeFilePath,
			);
		}
		return (
			files.find((file) => file.filePath === activeFilePath) ??
			streamedBootstrapFiles.find(
				(file) => file.filePath === activeFilePath,
			) ??
			// Fallback to allFiles for template files that were merged in
			allFiles.find((file) => file.filePath === activeFilePath)
		);
	}, [
		activeFilePath,
		generatingFile,
		files,
		streamedBootstrapFiles,
		isBootstrapping,
		allFiles,
	]);

	const isPhase1Complete = useMemo(() => {
		return (
			phaseTimeline.length > 0 && phaseTimeline[0].status === 'completed'
		);
	}, [phaseTimeline]);

	const isGitHubExportReady = useMemo(() => {
		if (isAgenticLikeBehavior(behaviorType)) {
			return files.length > 0 && !!urlChatId;
		}
		return isPhase1Complete && !!urlChatId;
	}, [behaviorType, files.length, isPhase1Complete, urlChatId]);

	// Detect if agentic mode is showing static content (docs, markdown)
	const isStaticContent = useMemo(() => {
		if (!isAgenticLikeBehavior(behaviorType) || files.length === 0)
			return false;
		return files.every((file) =>
			isDocumentationPath(file.filePath.toLowerCase()),
		);
	}, [behaviorType, files]);

	// Detect content type (documentation detection - works in any projectType)
	const contentDetection = useMemo(() => {
		return detectContentType(files);
	}, [files]);

	const hasDocumentation = useMemo(() => {
		return Object.values(contentDetection.Contents).some(
			(bundle) => bundle.type === 'markdown',
		);
	}, [contentDetection]);

	// Preview available based on projectType and content
	const previewAvailable = useMemo(() => {
		if (hasDocumentation || !!previewUrl) return true;
		return false;
	}, [hasDocumentation, previewUrl]);

	const showMainView = useMemo(() => {
		// For agentic/think mode: show preview panel when files exist or preview URL exists
		if (isAgenticLikeBehavior(behaviorType)) {
			const hasFiles = files.length > 0;
			const hasPreview = !!previewUrl;
			const result = hasFiles || hasPreview;
			return result;
		}
		// For phasic mode: keep existing logic
		const result =
			streamedBootstrapFiles.length > 0 ||
			!!blueprint ||
			files.length > 0;
		return result;
	}, [
		behaviorType,
		blueprint,
		files.length,
		previewUrl,
		streamedBootstrapFiles.length,
	]);

	const messagesForDisplay = useMemo(
		() => dropLeadingUserForThink(messages, behaviorType),
		[messages, behaviorType],
	);
	const [mainMessage, ...otherMessages] = useMemo(
		() => messagesForDisplay,
		[messagesForDisplay],
	);
	const richToolPreview = behaviorType === 'think';

	const { scrollToBottom } = useAutoScroll(messagesContainerRef, {
		behavior: 'smooth',
		watch: [messages],
	});

	const prevMessagesLengthRef = useRef(0);

	useEffect(() => {
		// Force scroll when a new message is appended (length increase)
		if (messages.length > prevMessagesLengthRef.current) {
			requestAnimationFrame(() => scrollToBottom());
		}
		prevMessagesLengthRef.current = messages.length;
	}, [messages.length, scrollToBottom]);

	useEffect(() => {
		if (hasSeenPreview.current) return;

		const markdownFiles = files.filter(isMarkdownFile);
		const isGeneratingMarkdown = markdownFiles.some((f) => f.isGenerating);
		const newMarkdownAdded =
			markdownFiles.length > prevMarkdownCountRef.current;

		// Auto-switch to docs ONLY when NEW markdown is being generated
		if (hasDocumentation && newMarkdownAdded && isGeneratingMarkdown) {
			setView('docs');
			setShowTooltip(true);
			setTimeout(() => setShowTooltip(false), 3000);
			hasSeenPreview.current = true;
		} else if (isStaticContent && files.length > 0 && !hasDocumentation) {
			// For other static content (non-documentation), show editor view
			setView('editor');
			// Auto-select first file if none selected
			if (!activeFilePath) {
				setActiveFilePath(files[0].filePath);
			}
			hasSeenPreview.current = true;
		} else if (previewUrl) {
			const isExistingChat = urlChatId !== 'new';
			const shouldSwitch =
				(isAgenticLikeBehavior(behaviorType) && !isPreviewDeploying) ||
				(behaviorType === 'phasic' && isPhase1Complete) ||
				(isExistingChat && behaviorType !== 'phasic');

			if (shouldSwitch) {
				setView('preview');
				setShowTooltip(true);
				setTimeout(() => {
					setShowTooltip(false);
				}, 3000);
				hasSeenPreview.current = true;
			}
		}

		// Update ref for next comparison
		prevMarkdownCountRef.current = markdownFiles.length;
	}, [
		previewUrl,
		isPhase1Complete,
		isStaticContent,
		files,
		activeFilePath,
		behaviorType,
		hasDocumentation,
		projectType,
		urlChatId,
		isPreviewDeploying,
	]);

	useEffect(() => {
		if (chatId) {
			navigate(`/chat/${chatId}`, {
				replace: true,
			});
		}
	}, [chatId, navigate]);

	useEffect(() => {
		if (!edit) return;
		if (files.some((file) => file.filePath === edit.filePath)) {
			setActiveFilePath(edit.filePath);
			setView('editor');
		}
	}, [edit, files]);

	useEffect(() => {
		if (
			isBootstrapping &&
			streamedBootstrapFiles.length > 0 &&
			!hasSwitchedFile.current
		) {
			setActiveFilePath(streamedBootstrapFiles.at(-1)!.filePath);
		} else if (
			view === 'editor' &&
			!activeFile &&
			files.length > 0 &&
			!hasSwitchedFile.current
		) {
			setActiveFilePath(files.at(-1)!.filePath);
		}
	}, [view, activeFile, files, isBootstrapping, streamedBootstrapFiles]);

	// Preserve active file when generation completes
	useEffect(() => {
		if (!generatingFile && activeFile && !hasSwitchedFile.current) {
			// Generation just ended, preserve the current active file
			setActiveFilePath(activeFile.filePath);
		}
	}, [generatingFile, activeFile]);

	useEffect(() => {
		if (view !== 'blueprint' && isGeneratingBlueprint) {
			setView('blueprint');
		} else if (
			!hasSwitchedFile.current &&
			view === 'blueprint' &&
			!isGeneratingBlueprint
		) {
			setView('editor');
		}
	}, [isGeneratingBlueprint, view]);

	const isRunning = useMemo(() => {
		return (
			isBootstrapping || isGeneratingBlueprint // || codeGenState === 'active'
		);
	}, [isBootstrapping, isGeneratingBlueprint]);

	// Check if chat input should be disabled (before blueprint completion, or during debugging)
	const isChatDisabled = useMemo(() => {
		const blueprintStage = projectStages.find(
			(stage) => stage.id === 'blueprint',
		);
		const blueprintNotCompleted =
			!blueprintStage || blueprintStage.status !== 'completed';

		return blueprintNotCompleted || isDebugging;
	}, [projectStages, isDebugging]);

	const chatFormRef = useRef<HTMLFormElement>(null);
	const { isDragging: isChatDragging, dragHandlers: chatDragHandlers } =
		useDragDrop({
			onFilesDropped: addImages,
			accept: [...SUPPORTED_IMAGE_MIME_TYPES],
			disabled: isChatDisabled,
		});

	const onNewMessage = useCallback(
		(e: FormEvent) => {
			e.preventDefault();

			// Don't submit if chat is disabled or message is empty
			if (isChatDisabled || !newMessage.trim()) {
				return;
			}

			// Check usage limits before sending
			const limitCheck = checkCanSendPrompt(
				limitsData,
				limitsLoading,
				() => {
					void startCloudflareConnect(window.location.href);
				},
				() => setShowLimitDialog(null),
			);

			if (!limitCheck.canProceed) {
				setShowLimitDialog(limitCheck.dialogComponent || null);
				return;
			}

			// When generation is active, send as conversational AI suggestion
			sendWebSocketMessage(websocket, 'user_suggestion', {
				message: newMessage,
				images: images.length > 0 ? images : undefined,
			});
			sendUserMessage(newMessage);
			setNewMessage('');
			// Clear images after sending
			if (images.length > 0) {
				clearImages();
			}
			// Ensure we scroll after sending our own message
			requestAnimationFrame(() => scrollToBottom());
		},
		[
			newMessage,
			websocket,
			sendUserMessage,
			isChatDisabled,
			scrollToBottom,
			images,
			clearImages,
			limitsData,
			limitsLoading,
		],
	);

	const [progress, total] = useMemo((): [number, number] => {
		// Calculate phase progress instead of file progress
		const completedPhases = phaseTimeline.filter(
			(p) => p.status === 'completed',
		).length;

		// Get predicted phase count from blueprint, fallback to current phase count
		const predictedPhaseCount = isPhasicBlueprint(blueprint)
			? blueprint.implementationRoadmap.length
			: 0;
		const totalPhases = Math.max(
			predictedPhaseCount,
			phaseTimeline.length,
			1,
		);

		return [completedPhases, totalPhases];
	}, [phaseTimeline, blueprint]);

	if (import.meta.env.DEV) {
		logger.debug({
			messages,
			files,
			blueprint,
			query,
			userQuery,
			chatId,
			previewUrl,
			generatingFile,
			activeFile,
			bootstrapFiles,
			streamedBootstrapFiles,
			isGeneratingBlueprint,
			view,
			totalFiles,
			generatingCount,
			isBootstrapping,
			activeFilePath,
			progress,
			total,
			isRunning,
			projectStages,
		});
	}

	if (awaitingStartConfirmation) {
		return (
			<div className="size-full flex items-center justify-center p-6 text-text-primary">
				<title>Start building - Build</title>
				<div className="max-w-lg w-full flex flex-col gap-4 rounded-xl border bg-kumo-elevated p-6">
					<h1 className="text-lg font-medium">
						Start building this app?
					</h1>
					<p className="text-sm text-text-secondary">
						This link wants to start a new project with the prompt
						below. Review it before continuing.
					</p>
					<div className="rounded-lg border p-4 max-h-64 overflow-y-auto">
						<p className="text-sm text-text-primary whitespace-pre-wrap break-words">
							{displayQuery}
						</p>
					</div>
					<div className="flex items-center justify-end gap-2">
						<Button
							variant="secondary"
							onClick={() => navigate('/')}
						>
							Cancel
						</Button>
						<Button variant="primary" onClick={confirmStart}>
							Start building
						</Button>
					</div>
				</div>
			</div>
		);
	}

	return (
		<RollbackContext.Provider value={rollbackHandler}>
			<title>
				{headerTitle ? `${headerTitle} - Build` : 'Chat - Build'}
			</title>
			<div className="size-full flex flex-col min-h-0 text-text-primary">
				<div className="flex-1 flex min-h-0 overflow-hidden justify-center">
					<motion.div
						layout="position"
						className={cn("flex-1 shrink-0 flex flex-col basis-0 relative z-10 h-full min-h-0", showMainView ? 'max-w-xl' : 'max-w-3xl')}
					>
						<div
							className={cn(
								'flex-1 overflow-y-auto min-h-0 chat-messages-scroll',
								isDebugging && 'animate-debug-pulse',
							)}
							ref={messagesContainerRef}
						>
							<div className="pt-5 px-4 pb-4 text-sm flex flex-col gap-5">
								{!appLoading && (
									<UserMessage
										message={query ?? displayQuery}
									/>
								)}

								{mainMessage?.role === 'assistant' && (
									<div className="relative">
										<AIMessage
											message={mainMessage.content}
											parts={mainMessage.parts}
											isThinking={
												mainMessage.ui?.isThinking
											}
											toolEvents={
												mainMessage.ui?.toolEvents
											}
											richToolPreview={richToolPreview}
										/>
										{chatId && (
											<div className="absolute right-1 top-1">
												<DropdownMenu>
													<DropdownMenu.Trigger
														render={
															<Button
																variant="ghost"
																size="sm"
																shape="square"
																aria-label="Chat actions"
																icon={
																	<DotsThreeIcon className="size-4.5" />
																}
															/>
														}
													/>
													<DropdownMenu.Content align="end">
														<DropdownMenu.Item
															icon={RotateCcw}
															onClick={() =>
																setIsResetDialogOpen(
																	true,
																)
															}
														>
															Reset conversation
														</DropdownMenu.Item>
													</DropdownMenu.Content>
												</DropdownMenu>
											</div>
										)}
									</div>
								)}

								{otherMessages
									.filter(
										(message) =>
											message.role === 'assistant' &&
											message.ui?.isThinking,
									)
									.map((message) => (
										<div
											key={message.conversationId}
											className="mb-4"
										>
											<AIMessage
												message={message.content}
												parts={message.parts}
												isThinking={true}
												toolEvents={
													message.ui?.toolEvents
												}
												richToolPreview={
													richToolPreview
												}
											/>
										</div>
									))}

								{isThinking &&
									!otherMessages.some(
										(m) => m.ui?.isThinking,
									) && (
										<div className="mb-4">
											<AIMessage
												message="Planning next phase..."
												isThinking={true}
												richToolPreview={
													richToolPreview
												}
											/>
										</div>
									)}

								{/* Only show PhaseTimeline for phasic mode */}
								{behaviorType === 'phasic' && (
									<PhaseTimeline
										projectStages={projectStages}
										phaseTimeline={phaseTimeline}
										files={files}
										view={view}
										activeFile={activeFile}
										onFileClick={handleFileClick}
										isThinkingNext={isThinking}
										isPreviewDeploying={isPreviewDeploying}
										progress={progress}
										total={total}
										parentScrollRef={messagesContainerRef}
										onViewChange={(viewMode) => {
											setView(viewMode);
											hasSwitchedFile.current = true;
										}}
										chatId={chatId}
										isDeploying={isDeploying}
										handleDeployToCloudflare={
											handleDeployToCloudflare
										}
										runtimeErrorCount={runtimeErrorCount}
										staticIssueCount={staticIssueCount}
										isDebugging={isDebugging}
										isGenerating={isGenerating}
										isThinking={isThinking}
									/>
								)}

								{/* Deployment and Generation Controls - Only for phasic mode */}
								{chatId && behaviorType === 'phasic' && (
										<motion.div
											ref={deploymentControlsRef}
											initial={{ opacity: 0, y: 20 }}
											animate={{ opacity: 1, y: 0 }}
											transition={{
												duration: 0.3,
												delay: 0.2,
											}}
											className="px-4 mb-6"
										>
											<DeploymentControls
												isPhase1Complete={
													isPhase1Complete
												}
												isDeploying={isDeploying}
												deploymentUrl={
													cloudflareDeploymentUrl
												}
												instanceId={chatId || ''}
												isRedeployReady={
													isRedeployReady
												}
												deploymentError={
													deploymentError
												}
												appId={app?.id || chatId}
												appVisibility={app?.visibility}
												isGenerating={
													isGenerating ||
													isGeneratingBlueprint
												}
												isPaused={isGenerationPaused}
												onDeploy={(instanceId) => handleDeployToCloudflare(instanceId, 'platform')}
												deploymentTarget="platform"
												onStopGeneration={
													handleStopGeneration
												}
												onResumeGeneration={
													handleResumeGeneration
												}
												onVisibilityUpdate={(
													newVisibility,
												) => {
													if (!app?.id) return;

													queryClient.setQueryData<AppDetailsData>(
														queryKeys.account.apps.detail(
															app.id,
															user?.id,
														),
														(prev) =>
															prev
																? {
																		...prev,
																		visibility:
																			newVisibility,
																	}
																: prev,
													);
													void queryClient.invalidateQueries(
														{
															queryKey:
																queryKeys.account.apps.all(),
														},
													);
												}}
											/>
										</motion.div>
									)}

								{otherMessages
									.filter(
										(message) => !message.ui?.isThinking,
									)
									.map((message) => {
										if (message.role === 'assistant') {
											return (
												<AIMessage
													key={message.conversationId}
													message={message.content}
													parts={message.parts}
													isThinking={
														message.ui?.isThinking
													}
													toolEvents={
														message.ui?.toolEvents
													}
													richToolPreview={
														richToolPreview
													}
												/>
											);
										}
										return (
											<UserMessage
												key={message.conversationId}
												message={message.content}
											/>
										);
									})}
							</div>
						</div>

						<ChatInput
							newMessage={newMessage}
							onMessageChange={setNewMessage}
							onSubmit={onNewMessage}
							images={images}
							onAddImages={addImages}
							onRemoveImage={removeImage}
							isProcessing={isProcessing}
							isChatDragging={isChatDragging}
							chatDragHandlers={chatDragHandlers}
							isChatDisabled={isChatDisabled}
							isRunning={isRunning}
							isGenerating={isGenerating}
							isGeneratingBlueprint={isGeneratingBlueprint}
							isDebugging={isDebugging}
							websocket={websocket}
							chatFormRef={chatFormRef}
							limitsData={limitsData}
							onConnectCloudflare={() => {
								void startCloudflareConnect(window.location.href);
							}}
							aboveContent={
								<ClarifyingQuestionsPopup
									questions={clarifyingQuestions ?? []}
									open={
										clarifyingQuestions !== null &&
										clarifyingQuestions.length > 0
									}
									onSubmit={submitClarifyingAnswers}
									onDismiss={dismissClarifyingQuestions}
								/>
							}
						/>
					</motion.div>

					<AnimatePresence mode="wait">
						{showMainView && (
							<motion.div
								key="main-content-panel"
								initial={{ opacity: 0 }}
								animate={{ opacity: 1 }}
								exit={{ opacity: 0 }}
								className="flex-1 flex shrink-0 basis-0 z-30 min-h-0"
							>
								<MainContentPanel
									view={view}
									onViewChange={handleViewModeChange}
									hasDocumentation={hasDocumentation}
									contentDetection={contentDetection}
									projectType={projectType}
									previewUrl={previewUrl}
									previewAvailable={previewAvailable}
									showTooltip={showTooltip}
									shouldRefreshPreview={shouldRefreshPreview}
									manualRefreshTrigger={manualRefreshTrigger}
									onManualRefresh={() =>
										setManualRefreshTrigger(Date.now())
									}
									blueprint={blueprint}
									activeFile={activeFile}
									allFiles={allFiles}
									edit={edit}
									onFileClick={handleFileClick}
									isGenerating={isGenerating}
									isGeneratingBlueprint={
										isGeneratingBlueprint
									}
									modelConfigs={modelConfigs}
									loadingConfigs={loadingConfigs}
									onRequestConfigs={handleRequestConfigs}
									onGitCloneClick={() =>
										setIsGitCloneModalOpen(true)
									}
									isGitHubExportReady={isGitHubExportReady}
									githubExport={githubExport}
									behaviorType={behaviorType}
									websocket={websocket}
									previewRef={previewRef}
									editorRef={editorRef}
									templateDetails={templateDetails}
									agentId={chatId}
									databaseAvailable={
										behaviorType === 'think' && !!chatId
									}
									repoAvailable={
										behaviorType === 'think' &&
										!!chatId &&
										(capabilities?.artifacts ?? false)
									}
								/>
							</motion.div>
						)}
					</AnimatePresence>
				</div>

				<ChatModals
					debugMessages={debugMessages}
					chatId={chatId}
					onClearDebugMessages={clearDebugMessages}
					isResetDialogOpen={isResetDialogOpen}
					onResetDialogChange={setIsResetDialogOpen}
					onResetConversation={handleResetConversation}
					githubExport={githubExport}
					app={app}
					urlChatId={urlChatId}
					isGitCloneModalOpen={isGitCloneModalOpen}
					onGitCloneModalChange={setIsGitCloneModalOpen}
					user={user}
				/>

				{/* Usage limit dialogs */}
				{showLimitDialog}

				{/* Deploy gate dialog (backend-reported CF connection failure) */}
				{showDeployGateDialog}

				{/* Backend error dialog - shows when backend blocks request due to limits */}
				{(() => {
					if (
						backendErrorDialog.isOpen &&
						backendErrorDialog.errorCode === 'USAGE_LIMIT_EXCEEDED'
					) {
						const limitCheckResult = getBackendLimitDialog(
							limitsData,
							() => {
								setBackendErrorDialog({ isOpen: false });
								window.location.href = '/settings';
							},
							() => setBackendErrorDialog({ isOpen: false }),
						);

						return limitCheckResult.dialogComponent || null;
					}
					return null;
				})()}
			</div>
		</RollbackContext.Provider>
	);
}

/**
 * The router reuses a single `ChatSession` instance across `/chat/:chatId`, so
 * navigating between two existing apps (e.g. from the sidebar) would otherwise
 * leave the previous session's websocket, messages, and files in place because
 * `useChat` only initializes while its connection is idle. Remount on a genuine
 * switch by keying on the URL id, but preserve the instance across the
 * `new -> realId` replace performed after a new session is created — remounting
 * there would tear down the live generation session.
 */
export default function Chat() {
	const { chatId } = useParams();
	const [mountKey, setMountKey] = useState(() => chatId ?? 'new');
	const prevChatId = useRef(chatId);

	useEffect(() => {
		if (chatId === prevChatId.current) return;
		const wasNewSession = prevChatId.current === 'new';
		prevChatId.current = chatId;
		if (!wasNewSession) setMountKey(chatId ?? 'new');
	}, [chatId]);

	return <ChatSession key={mountKey} />;
}
