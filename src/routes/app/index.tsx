import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router';
import type { AppDetailsData, FileType } from '@/api-types';
import { apiClient, ApiError } from '@/lib/api-client';
import { appEvents } from '@/lib/app-events';
import {
	Star,
	Eye,
	Code2,
	ChevronLeft,
	ExternalLink,
	Copy,
	Check,
	Loader2,
	MessageSquare,
	Calendar,
	User,
	Play,
	Lock,
	Unlock,
	Bookmark,
	Globe,
	Trash2,
	Github,
} from 'lucide-react';
import { MonacoEditor } from '@/components/monaco-editor/monaco-editor';
import { getFileType } from '@/utils/string';
import { Button } from '@/components/ui/button';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/contexts/auth-context';
import { toggleFavorite } from '@/hooks/use-apps';
import { formatDistanceToNow, isValid } from 'date-fns';
import { toast } from 'sonner';
import { capitalizeFirstLetter, cn, getPreviewUrl } from '@/lib/utils';
import { ConfirmDeleteDialog } from '@/components/shared/ConfirmDeleteDialog';
import { useAuthGuard } from '@/hooks/useAuthGuard';
import { PreviewIframe } from '../chat/components/preview-iframe';

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
	const [copySuccess, setCopySuccess] = useState(false);
	const [activeTab, setActiveTab] = useState('preview');
	const [isDeploying, setIsDeploying] = useState(false);
	const [deploymentProgress, setDeploymentProgress] = useState<string>('');
	const [isUpdatingVisibility, setIsUpdatingVisibility] = useState(false);
	const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
	const [isDeleting, setIsDeleting] = useState(false);
	const [activeFilePath, setActiveFilePath] = useState<string>();
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


	// Convert agent files to chat FileType format
	const files = useMemo<FileType[]>(() => {
		if (!app?.agentSummary?.generatedCode) return [];
		return app.agentSummary.generatedCode
			.filter((file) => file && file.filePath && typeof file.filePath === 'string')
			.map((file) => ({
				filePath: file.filePath,
				fileContents: file.fileContents || '',
				explanation: file.filePurpose,
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

	// Auto-select first file when files are loaded
	useEffect(() => {
		if (files.length > 0 && !activeFilePath) {
			setActiveFilePath(files[0].filePath);
		}
	}, [files, activeFilePath]);

	// File click handler
	const handleFileClick = useCallback((file: FileType) => {
		setActiveFilePath(file.filePath);
	}, []);

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
					toast.success(
						newState
							? 'Added to bookmarks'
							: 'Removed from bookmarks',
					);
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
										starCount: response.data?.starCount || 0,
									}
								: null,
						);
						toast.success(
							response.data.isStarred ? 'Starred!' : 'Unstarred',
						);
					} else {
						throw new Error(response.error?.message || 'Failed to star app');
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
			// 			toast.success(
			// 				response.data.message ||
			// 					'App remixed successfully!',
			// 			);

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
		[app],
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
					toast.error(
						error instanceof ApiError
							? error.message
							: config.errorMessage,
					);
				}
			};
		},
		[actionConfigs, app, requireAuth],
	);

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
				toast.error(
					error instanceof ApiError
						? error.message
						: config.errorMessage,
				);
			}
		},
		[actionConfigs, app],
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

		navigator.clipboard.writeText(appUrl);
		setCopySuccess(true);
		setTimeout(() => setCopySuccess(false), 2000);
	};

	const getAppUrl = () => {
		return app?.cloudflareUrl || app?.previewUrl || '';
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
			toast.error('Failed to start deployment');
		}
	};

	const handleToggleVisibility = async () => {
		if (!app || !user || !isOwner) {
			toast.error('You can only change visibility of your own apps');
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

				toast.success(
					response.data.message ||
						`App is now ${newVisibility === 'private' ? 'private' : 'public'}`,
				);
			} else {
				throw new Error(
					response.error?.message || 'Failed to update visibility',
				);
			}
		} catch (error) {
			console.error('Error updating app visibility:', error);
			toast.error(
				error instanceof ApiError
					? error.message
					: 'Failed to update visibility',
			);
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
				toast.success('App deleted successfully');
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
			toast.error('An unexpected error occurred while deleting the app');
		} finally {
			setIsDeleting(false);
		}
	};

	if (loading) {
		return (
			<div className="min-h-screen bg-bg-3 flex items-center justify-center">
				<div className="text-center">
					<Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-text-tertiary" />
					<p className="text-text-tertiary">Loading app...</p>
				</div>
			</div>
		);
	}

	if (error || !app) {
		return (
			<div className="min-h-screen bg-bg-3 flex items-center justify-center">
				<Card className="max-w-md">
					<CardContent className="pt-6">
						<div className="text-center">
							<h2 className="text-xl font-semibold mb-2">
								App not found
							</h2>
							<p className="text-text-tertiary mb-4">
								{error ||
									"The app you're looking for doesn't exist."}
							</p>
							<Button onClick={() => navigate('/apps')}>
								<ChevronLeft className="mr-2 h-4 w-4" />
								Back to Apps
							</Button>
						</div>
					</CardContent>
				</Card>
			</div>
		);
	}

	const isOwner = app.userId === user?.id;
	const appUrl = getAppUrl();
	const createdDate = app.createdAt ? new Date(app.createdAt) : new Date();

	return (
		<div className="min-h-screen bg-bg-3 flex flex-col">
			<div className="container mx-auto px-4 pb-6 space-y-6 flex flex-col flex-1">
				{/* Back button */}
				<button
					onClick={() => history.back()}
					className="gap-2 flex items-center text-text-primary/80"
				>
					<ChevronLeft className="h-4 w-4" />
					Back
				</button>

				{/* App Info Section */}
				<div className="flex flex-col items-start justify-between gap-4 text-bg-4 w-fit rounded-lg p-5">
					<div className="flex-1">
						<div className="flex rounded w-fit pb-3 pt-2 flex-col mb-6">
							<div className="flex items-center gap-3 mb-2">
								<h1 className="text-4xl font-semibold tracking-tight text-text-primary">
									{app.title}
								</h1>

								<div className="flex items-center gap-2 border rounded-xl">
									<Badge variant={'default'}>
										<Globe />
										{capitalizeFirstLetter(app.visibility)}
									</Badge>
									{isOwner && (
										<Button
											variant="ghost"
											size="sm"
											onClick={handleToggleVisibility}
											disabled={isUpdatingVisibility}
											className="h-6 w-6 p-0 hover:bg-bg-3/50 -ml-1.5 !mr-1.5"
											title={`Make ${app.visibility === 'private' ? 'public' : 'private'}`}
										>
											{isUpdatingVisibility ? (
												<Loader2 className="h-3 w-3 animate-spin text-text-primary" />
											) : app.visibility === 'private' ? (
												<Unlock className="h-3 w-3 text-text-primary" />
											) : (
												<Lock className="h-3 w-3 text-text-primary" />
											)}
										</Button>
									)}
								</div>
							</div>
							<div className="flex flex-wrap gap-2">
								<Button
									variant="outline"
									size="sm"
									onClick={handleFavorite}
									className={cn(
										'gap-2 text-text-primary',
									)}
								>
									<Bookmark
										className={cn(
											'h-4 w-4',
											isFavorited && 'fill-current',
										)}
									/>
									{isFavorited ? 'Bookmarked' : 'Bookmark'}
								</Button>

								<Button
									variant="outline"
									size="sm"
									onClick={handleStar}
									className={cn('gap-2 text-text-primary')}
								>
									<Star
										className={cn(
											'h-4 w-4',
											isStarred && 'fill-current',
										)}
									/>
									{isStarred ? 'Starred' : 'Star'}
								</Button>

								{/* GitHub Repository Button */}
								{app.githubRepositoryUrl && (
									<Button
										variant="outline"
										size="sm"
										onClick={() => {
											if (app.githubRepositoryUrl) {
												window.open(
													app.githubRepositoryUrl,
													'_blank',
													'noopener,noreferrer',
												);
											}
										}}
										className={cn('gap-2 text-text-primary')}
										title={`View on GitHub (${app.githubRepositoryVisibility || 'public'})`}
									>
										<Github className="h-4 w-4" />
										View on GitHub
										{app.githubRepositoryVisibility ===
											'private' && (
											<Lock className="h-3 w-3 opacity-70" />
										)}
									</Button>
								)}

								{isOwner ? (
									<>
										<Button
											size="sm"
											onClick={() =>
												navigate(`/chat/${app.id}`)
											}
											className="gap-2 bg-text-primary text-bg-4 border-bg-4 border"
										>
											<Code2 className="h-4 w-4" />
											Continue Editing
										</Button>
										<Button
											variant="outline"
											size="sm"
											onClick={() =>
												setIsDeleteDialogOpen(true)
											}
											className="gap-2 text-text-on-brand !border-0 bg-destructive hover:opacity-90 transition-colors"
										>
											<Trash2 className="h-4 w-4" />
											Delete App
										</Button>
									</>
								) 
                                : (
									<>
										{/*
										<Button
											size="sm"
											variant="secondary"
											onClick={handleFork}
											className="gap-2 bg-text-primary text-bg-1"
										>
											<Shuffle className="h-4 w-4" />
											Remix
										</Button>
										*/}
									</>
								)
                                }
							</div>
						</div>

						{app.description && (
							<p className="text-text-primary my-3 max-w-4xl">
								{app.description}
							</p>
						)}

						<div className="flex flex-wrap items-center gap-4 text-sm text-text-secondary">
							{app.user && (
								<div className="flex items-center gap-2">
									<User className="h-4 w-4" />
									<span>{app.user.displayName}</span>
								</div>
							)}
							<div className="flex items-center gap-2">
								<Calendar className="h-4 w-4" />
								<span>
									{isValid(createdDate)
										? formatDistanceToNow(createdDate, {
												addSuffix: true,
											})
										: 'recently'}
								</span>
							</div>
							<div className="flex items-center gap-2">
								<Eye className="h-4 w-4" />
								<span>{app.viewCount || 0}</span>
							</div>
							<div className="flex items-center gap-2">
								<Star className="h-4 w-4" />
								<span>{app.starCount || 0}</span>
							</div>
						</div>
					</div>
				</div>
				<Tabs
					value={activeTab}
					onValueChange={setActiveTab}
					className="flex flex-col flex-1 gap-2"
				>
					{/* Using proper TabsList and TabsTrigger components */}
					<TabsList className="inline-flex h-auto w-fit items-center gap-0.5 bg-bg-2 dark:bg-bg-1 rounded-md p-0.5 border border-border-primary/30 ml-0">
						<TabsTrigger 
							value="preview" 
							className="px-3 py-1.5 rounded text-xs font-medium data-[state=active]:bg-bg-4 dark:data-[state=active]:bg-bg-3 data-[state=active]:text-text-primary data-[state=active]:shadow-sm"
						>
							<Eye className={cn(
								"h-3.5 w-3.5 mr-1.5",
								activeTab === 'preview' ? 'text-accent' : 'text-accent/60'
							)} />
							Preview
						</TabsTrigger>
						<TabsTrigger 
							value="code" 
							className="px-3 py-1.5 rounded text-xs font-medium data-[state=active]:bg-bg-4 dark:data-[state=active]:bg-bg-3 data-[state=active]:text-text-primary data-[state=active]:shadow-sm"
						>
							<Code2 className={cn(
								"h-3.5 w-3.5 mr-1.5",
								activeTab === 'code' ? 'text-accent' : 'text-accent/60'
							)} />
							Code
						</TabsTrigger>
						<TabsTrigger 
							value="prompt" 
							className="px-3 py-1.5 rounded text-xs font-medium data-[state=active]:bg-bg-4 dark:data-[state=active]:bg-bg-3 data-[state=active]:text-text-primary data-[state=active]:shadow-sm"
						>
							<MessageSquare className={cn(
								"h-3.5 w-3.5 mr-1.5",
								activeTab === 'prompt' ? 'text-accent' : 'text-accent/60'
							)} />
							Prompt
						</TabsTrigger>
					</TabsList>

					<TabsContent value="preview" className="flex-1">
						<Card className="px-2">
							<CardHeader className="overflow-hidden rounded-t">
								<div className="flex items-center justify-between">
									<CardTitle className="text-base">
										Live Preview
									</CardTitle>
									<div className="flex items-center gap-0">
										{appUrl && (
											<>
												<Button
													variant="ghost"
													size="sm"
													onClick={handleCopyUrl}
													className="gap-2"
												>
													{copySuccess ? (
														<>
															<Check className="h-3 w-3" />
															Copied!
														</>
													) : (
														<>
															<Copy className="h-3 w-3" />
														</>
													)}
												</Button>
												<Button
													variant="ghost"
													size="sm"
													onClick={() =>
														window.open(
															appUrl,
															'_blank',
														)
													}
													className="gap-2"
												>
													<ExternalLink className="h-3 w-3" />
												</Button>
											</>
										)}
									</div>
								</div>
							</CardHeader>
							<CardContent className="p-0">
								<div className="border-t relative">
									{appUrl ? (
										<PreviewIframe
											ref={previewIframeRef}
											src={appUrl}
											className="w-full h-[600px] lg:h-[800px]"
											title={`${app.title} Preview`}
										/>
									) : (
										<div className="relative w-full h-[400px] bg-gray-50 flex items-center justify-center">
											{/* Frosted glass overlay */}
											<div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center z-10">
												<div className="text-center p-8">
													<h3 className="text-xl font-semibold mb-2 text-gray-700">
														Run App
													</h3>
													<p className="text-gray-500 mb-6 max-w-md">
														Run the app to see a
														live preview.
													</p>
													{deploymentProgress && (
														<p className="text-sm text-gray-800 mb-4">
															{deploymentProgress}
														</p>
													)}
													<div className="flex gap-3 justify-center">
														<Button
															onClick={
																handlePreviewDeploy
															}
															disabled={
																isDeploying
															}
															className="gap-2"
														>
															{isDeploying ? (
																<>
																	<Loader2 className="h-4 w-4 animate-spin" />
																	Deploying...
																</>
															) : (
																<>
																	<Play className="h-4 w-4" />
																	Deploy for
																	Preview
																</>
															)}
														</Button>
													</div>
												</div>
											</div>
											{/* Background pattern */}
											<div className="absolute inset-0 opacity-10">
												<div
													className="w-full h-full"
													style={{
														backgroundImage: `url("data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23000' fill-opacity='0.1'%3E%3Cpath d='M20 20c0 11.046-8.954 20-20 20V0c11.046 0 20 8.954 20 20z'/%3E%3C/g%3E%3C/svg%3E")`,
														backgroundSize:
															'40px 40px',
													}}
												/>
											</div>
										</div>
									)}
								</div>
							</CardContent>
						</Card>
					</TabsContent>

					<TabsContent value="code" className="flex-1">
						<Card className="flex flex-col" style={{ maxHeight: '600px' }}>
							<CardHeader>
								<div className="flex items-center justify-between">
									<div>
										<CardTitle>Generated Code</CardTitle>
										{app?.agentSummary && (
											<p className="text-sm text-muted-foreground">
												{files.length} files generated
											</p>
										)}
									</div>
									{activeFile && (
										<Button
											variant="ghost"
											size="sm"
											onClick={() => {
												navigator.clipboard.writeText(
													activeFile.fileContents,
												);
												toast.success(
													'Code copied to clipboard',
												);
											}}
											className="gap-2"
										>
											<Copy className="h-3 w-3" />
											Copy File
										</Button>
									)}
								</div>
							</CardHeader>
							<CardContent className="p-0 flex-1 flex flex-col overflow-hidden">
								{files.length > 0 ? (
									<div className="h-[450px] relative bg-bg-3 overflow-hidden">
										<div className="h-full flex">
											<div className="w-full max-w-[250px] bg-bg-3 border-r border-text/10 h-full overflow-y-auto">
												<div className="p-2 px-3 text-sm flex items-center gap-1 text-text-primary/50 font-medium border-b bg-bg-3">
													<Code2 className="size-4" />
													Files
												</div>
												<div className="flex flex-col">
													{files.map((file) => (
														<button
															key={file.filePath}
															onClick={() =>
																handleFileClick(
																	file,
																)
															}
															className={cn(
																'flex items-center w-full gap-2 py-2 px-3 text-left text-sm transition-colors',
																activeFile?.filePath ===
																	file.filePath
																	? 'bg-blue-100 text-blue-900 border-r-2 border-blue-500'
																	: 'hover:bg-bg-3 text-text-tertiary hover:text-text-primary',
															)}
														>
															<Code2 className="h-4 w-4 flex-shrink-0" />
															<span className="truncate font-mono text-xs">
																{file.filePath}
															</span>
														</button>
													))}
												</div>
											</div>

											<div className="flex-1 flex flex-col">
												{activeFile ? (
													<>
														<div className="flex items-center justify-between p-3 border-b bg-bg-3">
															<div className="flex items-center gap-2 flex-1">
																<Code2 className="h-4 w-4" />
																<span className="text-sm font-mono">
																	{
																		activeFile.filePath
																	}
																</span>
																{activeFile.explanation && (
																	<span className="text-xs text-text-tertiary ml-3">
																		{
																			activeFile.explanation
																		}
																	</span>
																)}
															</div>
														</div>

														<div className="flex-1 min-h-0">
															<MonacoEditor
																className="h-full"
																createOptions={{
																	value: activeFile.fileContents,
																	language:
																		activeFile.language ||
																		'plaintext',
																	readOnly: true,
																	minimap: {
																		enabled: false,
																	},
																	lineNumbers:
																		'on',
																	scrollBeyondLastLine: false,
																	fontSize: 13,
																	theme: 'v1-dev',
																	automaticLayout: true,
																}}
															/>
														</div>
													</>
												) : (
													<div className="flex-1 flex items-center justify-center">
														<p className="text-text-tertiary">
															Select a file to
															view
														</p>
													</div>
												)}
											</div>
										</div>
									</div>
								) : (
									<div className="flex items-center justify-center h-[400px]">
										<p className="text-muted-foreground">
											{app?.agentSummary === null 
												? 'Loading code...' 
												: 'No code has been generated yet.'
											}
										</p>
									</div>
								)}
							</CardContent>
						</Card>
					</TabsContent>

					<TabsContent
						value="prompt"
						className="flex-1"
					>
						<Card>
							<CardHeader>
								<CardTitle>Original Prompt</CardTitle>
								<CardDescription>
									The initial prompt used to create this app
								</CardDescription>
							</CardHeader>
							<CardContent>
								{app?.agentSummary?.query || app?.originalPrompt ? (
									<div className="bg-bg-2 rounded-lg p-6 border border-border-primary">
										<div className="flex items-start gap-3">
											<div className="flex-shrink-0 mt-1">
												<div className="rounded-full bg-accent/10 p-2">
													<MessageSquare className="h-4 w-4 text-accent" />
												</div>
											</div>
											<div className="flex-1">
												<p className="text-sm text-text-secondary mb-2 font-medium">Prompt</p>
												<p className="text-text-primary whitespace-pre-wrap">
													{app?.agentSummary?.query || app?.originalPrompt}
												</p>
											</div>
										</div>
										
										{/* Copy button */}
										<div className="mt-4 flex justify-end">
											<Button
												variant="outline"
												size="sm"
												onClick={() => {
													const prompt = app?.agentSummary?.query || app?.originalPrompt;
													if (prompt) {
														navigator.clipboard.writeText(prompt);
														toast.success('Prompt copied to clipboard');
													}
												}}
												className="gap-2"
											>
												<Copy className="h-3 w-3" />
												Copy Prompt
											</Button>
										</div>
									</div>
								) : (
									<div className="flex items-center justify-center py-12 text-text-tertiary">
										<MessageSquare className="h-8 w-8 mr-3" />
										<p>
											{app?.agentSummary === null 
												? 'Loading prompt...' 
												: 'No prompt available'
											}
										</p>
									</div>
								)}
							</CardContent>
						</Card>
					</TabsContent>
				</Tabs>
			</div>

			{/* Delete Confirmation Dialog */}
			<ConfirmDeleteDialog
				open={isDeleteDialogOpen}
				onOpenChange={setIsDeleteDialogOpen}
				onConfirm={handleDeleteApp}
				isLoading={isDeleting}
				appTitle={app?.title}
			/>
		</div>
	);
}
