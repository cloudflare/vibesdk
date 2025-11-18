import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	type FormEvent,
} from 'react';
import { ArrowRight, Image as ImageIcon } from 'react-feather';
import { useParams, useSearchParams, useNavigate } from 'react-router';
import { MonacoEditor } from '../../components/monaco-editor/monaco-editor';
import { AnimatePresence, motion } from 'framer-motion';
import { Expand, Github, GitBranch, LoaderCircle, RefreshCw, MoreHorizontal, RotateCcw, X } from 'lucide-react';
import clsx from 'clsx';
import { Blueprint } from './components/blueprint';
import { FileExplorer } from './components/file-explorer';
import { UserMessage, AIMessage } from './components/messages';
import { PhaseTimeline } from './components/phase-timeline';
import { PreviewIframe } from './components/preview-iframe';
import { ViewModeSwitch } from './components/view-mode-switch';
import { DebugPanel, type DebugMessage } from './components/debug-panel';
import { DeploymentControls } from './components/deployment-controls';
import { useChat, type FileType } from './hooks/use-chat';
import { type ModelConfigsData, type BlueprintType, SUPPORTED_IMAGE_MIME_TYPES } from '@/api-types';
import { Copy } from './components/copy';
import { useFileContentStream } from './hooks/use-file-content-stream';
import { logger } from '@/utils/logger';
import { useApp } from '@/hooks/use-app';
import { useAuth } from '@/contexts/auth-context';
import { AgentModeDisplay } from '@/components/agent-mode-display';
import { useGitHubExport } from '@/hooks/use-github-export';
import { GitHubExportModal } from '@/components/github-export-modal';
import { GitCloneModal } from '@/components/shared/GitCloneModal';
import { ModelConfigInfo } from './components/model-config-info';
import { useAutoScroll } from '@/hooks/use-auto-scroll';
import { useImageUpload } from '@/hooks/use-image-upload';
import { useDragDrop } from '@/hooks/use-drag-drop';
import { ImageAttachmentPreview } from '@/components/image-attachment-preview';
import { createAIMessage } from './utils/message-helpers';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { sendWebSocketMessage } from './utils/websocket-helpers';

export default function Chat() {
	const { chatId: urlChatId } = useParams();

	const [searchParams] = useSearchParams();
	const userQuery = searchParams.get('query');
	const agentMode = searchParams.get('agentMode') || 'deterministic';
	
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

	// If we have an existing app, use its data
	const displayQuery = app ? app.originalPrompt || app.title : userQuery || '';
	const appTitle = app?.title;

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
		sendAiMessage,
		blueprint,
		previewUrl,
		clearEdit,
		projectStages,
		phaseTimeline,
		isThinking,
		onCompleteBootstrap,
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
	} = useChat({
		chatId: urlChatId,
		query: userQuery,
		images: userImages,
		agentMode: agentMode as 'deterministic' | 'smart',
		onDebugMessage: addDebugMessage,
	});

	// GitHub export functionality - use urlChatId directly from URL params
	const githubExport = useGitHubExport(websocket, urlChatId, refetchApp);
	const { user } = useAuth();

	const navigate = useNavigate();

	const [activeFilePath, setActiveFilePath] = useState<string>();
	const [view, setView] = useState<'editor' | 'preview' | 'blueprint' | 'terminal'>(
		'editor',
	);

	// Terminal state
	// const [terminalLogs, setTerminalLogs] = useState<TerminalLog[]>([]);

	// Debug panel state
	const [debugMessages, setDebugMessages] = useState<DebugMessage[]>([]);
	const deploymentControlsRef = useRef<HTMLDivElement>(null);

	const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);
	const [isGitCloneModalOpen, setIsGitCloneModalOpen] = useState(false);

	// Model config info state
	const [modelConfigs, setModelConfigs] = useState<{
		agents: Array<{ key: string; name: string; description: string; }>;
		userConfigs: ModelConfigsData['configs'];
		defaultConfigs: ModelConfigsData['defaults'];
	} | undefined>();
	const [loadingConfigs, setLoadingConfigs] = useState(false);

	// Handler for model config info requests
	const handleRequestConfigs = useCallback(() => {
		if (!websocket) return;

		setLoadingConfigs(true);
		websocket.send(JSON.stringify({
			type: 'get_model_configs'
		}));
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
				logger.error('Error parsing WebSocket message for model configs:', error);
			}
		};

		websocket.addEventListener('message', handleMessage);

		return () => {
			websocket.removeEventListener('message', handleMessage);
		};
	}, [websocket]);

	const hasSeenPreview = useRef(false);
	const hasSwitchedFile = useRef(false);
	// const wasChatDisabled = useRef(true);
	// const hasShownWelcome = useRef(false);

	const editorRef = useRef<HTMLDivElement>(null);
	const previewRef = useRef<HTMLIFrameElement>(null);
	const messagesContainerRef = useRef<HTMLDivElement>(null);

	const [newMessage, setNewMessage] = useState('');
	const [showTooltip, setShowTooltip] = useState(false);
	
	// Word count utilities
	const MAX_WORDS = 4000;
	const countWords = (text: string): number => {
		return text.trim().split(/\s+/).filter(word => word.length > 0).length;
	};

	const { images, addImages, removeImage, clearImages, isProcessing } = useImageUpload({
		onError: (error) => {
			console.error('Chat image upload error:', error);
		},
	});
	const imageInputRef = useRef<HTMLInputElement>(null);

	// Fake stream bootstrap files
	const { streamedFiles: streamedBootstrapFiles, doneStreaming } =
		useFileContentStream(bootstrapFiles, {
			tps: 600,
			enabled: isBootstrapping,
		});

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

	const handleViewModeChange = useCallback((mode: 'preview' | 'editor' | 'blueprint') => {
		setView(mode);
	}, []);

	const handleResetConversation = useCallback(() => {
		if (!websocket) return;
		sendWebSocketMessage(websocket, 'clear_conversation');
		setIsResetDialogOpen(false);
	}, [websocket]);

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
			)
		);
	}, [
		activeFilePath,
		generatingFile,
		files,
		streamedBootstrapFiles,
		isBootstrapping,
	]);

	const isPhase1Complete = useMemo(() => {
		return phaseTimeline.length > 0 && phaseTimeline[0].status === 'completed';
	}, [phaseTimeline]);

	const isGitHubExportReady = useMemo(() => {
		return isPhase1Complete && !!urlChatId;
	}, [isPhase1Complete, urlChatId]);

	const showMainView = useMemo(
		() =>
			streamedBootstrapFiles.length > 0 ||
			!!blueprint ||
			files.length > 0,
		[streamedBootstrapFiles, blueprint, files.length],
	);

	const [mainMessage, ...otherMessages] = useMemo(() => messages, [messages]);

	const { scrollToBottom } = useAutoScroll(messagesContainerRef, { behavior: 'smooth', watch: [messages] });

	const prevMessagesLengthRef = useRef(0);

	useEffect(() => {
		// Force scroll when a new message is appended (length increase)
		if (messages.length > prevMessagesLengthRef.current) {
			requestAnimationFrame(() => scrollToBottom());
		}
		prevMessagesLengthRef.current = messages.length;
	}, [messages.length, scrollToBottom]);

	useEffect(() => {
		if (previewUrl && !hasSeenPreview.current && isPhase1Complete) {
			setView('preview');
			setShowTooltip(true);
			setTimeout(() => {
				setShowTooltip(false);
			}, 3000); // Auto-hide tooltip after 3 seconds
		}
	}, [previewUrl, isPhase1Complete]);

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

	useEffect(() => {
		// Only show bootstrap completion message for NEW chats, not when reloading existing ones
		if (doneStreaming && !isGeneratingBlueprint && !blueprint && urlChatId === 'new') {
			onCompleteBootstrap();
			sendAiMessage(
				createAIMessage(
					'creating-blueprint',
					'Bootstrapping complete, now creating a blueprint for you...',
					true,
				),
			);
		}
	}, [
		doneStreaming,
		isGeneratingBlueprint,
		sendAiMessage,
		blueprint,
		onCompleteBootstrap,
		urlChatId,
	]);

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
		const blueprintNotCompleted = !blueprintStage || blueprintStage.status !== 'completed';

		return blueprintNotCompleted || isDebugging;
	}, [projectStages, isDebugging]);

	const chatFormRef = useRef<HTMLFormElement>(null);
	const { isDragging: isChatDragging, dragHandlers: chatDragHandlers } = useDragDrop({
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

			// When generation is active, send as conversational AI suggestion
			websocket?.send(
				JSON.stringify({
					type: 'user_suggestion',
					message: newMessage,
					images: images.length > 0 ? images : undefined,
				}),
			);
			sendUserMessage(newMessage);
			setNewMessage('');
			// Clear images after sending
			if (images.length > 0) {
				clearImages();
			}
			// Ensure we scroll after sending our own message
			requestAnimationFrame(() => scrollToBottom());
		},
		[newMessage, websocket, sendUserMessage, isChatDisabled, scrollToBottom, images, clearImages],
	);

	const [progress, total] = useMemo((): [number, number] => {
		// Calculate phase progress instead of file progress
		const completedPhases = phaseTimeline.filter(p => p.status === 'completed').length;

		// Get predicted phase count from blueprint, fallback to current phase count
		const predictedPhaseCount = blueprint?.implementationRoadmap?.length || 0;
		const totalPhases = Math.max(predictedPhaseCount, phaseTimeline.length, 1);

		return [completedPhases, totalPhases];
	}, [phaseTimeline, blueprint?.implementationRoadmap]);

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

	return (
		<div className="size-full flex flex-col min-h-0 text-text-primary">
			<div className="flex-1 flex min-h-0 overflow-hidden justify-center">
				<motion.div
					layout="position"
					className="flex-1 shrink-0 flex flex-col basis-0 max-w-lg relative z-10 h-full min-h-0"
				>
					<div 
					className={clsx(
						'flex-1 overflow-y-auto min-h-0 chat-messages-scroll',
						isDebugging && 'animate-debug-pulse'
					)} 
					ref={messagesContainerRef}
				>
						<div className="pt-5 px-4 pb-4 text-sm flex flex-col gap-5">
							{appLoading ? (
								<div className="flex items-center gap-2 text-text-tertiary">
									<LoaderCircle className="size-4 animate-spin" />
									Loading app...
								</div>
							) : (
								<>
									{(appTitle || chatId) && (
								<div className="flex items-center justify-between mb-2">
									<div className="text-lg font-semibold">{appTitle}</div>
								</div>
							)}
									<UserMessage
										message={query ?? displayQuery}
									/>
									{import.meta.env
										.VITE_AGENT_MODE_ENABLED && (
										<div className="flex justify-between items-center py-2 border-b border-border-primary/50 mb-4">
											<AgentModeDisplay
												mode={
													agentMode as
														| 'deterministic'
														| 'smart'
												}
											/>
										</div>
									)}
								</>
							)}

							{mainMessage && (
							<div className="relative">
								<AIMessage
									message={mainMessage.content}
									isThinking={mainMessage.ui?.isThinking}
									toolEvents={mainMessage.ui?.toolEvents}
								/>
								{chatId && (
									<div className="absolute right-1 top-1">
										<DropdownMenu>
											<DropdownMenuTrigger asChild>
												<Button
													variant="ghost"
													size="icon"
													className="hover:bg-bg-3/80 cursor-pointer"
												>
													<MoreHorizontal className="h-4 w-4" />
													<span className="sr-only">Chat actions</span>
												</Button>
											</DropdownMenuTrigger>
											<DropdownMenuContent align="end" className="w-56">
												<DropdownMenuItem
														onClick={(e) => {
															e.preventDefault();
															setIsResetDialogOpen(true);
														}}
												>
													<RotateCcw className="h-4 w-4 mr-2" />
													Reset conversation
												</DropdownMenuItem>
											</DropdownMenuContent>
										</DropdownMenu>
									</div>
								)}
							</div>
						)}

							{otherMessages
								.filter(message => message.role === 'assistant' && message.ui?.isThinking)
								.map((message) => (
									<div key={message.conversationId} className="mb-4">
										<AIMessage
											message={message.content}
											isThinking={true}
											toolEvents={message.ui?.toolEvents}
										/>
									</div>
								))}

							{isThinking && !otherMessages.some(m => m.ui?.isThinking) && (
								<div className="mb-4">
									<AIMessage
										message="Planning next phase..."
										isThinking={true}
									/>
								</div>
							)}

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
								handleDeployToCloudflare={handleDeployToCloudflare}
								runtimeErrorCount={runtimeErrorCount}
								staticIssueCount={staticIssueCount}
								isDebugging={isDebugging}
								isGenerating={isGenerating}
								isThinking={isThinking}
							/>

							{/* Deployment and Generation Controls */}
							{chatId && (
								<motion.div
									ref={deploymentControlsRef}
									initial={{ opacity: 0, y: 20 }}
									animate={{ opacity: 1, y: 0 }}
									transition={{ duration: 0.3, delay: 0.2 }}
									className="px-4 mb-6"
								>
									<DeploymentControls
										isPhase1Complete={isPhase1Complete}
										isDeploying={isDeploying}
										deploymentUrl={cloudflareDeploymentUrl}
										instanceId={chatId || ''}
										isRedeployReady={isRedeployReady}
										deploymentError={deploymentError}
										appId={app?.id || chatId}
										appVisibility={app?.visibility}
										isGenerating={
											isGenerating ||
											isGeneratingBlueprint
										}
										isPaused={isGenerationPaused}
										onDeploy={handleDeployToCloudflare}
										onStopGeneration={handleStopGeneration}
										onResumeGeneration={
											handleResumeGeneration
										}
										onVisibilityUpdate={(newVisibility) => {
											// Update app state if needed
											if (app) {
												app.visibility = newVisibility;
											}
										}}
									/>
								</motion.div>
							)}

							{otherMessages
								.filter(message => !message.ui?.isThinking)
								.map((message) => {
									if (message.role === 'assistant') {
										return (
											<AIMessage
												key={message.conversationId}
												message={message.content}
												isThinking={message.ui?.isThinking}
												toolEvents={message.ui?.toolEvents}
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

					<form
                        ref={chatFormRef}
                        onSubmit={onNewMessage}
                        className="shrink-0 p-4 pb-5 bg-transparent"
                        {...chatDragHandlers}
                    >
					<input
						ref={imageInputRef}
						type="file"
						accept={SUPPORTED_IMAGE_MIME_TYPES.join(',')}
						multiple
						onChange={(e) => {
							const files = Array.from(e.target.files || []);
							if (files.length > 0) {
								addImages(files);
							}
							e.target.value = '';
						}}
						className="hidden"
						disabled={isChatDisabled}
					/>
					<div className="relative">
						{isChatDragging && (
							<div className="absolute inset-0 flex items-center justify-center bg-accent/10 backdrop-blur-sm rounded-xl z-50 pointer-events-none">
								<p className="text-accent font-medium">Drop images here</p>
							</div>
						)}
						{images.length > 0 && (
							<div className="mb-2">
								<ImageAttachmentPreview
									images={images}
									onRemove={removeImage}
									compact
								/>
							</div>
						)}
						<textarea
							value={newMessage}
							onChange={(e) => {
								const newValue = e.target.value;
								const newWordCount = countWords(newValue);
								
								// Only update if within word limit
								if (newWordCount <= MAX_WORDS) {
									setNewMessage(newValue);
									const ta = e.currentTarget;
									ta.style.height = 'auto';
									ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
								}
							}}
								onKeyDown={(e) => {
									if (e.key === 'Enter') {
										if (!e.shiftKey) {
											// Submit on Enter without Shift
											e.preventDefault();
											onNewMessage(e);
										}
										// Shift+Enter will create a new line (default textarea behavior)
									}
								}}
								disabled={isChatDisabled}
								placeholder={
									isDebugging
										? 'Deep debugging in progress... Please abort to continue'
										: isChatDisabled
											? 'Please wait for blueprint completion...'
											: isRunning
												? 'Chat with AI while generating...'
												: 'Chat with AI...'
								}
								rows={1}
								className="w-full bg-bg-2 border border-text-primary/10 rounded-xl px-3 pr-20 py-2 text-sm outline-none focus:border-white/20 drop-shadow-2xl text-text-primary placeholder:!text-text-primary/50 disabled:opacity-50 disabled:cursor-not-allowed resize-none overflow-y-auto no-scrollbar min-h-[36px] max-h-[120px]"
								style={{
									// Auto-resize based on content
									height: 'auto',
									minHeight: '36px'
								}}
								ref={(textarea) => {
									if (textarea) {
										// Auto-resize textarea based on content
										textarea.style.height = 'auto';
										textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
									}
								}}
							/>
							<div className="absolute right-1.5 bottom-2.5 flex items-center gap-1">
								{(isGenerating || isGeneratingBlueprint || isDebugging) && (
									<button
										type="button"
										onClick={() => {
											if (websocket) {
												sendWebSocketMessage(websocket, 'stop_generation');
											}
										}}
										className="p-1.5 rounded-md hover:bg-red-500/10 text-text-tertiary hover:text-red-500 transition-all duration-200 group relative"
										aria-label="Stop generation"
										title="Stop generation"
									>
										<X className="size-4" strokeWidth={2} />
										<span className="absolute -top-8 right-0 px-2 py-1 bg-bg-1 border border-border-primary rounded text-xs text-text-secondary whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
											Stop
										</span>
									</button>
								)}
								<button
									type="button"
									onClick={() => imageInputRef.current?.click()}
									disabled={isChatDisabled || isProcessing}
									className="p-1.5 rounded-md hover:bg-bg-3 text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
									aria-label="Upload image"
									title="Upload image"
								>
									<ImageIcon className="size-4" strokeWidth={1.5} />
								</button>
								<button
									type="submit"
									disabled={!newMessage.trim() || isChatDisabled}
									className="p-1.5 rounded-md bg-accent/90 hover:bg-accent/80 disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-transparent text-white disabled:text-text-primary transition-colors"
								>
									<ArrowRight className="size-4" />
								</button>
							</div>
						</div>
					</form>
				</motion.div>

				<AnimatePresence>
					{showMainView && (
					<motion.div
						layout="position"
						className="flex-1 flex shrink-0 basis-0 p-4 pl-0 ml-2 z-30 min-h-0"
						initial={{ opacity: 0, scale: 0.84 }}
						animate={{ opacity: 1, scale: 1 }}
						transition={{ duration: 0.3, ease: 'easeInOut' }}
					>
							{view === 'preview' && previewUrl && (
								<div className="flex-1 flex flex-col bg-bg-3 rounded-xl shadow-md shadow-bg-2 overflow-hidden border border-border-primary">
									<div className="grid grid-cols-3 px-2 h-10 border-b bg-bg-2">
										<div className="flex items-center">
											<ViewModeSwitch
												view={view}
												onChange={handleViewModeChange}
												previewAvailable={!!previewUrl}
												showTooltip={showTooltip}
											/>
										</div>

										<div className="flex items-center justify-center">
											<div className="flex items-center gap-2">
												<span className="text-sm font-mono text-text-50/70">
													{blueprint?.title ??
														'Preview'}
												</span>
												<Copy text={previewUrl} />
												<button
													className="p-1 hover:bg-bg-2 rounded transition-colors"
													onClick={() => {
														setManualRefreshTrigger(
															Date.now(),
														);
													}}
													title="Refresh preview"
												>
													<RefreshCw className="size-4 text-text-primary/50" />
												</button>
											</div>
										</div>

										<div className="flex items-center justify-end gap-1.5">
											{/* <button
												className="flex items-center gap-1.5 px-2 py-1 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white rounded-md transition-all duration-200 text-xs font-medium shadow-sm"
												onClick={() => handleDeployToCloudflare(chatId!)}
												disabled={isDeploying}
												title="Save & Deploy"
											>
												{isDeploying ? (
													<LoaderCircle className="size-3 animate-spin" />
												) : (
													<Save className="size-3" />
												)}
												{isDeploying ? 'Deploying...' : 'Save'}
											</button> */}
											<ModelConfigInfo
												configs={modelConfigs}
												onRequestConfigs={handleRequestConfigs}
												loading={loadingConfigs}
											/>
											<button
												className="group relative flex items-center gap-1.5 p-1.5 group-hover:pl-2 group-hover:pr-2.5 rounded-full group-hover:rounded-md transition-all duration-300 ease-in-out hover:bg-bg-4 border border-transparent hover:border-border-primary hover:shadow-sm overflow-hidden"
												onClick={() => setIsGitCloneModalOpen(true)}
												title="Clone Repository"
											>
												<GitBranch className="size-3.5 text-brand-primary transition-colors duration-300 flex-shrink-0" />
												<span className="max-w-0 group-hover:max-w-[70px] opacity-0 group-hover:opacity-100 overflow-hidden transition-all duration-300 ease-in-out whitespace-nowrap text-xs font-medium text-text-primary">
													Git Clone
												</span>
											</button>
											<button
												className={`flex items-center gap-1.5 px-2 py-1 rounded-md transition-all duration-200 text-xs font-medium shadow-sm ${
													isGitHubExportReady
														? 'bg-gray-800 hover:bg-gray-900 text-white'
														: 'bg-gray-600 text-gray-400 cursor-not-allowed'
												}`}
												onClick={isGitHubExportReady ? githubExport.openModal : undefined}
												disabled={!isGitHubExportReady}
												title={
													isGitHubExportReady
														? "Export to GitHub"
														: !isPhase1Complete
															? "Complete Phase 1 to enable GitHub export"
															: "Waiting for chat session to initialize..."
												}
												aria-label={
													isGitHubExportReady
														? "Export to GitHub"
														: !isPhase1Complete
															? "GitHub export disabled - complete Phase 1 first"
															: "GitHub export disabled - waiting for chat session"
												}
											>
												<Github className="size-3.5" />
												GitHub
											</button>
											<button
												className="p-1.5 rounded-full transition-all duration-300 ease-in-out hover:bg-bg-4 border border-transparent hover:border-border-primary hover:shadow-sm"
												onClick={() => {
													previewRef.current?.requestFullscreen();
												}}
												title="Fullscreen"
											>
												<Expand className="size-3.5 text-text-primary/60 hover:text-brand-primary transition-colors duration-300" />
											</button>
										</div>
									</div>
									<PreviewIframe
										src={previewUrl}
										ref={previewRef}
										className="flex-1 w-full h-full border-0"
										title="Preview"
										shouldRefreshPreview={
											shouldRefreshPreview
										}
										manualRefreshTrigger={
											manualRefreshTrigger
										}
										webSocket={websocket}
									/>
								</div>
							)}

							{view === 'blueprint' && (
								<div className="flex-1 flex flex-col bg-bg-3 rounded-xl shadow-md shadow-bg-2 overflow-hidden border border-border-primary">
									{/* Toolbar */}
									<div className="grid grid-cols-3 px-2 h-10 bg-bg-2 border-b">
										<div className="flex items-center">
											<ViewModeSwitch
												view={view}
												onChange={handleViewModeChange}
												previewAvailable={!!previewUrl}
												showTooltip={showTooltip}
											/>
										</div>

										<div className="flex items-center justify-center">
											<div className="flex items-center gap-2">
												<span className="text-sm text-text-50/70 font-mono">
													Blueprint.md
												</span>
												{previewUrl && (
													<Copy text={previewUrl} />
												)}
											</div>
										</div>

										<div className="flex items-center justify-end">
											{/* Right side - can add actions here if needed */}
										</div>
									</div>
									<div className="flex-1 overflow-y-auto bg-bg-3">
										<div className="py-12 mx-auto">
											<Blueprint
												blueprint={
													blueprint ??
													({} as BlueprintType)
												}
												className="w-full max-w-2xl mx-auto"
											/>
										</div>
									</div>
								</div>
							)}


                            {/* Disabled terminal for now */}
							{/* {view === 'terminal' && (
								<div className="flex-1 flex flex-col bg-bg-3 rounded-xl shadow-md shadow-bg-2 overflow-hidden border border-border-primary">
									<div className="grid grid-cols-3 px-2 h-10 bg-bg-2 border-b">
										<div className="flex items-center">
											<ViewModeSwitch
												view={view}
												onChange={handleViewModeChange}
												previewAvailable={!!previewUrl}
												showTooltip={showTooltip}
												terminalAvailable={true}
											/>
										</div>

										<div className="flex items-center justify-center">
											<div className="flex items-center gap-3">
												<span className="text-sm font-mono text-text-50/70">
													Terminal
												</span>
												<div className={clsx(
													'flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium',
													websocket && websocket.readyState === WebSocket.OPEN
														? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
														: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
												)}>
													<div className={clsx(
														'size-1.5 rounded-full',
														websocket && websocket.readyState === WebSocket.OPEN ? 'bg-green-500' : 'bg-red-500'
													)} />
													{websocket && websocket.readyState === WebSocket.OPEN ? 'Connected' : 'Disconnected'}
												</div>
											</div>
										</div>

										<div className="flex items-center justify-end gap-1.5">
											<button
												onClick={() => {
													const logText = terminalLogs
														.map(log => `[${new Date(log.timestamp).toLocaleTimeString()}] ${log.content}`)
														.join('\n');
													navigator.clipboard.writeText(logText);
												}}
												className={clsx(
													"h-7 w-7 p-0 rounded-md transition-all duration-200",
													"text-gray-500 hover:text-gray-700",
													"dark:text-gray-400 dark:hover:text-gray-200",
													"hover:bg-gray-100 dark:hover:bg-gray-700"
												)}
												title="Copy all logs"
											>
												<Copy text="" />
											</button>
											<ModelConfigInfo
												configs={modelConfigs}
												onRequestConfigs={handleRequestConfigs}
												loading={loadingConfigs}
											/>
										</div>
									</div>
									<div className="flex-1">
										<Terminal
											logs={terminalLogs}
											onCommand={handleTerminalCommand}
											isConnected={!!websocket && websocket.readyState === WebSocket.OPEN}
											className="h-full"
										/>
									</div>
								</div>
							)} */}

							{view === 'editor' && (
								<div className="flex-1 flex flex-col bg-bg-3 rounded-xl shadow-md shadow-bg-2 overflow-hidden border border-border-primary">
									{activeFile && (
										<div className="grid grid-cols-3 px-2 h-10 bg-bg-2 border-b">
											<div className="flex items-center">
												<ViewModeSwitch
													view={view}
													onChange={
														handleViewModeChange
													}
													previewAvailable={
														!!previewUrl
													}
													showTooltip={showTooltip}
												/>
											</div>

											<div className="flex items-center justify-center">
												<div className="flex items-center gap-2">
													<span className="text-sm font-mono text-text-50/70">
														{activeFile.filePath}
													</span>
													{previewUrl && (
														<Copy
															text={previewUrl}
														/>
													)}
												</div>
											</div>

											<div className="flex items-center justify-end gap-1.5">
												{/* <button
													className="flex items-center gap-1.5 px-2 py-1 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white rounded-md transition-all duration-200 text-xs font-medium shadow-sm"
													onClick={() => handleDeployToCloudflare(chatId!)}
													disabled={isDeploying}
													title="Save & Deploy"
												>
													{isDeploying ? (
														<LoaderCircle className="size-3 animate-spin" />
													) : (
														<Save className="size-3" />
													)}
													{isDeploying ? 'Deploying...' : 'Save'}
												</button>
												<button
													className={`flex items-center gap-1.5 px-2 py-1 rounded-md transition-all duration-200 text-xs font-medium shadow-sm ${
														isPhase1Complete
															? 'bg-gray-800 hover:bg-gray-900 text-white'
															: 'bg-gray-600 text-gray-400 cursor-not-allowed'
													}`}
													onClick={isPhase1Complete ? githubExport.openModal : undefined}
													disabled={!isPhase1Complete}
													title={isPhase1Complete ? "Export to GitHub" : "Complete Phase 1 to enable GitHub export"}
													aria-label={isPhase1Complete ? "Export to GitHub" : "GitHub export disabled - complete Phase 1 first"}
												>
													<Github className="size-3.5" />
													GitHub
												</button> */}
												<ModelConfigInfo
													configs={modelConfigs}
													onRequestConfigs={handleRequestConfigs}
													loading={loadingConfigs}
												/>
												<button
													className="p-1.5 rounded-full transition-all duration-300 ease-in-out hover:bg-bg-4 border border-transparent hover:border-border-primary hover:shadow-sm"
													onClick={() => {
														editorRef.current?.requestFullscreen();
													}}
													title="Fullscreen"
												>
													<Expand className="size-3.5 text-text-primary/60 hover:text-brand-primary transition-colors duration-300" />
												</button>
											</div>
										</div>
									)}
									<div className="flex-1 relative">
										<div
											className="absolute inset-0 flex"
											ref={editorRef}
										>
											<FileExplorer
												files={files}
												bootstrapFiles={
													streamedBootstrapFiles
												}
												currentFile={activeFile}
												onFileClick={handleFileClick}
											/>
											<div className="flex-1">
												<MonacoEditor
													className="h-full"
													createOptions={{
														value:
															activeFile?.fileContents ||
															'',
														language:
															activeFile?.language ||
															'plaintext',
														readOnly: true,
														minimap: {
															enabled: false,
														},
														lineNumbers: 'on',
														scrollBeyondLastLine: false,
														fontSize: 13,
														theme: 'v1-dev',
														automaticLayout: true,
													}}
													find={
														edit &&
														edit.filePath ===
															activeFile?.filePath
															? edit.search
															: undefined
													}
													replace={
														edit &&
														edit.filePath ===
															activeFile?.filePath
															? edit.replacement
															: undefined
													}
												/>
											</div>
										</div>
									</div>
								</div>
							)}
						</motion.div>
					)}
				</AnimatePresence>
			</div>

			{/* Debug Panel */}
			<DebugPanel
				messages={debugMessages}
				onClear={clearDebugMessages}
				chatSessionId={chatId}
			/>

			<AlertDialog open={isResetDialogOpen} onOpenChange={setIsResetDialogOpen}>
				<AlertDialogContent className="sm:max-w-[425px]">
					<AlertDialogHeader>
						<AlertDialogTitle>Reset conversation?</AlertDialogTitle>
						<AlertDialogDescription>
							This will clear the chat history for this app. Generated files and preview are not affected.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction onClick={handleResetConversation} className="bg-bg-2 hover:bg-bg-2/80 text-text-primary">
							Reset
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			{/* GitHub Export Modal */}
			<GitHubExportModal
				isOpen={githubExport.isModalOpen}
				onClose={githubExport.closeModal}
				onExport={githubExport.startExport}
				isExporting={githubExport.isExporting}
				exportProgress={githubExport.progress}
				exportResult={githubExport.result}
				onRetry={githubExport.retry}
				existingGithubUrl={app?.githubRepositoryUrl || null}
				agentId={urlChatId || undefined}
				appTitle={app?.title}
			/>

			{/* Git Clone Modal */}
			{urlChatId && app && (
				<GitCloneModal
					open={isGitCloneModalOpen}
					onOpenChange={setIsGitCloneModalOpen}
					appId={urlChatId}
					appTitle={app.title || 'app'}
					isPublic={app.visibility === 'public'}
					isOwner={app.user?.id === user?.id}
				/>
			)}
		</div>
	);
}