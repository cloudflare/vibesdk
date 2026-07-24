import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router';
import type { AppDetailsData, FileType } from '@/api-types';
import { apiClient, ApiError } from '@/lib/api-client';
import { appEvents } from '@/lib/app-events';
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard';
import {
	Eye,
	Code2,
	ChevronLeft,
	ExternalLink,
	Copy,
	Check,
	Loader2,
	MessageSquare,
	Play,
} from 'lucide-react';
import {
	Code,
	Star,
	BookmarkSimple,
	GitBranch,
	GithubLogo,
	Lock,
	LockOpen,
	Globe,
	Trash,
	DotsThree,
	CopyIcon,
} from '@phosphor-icons/react';
import {
	Badge,
	Button,
	DropdownMenu,
	LayerCard,
	Tabs,
	useKumoToastManager,
} from '@cloudflare/kumo';
import { MonacoEditor } from '@/components/monaco-editor/lazy-monaco-editor';
import { getFileType } from '@/utils/string';
import { useAuth } from '@/contexts/auth-context';
import { toggleFavorite } from '@/hooks/use-apps';
import { capitalizeFirstLetter, getPreviewUrl } from '@/lib/utils';
import { ConfirmDeleteDialog } from '@/components/shared/ConfirmDeleteDialog';
import { FloatingBackgroundIcons } from '@/components/shared/FloatingBackgroundIcons';
import { GitCloneModal } from '@/components/shared/GitCloneModal';
import {
	GitCloneCommand,
	GitClonePrivatePrompt,
} from '@/components/shared/GitCloneInline';
import { useAuthGuard } from '@/hooks/useAuthGuard';
import { PreviewIframe } from '../chat/components/preview-iframe';
import { FileExplorer } from '../chat/components/file-explorer';
import { useAppsData } from '@/contexts/apps-data-context';

// Use proper types from API types
type AppDetails = AppDetailsData;

// Define supported actions for OAuth redirect
type PendingAction = 'favorite' | 'bookmark' | 'star' | 'fork' | 'remix';

// Supported actions constant for validation
const SUPPORTED_ACTIONS: PendingAction[] = [
	'favorite',
	'bookmark',
	'star',
	'fork',
	'remix',
];

// Action configuration type for reusability
interface ActionConfig {
	action: PendingAction;
	context: string;
	handler: () => Promise<void>;
	errorMessage: string;
}

// Action mapping for aliases (bookmark -> favorite, remix -> fork)
const ACTION_MAP: Record<PendingAction, string> = {
	favorite: 'favorite',
	bookmark: 'favorite',
	star: 'star',
	fork: 'fork',
	remix: 'fork',
};
export default function AppView() {
	const { id } = useParams();
	const navigate = useNavigate();
	const [searchParams, setSearchParams] = useSearchParams();
	const { user } = useAuth();
	const { requireAuth } = useAuthGuard();
	const [app, setApp] = useState<AppDetails | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [isFavorited, setIsFavorited] = useState(false);
	const [isStarred, setIsStarred] = useState(false);
	const { copied: urlCopied, copy: copyUrl } = useCopyToClipboard();
	const { copy: copyFile } = useCopyToClipboard({
		successMessage: 'Code copied to clipboard',
	});
	const { copy: copyPrompt } = useCopyToClipboard({
		successMessage: 'Prompt copied to clipboard',
	});
	const [activeTab, setActiveTab] = useState('preview');
	const [isDeploying, setIsDeploying] = useState(false);
	const [deploymentProgress, setDeploymentProgress] = useState<string>('');
	const [isUpdatingVisibility, setIsUpdatingVisibility] = useState(false);
	const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
	const [isDeleting, setIsDeleting] = useState(false);
	const [isGitCloneModalOpen, setIsGitCloneModalOpen] = useState(false);
	const [activeFilePath, setActiveFilePath] = useState<string>();
	// For a PRIVATE deployed app, the owner needs a deployment-scoped token to
	// open the preview subdomain (main-domain session cookies aren't sent there).
	const [ownerPreviewUrl, setOwnerPreviewUrl] = useState<string | null>(null);
	const previewIframeRef = useRef<HTMLIFrameElement>(null);

	const fetchAppDetails = useCallback(async () => {
		if (!id) return;

		try {
			setLoading(true);
			setError(null);

			// Fetch app details using API client
			const appResponse = await apiClient.getAppDetails(id);

			if (appResponse.success && appResponse.data) {
				const appData = appResponse.data;
				setApp(appData);
				setIsFavorited(appData.userFavorited || false);
				setIsStarred(appData.userStarred || false);
			} else {
				throw new Error(
					appResponse.error?.message || 'Failed to fetch app details',
				);
			}
		} catch (err) {
			console.error('Error fetching app:', err);
			if (err instanceof ApiError) {
				if (err.status === 404) {
					setError('App not found');
				} else {
					setError(`Failed to load app: ${err.message}`);
				}
			} else {
				setError(
					err instanceof Error ? err.message : 'Failed to load app',
				);
			}
		} finally {
			setLoading(false);
		}
	}, [id]);

	useEffect(() => {
		fetchAppDetails();
	}, [id, fetchAppDetails]);

	// Mint an owner-preview token when the owner views their own PRIVATE deployed
	// app, so the preview iframe / open-in-new-tab can reach the gated subdomain.
	useEffect(() => {
		let cancelled = false;
		const needsToken =
			!!app &&
			!!user &&
			app.userId === user.id &&
			app.visibility === 'private' &&
			!!app.deploymentId;

		if (!needsToken) {
			setOwnerPreviewUrl(null);
			return;
		}

		(async () => {
			try {
				const response = await apiClient.generatePreviewToken(app!.id);
				if (!cancelled && response.success && response.data) {
					setOwnerPreviewUrl(response.data.previewUrl);
				}
			} catch (err) {
				console.error('Failed to generate owner preview token:', err);
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [app, user]);

	// Convert agent files to chat FileType format
	const files = useMemo<FileType[]>(() => {
		if (!app?.agentSummary?.generatedCode) return [];
		return app.agentSummary.generatedCode
			.filter(
				(file) =>
					file && file.filePath && typeof file.filePath === 'string',
			)
			.map((file) => ({
				filePath: file.filePath,
				fileContents: file.fileContents || '',
				explanation:
					file.filePurpose === 'Generated by think'
						? undefined
						: file.filePurpose,
				language: getFileType(file.filePath),
				isGenerating: false,
				needsFixing: false,
				hasErrors: false,
			}));
	}, [app?.agentSummary?.generatedCode]);

	// Get active file
	const activeFile = useMemo(() => {
		return files.find((file) => file.filePath === activeFilePath);
	}, [files, activeFilePath]);

	// Auto-select first file; recover if selected path vanished from the list
	useEffect(() => {
		if (files.length === 0) return;
		const stillThere = files.some(
			(file) => file.filePath === activeFilePath,
		);
		if (!activeFilePath || !stillThere) {
			setActiveFilePath(files[0].filePath);
		}
	}, [files, activeFilePath]);

	// File click handler
	const handleFileClick = useCallback((file: FileType) => {
		setActiveFilePath(file.filePath);
	}, []);

	const toast = useKumoToastManager();

	// Action configuration for reusability
	const actionConfigs: Record<string, ActionConfig> = useMemo(
		() => ({
			favorite: {
				action: 'favorite',
				context: 'to bookmark apps',
				handler: async () => {
					if (!app) return;
					const newState = await toggleFavorite(app.id);
					setIsFavorited(newState);
					toast.add({
						title: newState
							? 'Added to bookmarks'
							: 'Removed from bookmarks',
						variant: 'success',
					});
				},
				errorMessage: 'Failed to update bookmarks',
			},
			star: {
				action: 'star',
				context: 'to star apps',
				handler: async () => {
					if (!app) return;
					const response = await apiClient.toggleAppStar(app.id);

					if (response.success && response.data) {
						setIsStarred(response.data.isStarred);
						setApp((prev) =>
							prev
								? {
										...prev,
										starCount:
											response.data?.starCount || 0,
									}
								: null,
						);
						toast.add({
							title: response.data.isStarred
								? 'Starred!'
								: 'Unstarred',
							variant: 'success',
						});
					} else {
						throw new Error(
							response.error?.message || 'Failed to star app',
						);
					}
				},
				errorMessage: 'Failed to update star',
			},
			// fork: {
			// 	action: 'fork',
			// 	context: 'to remix this app',
			// 	handler: async () => {
			// 		if (!app) return;
			// 		const response = await apiClient.forkApp(app.id);

			// 		if (response.success && response.data) {
			// 			toast.add({
			// 				title:
			// 					response.data.message ||
			// 					'App remixed successfully!',
			// 				variant: 'success',
			// 			});

			// 			// Emit app-created event for sidebar updates
			// 			appEvents.emitAppCreated(response.data.forkedAppId, {
			// 				title: `${app.title} (Remix)`,
			// 				description: app.description || undefined,
			// 				isForked: true,
			// 			});

			// 			navigate(`/chat/${response.data.forkedAppId}`);
			// 		} else {
			// 			throw new Error(
			// 				response.error?.message || 'Failed to remix app',
			// 			);
			// 		}
			// 	},
			// 	errorMessage: 'Failed to remix app',
			// },
		}),
		[app, toast],
	);

	// Reusable authenticated action handler
	const createAuthenticatedHandler = useCallback(
		(configKey: string) => {
			return async () => {
				if (!app) return;

				const config = actionConfigs[configKey];
				if (!config) return;

				const currentUrl = `/app/${app.id}?action=${config.action}`;

				// Use auth guard with action parameter in intended URL
				if (
					!requireAuth({
						requireFullAuth: true,
						actionContext: config.context,
						intendedUrl: currentUrl,
					})
				) {
					return;
				}

				// User is authenticated, execute immediately
				try {
					await config.handler();
				} catch (error) {
					console.error(`${config.action} error:`, error);
					toast.add({
						title:
							error instanceof ApiError
								? error.message
								: config.errorMessage,
						variant: 'error',
					});
				}
			};
		},
		[actionConfigs, app, requireAuth, toast],
	);

	const { refetchAll } = useAppsData();

	// Create action handlers using the reusable pattern
	const handleFavorite = useMemo(
		() => createAuthenticatedHandler('favorite'),
		[createAuthenticatedHandler],
	);

	const handleStar = useMemo(
		() => createAuthenticatedHandler('star'),
		[createAuthenticatedHandler],
	);
	// const handleFork = useMemo(
	// 	() => createAuthenticatedHandler('fork'),
	// 	[createAuthenticatedHandler],
	// );

	// Handle pending actions after OAuth redirect
	const executePendingAction = useCallback(
		async (action: PendingAction) => {
			if (!app) return;

			const configKey = ACTION_MAP[action];
			if (!configKey) {
				console.warn('Unknown pending action:', action);
				return;
			}

			const config = actionConfigs[configKey];
			if (!config) {
				console.warn('No config found for action:', action);
				return;
			}

			try {
				await config.handler();
			} catch (error) {
				console.error(
					'Failed to execute pending action:',
					action,
					error,
				);
				toast.add({
					title:
						error instanceof ApiError
							? error.message
							: config.errorMessage,
					variant: 'error',
				});
			}
		},
		[actionConfigs, app, toast],
	);

	// Effect to handle pending actions after OAuth redirect
	useEffect(() => {
		if (!user || !app || loading) return;

		const actionParam = searchParams.get('action');
		if (!actionParam) return;

		// Validate action parameter against our supported types
		const action = SUPPORTED_ACTIONS.find((a) => a === actionParam);

		if (!action) {
			console.warn('Unsupported action parameter:', actionParam);
			return;
		}

		// Clear the action parameter from URL first
		const newSearchParams = new URLSearchParams(searchParams);
		newSearchParams.delete('action');
		setSearchParams(newSearchParams, { replace: true });

		// Execute the pending action
		executePendingAction(action);
	}, [
		user,
		app,
		loading,
		searchParams,
		setSearchParams,
		executePendingAction,
	]);

	const handleCopyUrl = () => {
		if (!appUrl) return;
		copyUrl(appUrl);
	};

	const getAppUrl = () => {
		// Prefer the tokenized owner-preview URL for a private deployed app the
		// owner is viewing; otherwise the plain deployed/preview URL.
		return ownerPreviewUrl || app?.cloudflareUrl || app?.previewUrl || '';
	};

	const handlePreviewDeploy = async () => {
		if (!app || isDeploying) return;

		try {
			setIsDeploying(true);
			setDeploymentProgress('Connecting to agent...');
			const response = await apiClient.deployPreview(app.id);
			if (response.success && response.data) {
				const data = response.data;
				if (data.previewURL || data.tunnelURL) {
					const newUrl = getPreviewUrl(
						data.previewURL,
						data.tunnelURL,
					);
					setApp((prev) =>
						prev
							? {
									...prev,
									cloudflareUrl: newUrl,
									previewUrl: newUrl,
								}
							: null,
					);
					setDeploymentProgress('Deployment complete!');
				}
			}
			setIsDeploying(false);
		} catch (error) {
			console.error('Error starting deployment:', error);
			setDeploymentProgress('Failed to start deployment');
			setIsDeploying(false);
			toast.add({
				title: 'Failed to start deployment',
				variant: 'error',
			});
		}
	};

	const handleToggleVisibility = async () => {
		if (!app || !user || !isOwner) {
			toast.add({
				title: 'You can only change visibility of your own apps',
				variant: 'error',
			});
			return;
		}

		try {
			setIsUpdatingVisibility(true);
			const newVisibility =
				app.visibility === 'private' ? 'public' : 'private';

			const response = await apiClient.updateAppVisibility(
				app.id,
				newVisibility,
			);

			if (response.success && response.data) {
				// Update the app state with new visibility
				setApp((prev) =>
					prev ? { ...prev, visibility: newVisibility } : null,
				);

				toast.add({
					title:
						response.data.message ||
						`App is now ${newVisibility === 'private' ? 'private' : 'public'}`,
					variant: 'success',
				});
			} else {
				throw new Error(
					response.error?.message || 'Failed to update visibility',
				);
			}
		} catch (error) {
			console.error('Error updating app visibility:', error);
			toast.add({
				title:
					error instanceof ApiError
						? error.message
						: 'Failed to update visibility',
				variant: 'error',
			});
		} finally {
			setIsUpdatingVisibility(false);
		}
	};

	const handleDeleteApp = async () => {
		if (!app) return;

		try {
			setIsDeleting(true);
			const response = await apiClient.deleteApp(app.id);

			if (response.success) {
				toast.add({
					title: 'App deleted successfully',
					variant: 'success',
				});
				setIsDeleteDialogOpen(false);

				// Emit global app deleted event
				appEvents.emitAppDeleted(app.id);

				// Smart navigation after deletion
				// Use window.history to go back if possible, otherwise navigate to apps page
				if (window.history.length > 1) {
					// Try to go back to previous page
					window.history.back();
				} else {
					// No history available, go to apps page
					navigate('/apps');
				}
			}
		} catch (error) {
			console.error('Error deleting app:', error);
			toast.add({
				title: 'An unexpected error occurred while deleting the app',
				variant: 'error',
			});
		} finally {
			setIsDeleting(false);
		}
	};

	if (loading) {
		return (
			<div className="h-full bg-kumo-base flex items-center justify-center">
				<div className="text-center">
					<Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-text-tertiary" />
					<p className="text-sm text-text-tertiary">Loading app...</p>
				</div>
			</div>
		);
	}

	if (error || !app) {
		return (
			<div className="h-full bg-kumo-base flex items-center justify-center p-4">
				<LayerCard className="max-w-md w-full px-5 py-6">
					<div className="text-center grid gap-4">
						<div className="grid gap-1.5">
							<h2 className="text-lg font-semibold text-text-primary">
								App not found
							</h2>
							<p className="text-sm text-text-tertiary">
								{error ||
									"The app you're looking for doesn't exist."}
							</p>
						</div>
						<div className="flex justify-center">
							<Button
								variant="secondary"
								size="sm"
								icon={<ChevronLeft className="h-4 w-4" />}
								onClick={() => navigate('/apps')}
							>
								Back to apps
							</Button>
						</div>
					</div>
				</LayerCard>
			</div>
		);
	}

	const isOwner = app.userId === user?.id;
	const appUrl = getAppUrl();
	const promptText = app?.agentSummary?.query || app?.originalPrompt || '';

	return (
		<div className="h-full bg-kumo-base flex flex-col min-h-0">
			<header className="h-12 shrink-0 flex items-center gap-3 px-4 border-b border-border-primary">
				<div className="min-w-0 flex-1 flex items-center gap-2">
					<h1
						className="text-sm font-semibold truncate min-w-0"
						title={app.title}
					>
						{app.title}
					</h1>
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
				</div>

				<div className="flex items-center gap-1.5 shrink-0">
					{isOwner && (
						<Button
							variant="secondary"
							size="sm"
							onClick={handleToggleVisibility}
							disabled={isUpdatingVisibility}
							loading={isUpdatingVisibility}
							icon={
								app.visibility === 'private' ? (
									<LockOpen
										className="h-3.5 w-3.5"
										weight="duotone"
									/>
								) : (
									<Lock
										className="h-3.5 w-3.5"
										weight="duotone"
									/>
								)
							}
						>
							{app.visibility === 'private'
								? 'Make public'
								: 'Make private'}
						</Button>
					)}

					<Button
						variant="secondary"
						size="sm"
						icon={
							<BookmarkSimple
								className="h-3.5 w-3.5"
								weight={isFavorited ? 'fill' : 'duotone'}
							/>
						}
						onClick={async () => {
							await handleFavorite();
							refetchAll();
						}}
					>
						{isFavorited ? 'Bookmarked' : 'Bookmark'}
					</Button>

					<Button
						variant="secondary"
						size="sm"
						icon={
							<Star
								className="h-3.5 w-3.5"
								weight={isStarred ? 'fill' : 'duotone'}
							/>
						}
						onClick={handleStar}
					>
						{isStarred ? 'Starred' : 'Star'}
						{(app.starCount || 0) > 0 && (
							<span className="text-text-tertiary tabular-nums">
								{app.starCount}
							</span>
						)}
					</Button>

					<Button
						variant="secondary"
						size="sm"
						icon={
							<GitBranch
								className="h-3.5 w-3.5"
								weight="duotone"
							/>
						}
						onClick={() => setIsGitCloneModalOpen(true)}
					>
						Code
					</Button>

					{app.githubRepositoryUrl && (
						<Button
							variant="secondary"
							size="sm"
							icon={
								<GithubLogo
									className="h-3.5 w-3.5"
									weight="duotone"
								/>
							}
							title={`View on GitHub (${app.githubRepositoryVisibility || 'public'})`}
							onClick={() => {
								if (app.githubRepositoryUrl) {
									window.open(
										app.githubRepositoryUrl,
										'_blank',
										'noopener,noreferrer',
									);
								}
							}}
						>
							GitHub
							{app.githubRepositoryVisibility === 'private' && (
								<Lock
									className="h-3 w-3 opacity-70"
									weight="duotone"
								/>
							)}
						</Button>
					)}

					{isOwner && (
						<>
							<Button
								variant="primary"
								size="sm"
								icon={
									<Code
										className="h-3.5 w-3.5"
										weight="duotone"
									/>
								}
								onClick={() => navigate(`/chat/${app.id}`)}
							>
								Continue editing
							</Button>

							<DropdownMenu>
								<DropdownMenu.Trigger
									render={
										<Button
											variant="secondary"
											size="sm"
											shape="square"
											aria-label="More actions"
											icon={
												<DotsThree className="h-4 w-4" />
											}
										/>
									}
								/>
								<DropdownMenu.Content align="end">
									<DropdownMenu.Item
										icon={
											<Trash
												className="h-4 w-4"
												weight="duotone"
											/>
										}
										variant="danger"
										onClick={() =>
											setIsDeleteDialogOpen(true)
										}
									>
										Delete app
									</DropdownMenu.Item>
								</DropdownMenu.Content>
							</DropdownMenu>
						</>
					)}
				</div>
			</header>

			<div className="shrink-0 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between px-4 py-2 border-b border-border-primary">
				<Tabs
					value={activeTab}
					onValueChange={setActiveTab}
					className="w-fit"
					tabs={[
						{
							value: 'preview',
							label: (
								<span className="inline-flex items-center gap-1.5">
									<Eye className="h-3.5 w-3.5" />
									Preview
								</span>
							),
						},
						{
							value: 'code',
							label: (
								<span className="inline-flex items-center gap-1.5">
									<Code2 className="h-3.5 w-3.5" />
									Code
									{files.length > 0 && (
										<span className="text-text-tertiary tabular-nums">
											{files.length}
										</span>
									)}
								</span>
							),
						},
						{
							value: 'prompt',
							label: (
								<span className="inline-flex items-center gap-1.5">
									<MessageSquare className="h-3.5 w-3.5" />
									Prompt
								</span>
							),
						},
					]}
				/>

				<div className="shrink-0 max-w-full">
					{app.visibility === 'public' ? (
						<GitCloneCommand
							cloneUrl={`${window.location.protocol}//${window.location.host}/apps/${app.id}.git`}
							appTitle={app.title}
						/>
					) : isOwner ? (
						<GitClonePrivatePrompt
							onOpenModal={() => setIsGitCloneModalOpen(true)}
						/>
					) : null}
				</div>
			</div>

			{/* Full-bleed workspace */}
			<div className="flex-1 min-h-0 flex flex-col">
				{activeTab === 'preview' && (
					<div className="flex-1 min-h-0 flex flex-col bg-kumo-base overflow-hidden">
						<div className="shrink-0 flex items-center gap-2 px-3 py-2 border-b border-kumo-line bg-kumo-elevated/40">
							<span className="text-sm font-medium text-text-primary shrink-0">
								Live preview
							</span>
							{appUrl && (
								<>
									<code className="min-w-0 flex-1 truncate font-mono text-[0.9em] text-text-tertiary px-2">
										{appUrl}
									</code>
									<div className="flex items-center gap-0.5 shrink-0">
										<Button
											variant="ghost"
											size="sm"
											shape="square"
											aria-label={
												urlCopied
													? 'Copied'
													: 'Copy URL'
											}
											title={
												urlCopied
													? 'Copied'
													: 'Copy URL'
											}
											onClick={handleCopyUrl}
											icon={
												urlCopied ? (
													<Check className="h-3.5 w-3.5" />
												) : (
													<Copy className="h-3.5 w-3.5" />
												)
											}
										/>
										<Button
											variant="ghost"
											size="sm"
											shape="square"
											aria-label="Open in new tab"
											title="Open in new tab"
											onClick={() =>
												window.open(appUrl, '_blank')
											}
											icon={
												<ExternalLink className="h-3.5 w-3.5" />
											}
										/>
									</div>
								</>
							)}
						</div>
						<div className="flex-1 min-h-0 relative">
							{appUrl ? (
								<PreviewIframe
									ref={previewIframeRef}
									src={appUrl}
									className="absolute inset-0 size-full"
									title={`${app.title} Preview`}
								/>
							) : (
								<div className="absolute inset-0 flex items-center justify-center">
									<FloatingBackgroundIcons />

									<div className="relative z-10 text-center p-8 grid gap-4 max-w-md">
										<div className="grid gap-1.5">
											<h3 className="text-xl font-semibold">
												Run app
											</h3>
											<p className="text-kumo-subtle text-sm">
												Deploy a preview to see this app
												live.
											</p>
											{deploymentProgress && (
												<p className="text-sm text-kumo-subtle">
													{deploymentProgress}
												</p>
											)}
										</div>
										<div className="flex justify-center">
											<Button
												variant="primary"
												onClick={handlePreviewDeploy}
												disabled={isDeploying}
												loading={isDeploying}
												icon={
													!isDeploying ? (
														<Play className="h-4 w-4" />
													) : undefined
												}
											>
												{isDeploying
													? 'Deploying...'
													: 'Deploy for preview'}
											</Button>
										</div>
									</div>
								</div>
							)}
						</div>
					</div>
				)}

				{activeTab === 'code' && (
					<div className="flex-1 min-h-0 flex flex-col bg-kumo-base overflow-hidden">
						<div className="shrink-0 flex items-center justify-between gap-2 px-3 py-2 border-b border-kumo-line bg-kumo-elevated/40">
							<div className="min-w-0 flex items-center gap-2">
								<span className="text-sm font-medium text-text-primary shrink-0">
									Project files
								</span>
								{/*{app?.agentSummary && (
									<span className="text-xs text-text-tertiary">
										{files.length} files
									</span>
								)}*/}
							</div>
							{activeFile && (
								<Button
									variant="ghost"
									size="sm"
									icon={
										<CopyIcon
											weight="duotone"
											className="size-3.5"
										/>
									}
									onClick={() => {
										void copyFile(activeFile.fileContents);
									}}
								>
									Copy file
								</Button>
							)}
						</div>

						{files.length > 0 ? (
							<div className="flex-1 min-h-0 flex">
								<FileExplorer
									files={files}
									currentFile={activeFile}
									onFileClick={handleFileClick}
									className="w-56 sm:w-64 max-w-none shrink-0 bg-kumo-elevated/20"
								/>

								<div className="flex-1 min-w-0 min-h-0 flex flex-col">
									{activeFile ? (
										<>
											{activeFile.explanation && (
												<div className="shrink-0 px-3 py-1.5 border-b border-kumo-line text-xs text-text-tertiary truncate">
													{activeFile.explanation}
												</div>
											)}
											<div className="flex-1 min-h-0">
												<MonacoEditor
													className="h-full"
													path={activeFile.filePath}
													createOptions={{
														value: activeFile.fileContents,
														language:
															activeFile.language ||
															'plaintext',
														readOnly: true,
														minimap: {
															enabled: false,
														},
														lineNumbers: 'on',
														scrollBeyondLastLine: false,
														fontSize: 13,
														automaticLayout: true,
													}}
												/>
											</div>
										</>
									) : (
										<div className="flex-1 flex items-center justify-center">
											<p className="text-sm text-text-tertiary">
												Select a file to view
											</p>
										</div>
									)}
								</div>
							</div>
						) : (
							<div className="flex-1 flex items-center justify-center">
								<p className="text-sm text-text-tertiary">
									{app?.agentSummary === null
										? 'Loading code...'
										: 'No code has been generated yet.'}
								</p>
							</div>
						)}
					</div>
				)}

				{activeTab === 'prompt' && (
					<div className="flex-1 min-h-0 flex flex-col bg-kumo-base overflow-hidden relative">
						<div className="flex-1 min-h-0 overflow-y-auto flex items-center justify-center p-6 sm:p-10">
							{promptText ? (
								<div className="w-full max-w-2xl grid gap-5">
									<div className="flex items-end justify-between gap-4">
										<div className="grid gap-1 min-w-0">
											<div className="flex items-center gap-2">
												<span className="h-lh flex items-center shrink-0">
													<span className="rounded-md bg-brand/10 p-1.5">
														<MessageSquare className="size-3.5 text-brand" />
													</span>
												</span>
												<h2 className="text-base font-semibold text-text-primary">
													Original prompt
												</h2>
											</div>
											<p className="text-sm text-text-tertiary pl-9">
												The idea that started this app
											</p>
										</div>
										<Button
											variant="secondary"
											size="sm"
											icon={
												<CopyIcon
													className="size-3.5"
													weight="duotone"
												/>
											}
											onClick={() => {
												void copyPrompt(promptText);
											}}
										>
											Copy
										</Button>
									</div>
									<div className="max-h-[min(60vh,28rem)] overflow-auto rounded-xl bg-kumo-elevated ring ring-kumo-line px-5 py-4">
										<p className="text-sm text-text-primary whitespace-pre-wrap break-words leading-relaxed">
											{promptText}
										</p>
									</div>
								</div>
							) : (
								<div className="grid place-items-center gap-3 text-center">
									<span className="rounded-full bg-kumo-elevated ring ring-kumo-line p-3">
										<MessageSquare className="size-5 text-text-tertiary" />
									</span>
									<div className="grid gap-1">
										<p className="text-sm font-medium text-text-primary">
											{app?.agentSummary === null
												? 'Loading prompt'
												: 'No prompt available'}
										</p>
										{app?.agentSummary !== null && (
											<p className="text-sm text-text-tertiary">
												This app has no saved original
												prompt
											</p>
										)}
									</div>
								</div>
							)}
						</div>
					</div>
				)}
			</div>

			<ConfirmDeleteDialog
				open={isDeleteDialogOpen}
				onOpenChange={setIsDeleteDialogOpen}
				onConfirm={handleDeleteApp}
				isLoading={isDeleting}
				appTitle={app?.title}
			/>

			<GitCloneModal
				open={isGitCloneModalOpen}
				onOpenChange={setIsGitCloneModalOpen}
				appId={app.id}
				appTitle={app.title}
				isPublic={app.visibility === 'public'}
				isOwner={isOwner}
			/>
		</div>
	);
}
