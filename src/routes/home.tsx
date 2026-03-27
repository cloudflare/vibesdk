import { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import { ArrowUp, Mic, Github, GitFork, ChevronDown, Paperclip, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router';
import { useAuth } from '@/contexts/auth-context';
import { ProjectModeSelector, type ProjectModeOption } from '../components/project-mode-selector';
import { MAX_AGENT_QUERY_LENGTH, SUPPORTED_IMAGE_MIME_TYPES, type ProjectType } from '@/api-types';
import { useFeature } from '@/features';
import { useAuthGuard } from '../hooks/useAuthGuard';
import { usePaginatedApps } from '@/hooks/use-paginated-apps';
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import { AppCard } from '@/components/shared/AppCard';
import clsx from 'clsx';
import { useImageUpload } from '@/hooks/use-image-upload';
import { useDragDrop } from '@/hooks/use-drag-drop';
import { ImageAttachmentPreview } from '@/components/image-attachment-preview';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api-client';
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from '@/components/ui/popover';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const MODEL_OPTIONS = [
	{ id: 'e1', label: 'E-1', sublabel: 'Lite', description: 'Fast, lightweight agent for simple tasks' },
	{ id: 'e1.5', label: 'E-1.5', sublabel: 'Standard', description: 'Balanced performance and quality' },
	{ id: 'e2', label: 'E-2', sublabel: 'Ultra', description: 'Maximum capability for complex projects' },
] as const;

export default function Home() {
	const navigate = useNavigate();
	const { requireAuth } = useAuthGuard();
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [projectMode, setProjectMode] = useState<ProjectType>('app');
	const [query, setQuery] = useState('');
	const [selectedModel, setSelectedModel] = useState('e1.5');
	const [modelOpen, setModelOpen] = useState(false);
	const [githubDialogOpen, setGithubDialogOpen] = useState(false);
	const [githubRepoName, setGithubRepoName] = useState('');
	const [githubRepoDesc, setGithubRepoDesc] = useState('');
	const [githubIsPrivate, setGithubIsPrivate] = useState(false);
	const [forkDialogOpen, setForkDialogOpen] = useState(false);
	const [forkAppId, setForkAppId] = useState('');
	const { user, isAuthenticated } = useAuth();
	const { isLoadingCapabilities, capabilities, getEnabledFeatures } = useFeature();

	const modeOptions = useMemo<ProjectModeOption[]>(() => {
		if (isLoadingCapabilities || !capabilities) return [];
		return getEnabledFeatures().map((def) => ({
			id: def.id,
			label:
				def.id === 'presentation'
					? 'Slides'
					: def.id === 'general'
						? 'General'
						: 'App',
			description: def.description,
		}));
	}, [capabilities, getEnabledFeatures, isLoadingCapabilities]);

	const showModeSelector = modeOptions.length > 1;

	useEffect(() => {
		if (isLoadingCapabilities) return;
		if (modeOptions.length === 0) {
			if (projectMode !== 'app') setProjectMode('app');
			return;
		}
		if (!modeOptions.some((m) => m.id === projectMode)) {
			setProjectMode(modeOptions[0].id);
		}
	}, [isLoadingCapabilities, modeOptions, projectMode]);

	const { images, addImages, removeImage, clearImages, isProcessing } = useImageUpload({
		onError: (error) => {
			console.error('Image upload error:', error);
			toast.error(error);
		},
	});

	const { isDragging, dragHandlers } = useDragDrop({
		onFilesDropped: addImages,
		accept: [...SUPPORTED_IMAGE_MIME_TYPES],
	});

	const {
		apps,
		loading,
	} = usePaginatedApps({
		type: 'public',
		defaultSort: 'popular',
		defaultPeriod: 'week',
		limit: 6,
	});

	const discoverReady = useMemo(() => !loading && (apps?.length ?? 0) > 5, [loading, apps]);

	const handleCreateApp = useCallback((query: string, mode: ProjectType) => {
		if (query.length > MAX_AGENT_QUERY_LENGTH) {
			toast.error(
				`Prompt too large (${query.length} characters). Maximum allowed is ${MAX_AGENT_QUERY_LENGTH} characters.`,
			);
			return;
		}

		const encodedQuery = encodeURIComponent(query);
		const encodedMode = encodeURIComponent(mode);
		const imageParam = images.length > 0 ? `&images=${encodeURIComponent(JSON.stringify(images))}` : '';
		const intendedUrl = `/chat/new?query=${encodedQuery}&projectType=${encodedMode}${imageParam}`;

		if (
			!requireAuth({
				requireFullAuth: true,
				actionContext: 'to create applications',
				intendedUrl: intendedUrl,
			})
		) {
			return;
		}

		navigate(intendedUrl);
		clearImages();
	}, [images, requireAuth, navigate, clearImages]);

	const adjustTextareaHeight = () => {
		if (textareaRef.current) {
			textareaRef.current.style.height = 'auto';
			const scrollHeight = textareaRef.current.scrollHeight;
			textareaRef.current.style.height = Math.min(scrollHeight, 300) + 'px';
		}
	};

	useEffect(() => {
		adjustTextareaHeight();
	}, []);

	const handleFileClick = () => {
		fileInputRef.current?.click();
	};

	const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const files = Array.from(e.target.files || []);
		if (files.length > 0) addImages(files);
		if (fileInputRef.current) fileInputRef.current.value = '';
	};

	const handleVoiceInput = () => {
		toast.info('Voice input coming soon');
	};

	const handleGitHubSave = useCallback(() => {
		if (!requireAuth({ requireFullAuth: true, actionContext: 'to save to GitHub' })) return;
		setGithubDialogOpen(true);
	}, [requireAuth]);

	const handleGitHubExport = useCallback(async () => {
		if (!githubRepoName.trim()) {
			toast.error('Repository name is required');
			return;
		}
		try {
			apiClient.initiateGitHubOAuth();
		} catch (err) {
			toast.error('Failed to connect to GitHub. Please try again.');
		}
		setGithubDialogOpen(false);
	}, [githubRepoName]);

	const handleForkClick = useCallback(() => {
		if (!requireAuth({ requireFullAuth: true, actionContext: 'to fork a project' })) return;
		setForkDialogOpen(true);
	}, [requireAuth]);

	const handleForkApp = useCallback(async () => {
		if (!forkAppId.trim()) {
			toast.error('App ID is required');
			return;
		}
		try {
			const response = await apiClient.forkApp(forkAppId);
			if (response.success && response.data) {
				toast.success('App forked successfully!');
				navigate(`/chat/${response.data.forkedAppId}`);
			} else {
				toast.error('Failed to fork app');
			}
		} catch (err) {
			toast.error('Failed to fork app. Make sure the App ID is valid.');
		}
		setForkDialogOpen(false);
		setForkAppId('');
	}, [forkAppId, navigate]);

	const currentModel = MODEL_OPTIONS.find(m => m.id === selectedModel) || MODEL_OPTIONS[1];

	return (
		<div className="relative flex flex-col items-center size-full" data-testid="home-page">
			<LayoutGroup>
				<div className="rounded-md w-full max-w-2xl overflow-hidden">
					<motion.div
						layout
						transition={{ layout: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } }}
						className={clsx(
							"px-6 p-8 flex flex-col items-center z-10",
							discoverReady ? "mt-48" : "mt-[20vh] sm:mt-[24vh] md:mt-[28vh]"
						)}>
						<h1 className="text-accent font-medium leading-[1.1] tracking-tight text-4xl sm:text-5xl w-full mb-6 bg-clip-text bg-gradient-to-r from-text-primary to-text-primary/90" data-testid="home-heading">
							What should we build today?
						</h1>

						<form
							method="POST"
							onSubmit={(e) => {
								e.preventDefault();
								const q = textareaRef.current!.value;
								handleCreateApp(q, projectMode);
							}}
							className="flex z-10 flex-col w-full bg-bg-4 dark:bg-bg-2 rounded-2xl border border-border-primary dark:border-border-secondary shadow-textarea transition-all duration-200 focus-within:border-accent/40 dark:focus-within:border-accent/50"
							data-testid="prompt-form"
						>
							<div
								className={clsx(
									"flex-1 flex flex-col relative px-5 pt-5 pb-3",
									isDragging && "ring-2 ring-accent ring-offset-2 rounded-t-2xl"
								)}
								{...dragHandlers}
							>
								{isDragging && (
									<div className="absolute inset-0 flex items-center justify-center bg-accent/10 backdrop-blur-sm rounded-t-2xl z-30 pointer-events-none">
										<p className="text-accent font-medium">Drop files here</p>
									</div>
								)}
								<textarea
									className="w-full min-h-[80px] resize-none ring-0 z-20 outline-0 bg-transparent placeholder:text-text-tertiary text-text-primary text-base"
									name="query"
									value={query}
									placeholder="Message Agent..."
									ref={textareaRef}
									onChange={(e) => {
										setQuery(e.target.value);
										adjustTextareaHeight();
									}}
									onInput={adjustTextareaHeight}
									onKeyDown={(e) => {
										if (e.key === 'Enter' && !e.shiftKey) {
											e.preventDefault();
											const q = textareaRef.current!.value;
											handleCreateApp(q, projectMode);
										}
									}}
									data-testid="prompt-textarea"
								/>
								{images.length > 0 && (
									<div className="mt-2">
										<ImageAttachmentPreview images={images} onRemove={removeImage} />
									</div>
								)}
							</div>

							{/* Toolbar */}
							<div className="flex items-center justify-between px-3 pb-3 pt-1">
								<div className="flex items-center gap-1.5">
									{/* Attachment */}
									<input
										ref={fileInputRef}
										type="file"
										accept={SUPPORTED_IMAGE_MIME_TYPES.join(',')}
										multiple
										onChange={handleFileChange}
										className="hidden"
										disabled={isProcessing}
									/>
									<button
										type="button"
										onClick={handleFileClick}
										disabled={isProcessing}
										className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-bg-3 dark:bg-bg-3 hover:bg-bg-1 dark:hover:bg-bg-4 text-text-secondary hover:text-text-primary transition-all duration-150 text-sm"
										title="Attach files"
										data-testid="attach-btn"
									>
										<Paperclip className="size-3.5" />
									</button>

									{/* GitHub Save */}
									<button
										type="button"
										onClick={handleGitHubSave}
										className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-bg-3 dark:bg-bg-3 hover:bg-bg-1 dark:hover:bg-bg-4 text-text-secondary hover:text-text-primary transition-all duration-150 text-sm"
										data-testid="save-github-btn"
									>
										<Github className="size-3.5" />
										<span className="hidden sm:inline">Save</span>
										<span className="relative flex h-2 w-2">
											<span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60"></span>
											<span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
										</span>
									</button>

									{/* Fork */}
									<button
										type="button"
										onClick={handleForkClick}
										className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-bg-3 dark:bg-bg-3 hover:bg-bg-1 dark:hover:bg-bg-4 text-text-secondary hover:text-text-primary transition-all duration-150 text-sm"
										data-testid="fork-btn"
									>
										<GitFork className="size-3.5" />
										<span className="hidden sm:inline">Fork</span>
									</button>

									{/* Model Selector */}
									<Popover open={modelOpen} onOpenChange={setModelOpen}>
										<PopoverTrigger asChild>
											<button
												type="button"
												className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-bg-3 dark:bg-bg-3 hover:bg-bg-1 dark:hover:bg-bg-4 text-text-secondary hover:text-text-primary transition-all duration-150 text-sm"
												data-testid="model-selector-btn"
											>
												<Sparkles className="size-3.5" />
												<span className="hidden sm:inline">{currentModel.sublabel}</span>
												<ChevronDown className="size-3" />
											</button>
										</PopoverTrigger>
										<PopoverContent className="w-64 p-1" align="start">
											{MODEL_OPTIONS.map((model) => (
												<button
													key={model.id}
													type="button"
													onClick={() => {
														setSelectedModel(model.id);
														setModelOpen(false);
													}}
													className={clsx(
														"w-full flex items-start gap-3 px-3 py-2.5 rounded-lg text-left transition-colors",
														selectedModel === model.id
															? "bg-accent/10 text-text-primary"
															: "hover:bg-bg-3 text-text-secondary"
													)}
													data-testid={`model-option-${model.id}`}
												>
													<div className="flex-1 min-w-0">
														<div className="flex items-center gap-2">
															<span className="font-medium text-sm">{model.label}</span>
															<span className="text-xs text-text-tertiary">{model.sublabel}</span>
														</div>
														<p className="text-xs text-text-tertiary mt-0.5">{model.description}</p>
													</div>
													{selectedModel === model.id && (
														<div className="w-1.5 h-1.5 rounded-full bg-accent mt-2 shrink-0" />
													)}
												</button>
											))}
										</PopoverContent>
									</Popover>

									{showModeSelector && (
										<div className="hidden sm:flex ml-1">
											<ProjectModeSelector
												value={projectMode}
												onChange={setProjectMode}
												modes={modeOptions}
											/>
										</div>
									)}
								</div>

								<div className="flex items-center gap-1.5">
									{/* Voice */}
									<button
										type="button"
										onClick={handleVoiceInput}
										className="flex items-center justify-center w-8 h-8 rounded-lg bg-bg-3 dark:bg-bg-3 hover:bg-bg-1 dark:hover:bg-bg-4 text-text-secondary hover:text-text-primary transition-all duration-150"
										title="Voice input"
										data-testid="voice-btn"
									>
										<Mic className="size-4" />
									</button>

									{/* Send */}
									<button
										type="submit"
										disabled={!query.trim()}
										className="flex items-center justify-center w-8 h-8 rounded-lg bg-accent text-white transition-all duration-200 hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed"
										data-testid="send-btn"
									>
										<ArrowUp className="size-4" strokeWidth={2.5} />
									</button>
								</div>
							</div>
						</form>
					</motion.div>
				</div>

				<AnimatePresence>
					{images.length > 0 && (
						<motion.div
							initial={{ opacity: 0, y: -10 }}
							animate={{ opacity: 1, y: 0 }}
							exit={{ opacity: 0, y: -10 }}
							className="w-full max-w-2xl px-6 mt-3"
						>
							<div className="flex items-start gap-2 px-4 py-3 rounded-xl bg-bg-4/50 dark:bg-bg-2/50 border border-accent/20 dark:border-accent/30 shadow-sm">
								<p className="text-xs text-text-tertiary leading-relaxed">
									<span className="font-medium text-text-secondary">Attachments:</span> Files guide app layout and design but may not be replicated exactly.
								</p>
							</div>
						</motion.div>
					)}
				</AnimatePresence>

				<AnimatePresence>
					{discoverReady && (
						<motion.section
							key="discover-section"
							layout
							initial={{ opacity: 0, height: 0 }}
							animate={{ opacity: 1, height: "auto" }}
							exit={{ opacity: 0, height: 0 }}
							transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
							className={clsx('max-w-6xl mx-auto px-4 z-10', images.length > 0 ? 'mt-10' : 'mt-16 mb-8')}
						>
							<div className='flex flex-col items-start'>
								<h2 className="text-lg font-medium text-text-secondary/80">Discover Apps built by the community</h2>
								<div className="text-md font-light mb-4 text-text-tertiary hover:underline underline-offset-4 select-text cursor-pointer" onClick={() => navigate('/discover')}>View All</div>
								<motion.div
									layout
									transition={{ duration: 0.4 }}
									className="grid grid-cols-2 xl:grid-cols-3 gap-6"
								>
									<AnimatePresence mode="popLayout">
										{apps.map(app => (
											<AppCard
												key={app.id}
												app={app}
												onClick={() => navigate(`/app/${app.id}`)}
												showStats={true}
												showUser={true}
												showActions={false}
											/>
										))}
									</AnimatePresence>
								</motion.div>
							</div>
						</motion.section>
					)}
				</AnimatePresence>
			</LayoutGroup>

			{/* GitHub Save Dialog */}
			<Dialog open={githubDialogOpen} onOpenChange={setGithubDialogOpen}>
				<DialogContent className="sm:max-w-md" data-testid="github-dialog">
					<DialogHeader>
						<DialogTitle className="flex items-center gap-2">
							<Github className="size-5" />
							Save to GitHub
						</DialogTitle>
						<DialogDescription>
							Connect your GitHub account to save and sync your project.
						</DialogDescription>
					</DialogHeader>
					<div className="grid gap-4 py-4">
						<div className="grid gap-2">
							<Label htmlFor="repo-name">Repository Name</Label>
							<Input
								id="repo-name"
								placeholder="my-vibesdk-project"
								value={githubRepoName}
								onChange={(e) => setGithubRepoName(e.target.value)}
								data-testid="github-repo-name-input"
							/>
						</div>
						<div className="grid gap-2">
							<Label htmlFor="repo-desc">Description (optional)</Label>
							<Input
								id="repo-desc"
								placeholder="Built with VibeSDK"
								value={githubRepoDesc}
								onChange={(e) => setGithubRepoDesc(e.target.value)}
								data-testid="github-repo-desc-input"
							/>
						</div>
						<div className="flex items-center gap-2">
							<input
								type="checkbox"
								id="private-repo"
								checked={githubIsPrivate}
								onChange={(e) => setGithubIsPrivate(e.target.checked)}
								className="rounded border-border-primary"
								data-testid="github-private-checkbox"
							/>
							<Label htmlFor="private-repo" className="text-sm font-normal">
								Make repository private
							</Label>
						</div>
					</div>
					<DialogFooter>
						<Button variant="outline" onClick={() => setGithubDialogOpen(false)}>Cancel</Button>
						<Button onClick={handleGitHubExport} disabled={!githubRepoName.trim()} data-testid="github-connect-btn">
							<Github className="size-4 mr-2" />
							Connect GitHub
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Fork Dialog */}
			<Dialog open={forkDialogOpen} onOpenChange={setForkDialogOpen}>
				<DialogContent className="sm:max-w-md" data-testid="fork-dialog">
					<DialogHeader>
						<DialogTitle className="flex items-center gap-2">
							<GitFork className="size-5" />
							Fork a Project
						</DialogTitle>
						<DialogDescription>
							Enter the App ID of a public project to fork it into your workspace.
						</DialogDescription>
					</DialogHeader>
					<div className="grid gap-4 py-4">
						<div className="grid gap-2">
							<Label htmlFor="fork-id">App ID</Label>
							<Input
								id="fork-id"
								placeholder="Enter app ID to fork..."
								value={forkAppId}
								onChange={(e) => setForkAppId(e.target.value)}
								data-testid="fork-app-id-input"
							/>
						</div>
					</div>
					<DialogFooter>
						<Button variant="outline" onClick={() => setForkDialogOpen(false)}>Cancel</Button>
						<Button onClick={handleForkApp} disabled={!forkAppId.trim()} data-testid="fork-submit-btn">
							<GitFork className="size-4 mr-2" />
							Fork Project
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
