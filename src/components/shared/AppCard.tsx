import React from 'react';
import { motion } from 'framer-motion';
import { Card } from '@/components/ui/card';
import {
	Star,
	Eye,
	Shuffle,
	Code2,
	Lock,
	Users2,
	Globe,
	Cloud,
	CloudOff,
	Loader2,
	Github,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import type {
	AppWithFavoriteStatus,
	AppWithUserAndStats,
	EnhancedAppData,
} from '@/api-types';
import { AppActionsDropdown } from './AppActionsDropdown';
import type { LucideIcon } from 'lucide-react';

// Union type for both app types - make updatedAtFormatted optional
type AppCardData =
	| AppWithFavoriteStatus
	| (EnhancedAppData & { updatedAtFormatted?: string })
	| AppWithUserAndStats;

// Type definitions for deployment and stats
type DeploymentStatus = 'none' | 'deploying' | 'deployed' | 'failed';

interface AppWithDeployment {
	deploymentStatus?: DeploymentStatus;
	deploymentUrl?: string;
}

interface DeploymentStatusInfo {
	icon: LucideIcon;
	color: string;
	bgColor: string;
	text: string;
	animate?: boolean;
}

interface StatsData {
	viewCount?: number;
	starCount?: number;
	forkCount?: number;
	userStarred?: boolean;
}

// Layout and design types for enhanced UI
type CardLayout = 'compact' | 'detailed';

interface LayoutConfig {
	layout: CardLayout;
	showUserInfo: boolean;
	primaryMetadata: 'deployment' | 'social' | 'timestamp';
	showDeploymentStatus: boolean;
}

// Constants - Single source of truth for deployment status configurations
const DEPLOYMENT_STATUS_CONFIG: Record<DeploymentStatus, DeploymentStatusInfo> =
	{
		deployed: {
			icon: Cloud,
			color: 'text-green-500',
			bgColor: 'bg-green-50 dark:bg-green-950',
			text: 'Deployed',
		},
		deploying: {
			icon: Loader2,
			color: 'text-green-400',
			bgColor: 'bg-green-50 dark:bg-green-950',
			text: 'Deploying',
			animate: true,
		},
		failed: {
			icon: CloudOff,
			color: 'text-gray-500',
			bgColor: 'bg-gray-50 dark:bg-gray-950',
			text: 'Deploy Failed',
		},
		none: {
			icon: CloudOff,
			color: 'text-gray-500',
			bgColor: 'bg-gray-50 dark:bg-gray-950',
			text: 'Not Deployed',
		},
	};

// Stats icons mapping
const STATS_ICONS = {
	viewCount: Eye,
	starCount: Star,
	forkCount: Shuffle,
} as const;

// Type-safe utility functions
function hasDeploymentFields(
	app: AppCardData,
): app is AppCardData & AppWithDeployment {
	return 'deploymentStatus' in app || 'deploymentUrl' in app;
}

function getAppDeploymentStatus(app: AppCardData): DeploymentStatus {
	if (!hasDeploymentFields(app)) return 'none';

	// If has deployment URL, it's deployed
	if (app.deploymentUrl) return 'deployed';

	// Return deployment status or default to 'none'
	return app.deploymentStatus || 'none';
}

function getAppStats(app: AppCardData): StatsData {
	if (isPublicApp(app)) {
		return {
			viewCount: app.viewCount,
			starCount: app.starCount,
			forkCount: app.forkCount,
			userStarred: app.userStarred,
		};
	}

	if (isUserApp(app) || isEnhancedApp(app)) {
		// Type-safe access to stats fields that exist on enhanced/user app types
		const enhancedApp = app as EnhancedAppData;
		return {
			viewCount: enhancedApp.viewCount,
			starCount: enhancedApp.starCount,
			forkCount: enhancedApp.forkCount,
			userStarred: enhancedApp.userStarred,
		};
	}

	return {};
}

// Type guards
function isPublicApp(app: AppCardData): app is AppWithUserAndStats {
	return (
		'userName' in app &&
		'starCount' in app &&
		'userStarred' in app &&
		'updatedAtFormatted' in app
	);
}

function isUserApp(app: AppCardData): app is AppWithFavoriteStatus {
	return (
		'isFavorite' in app &&
		'updatedAtFormatted' in app &&
		!('userName' in app)
	);
}

function isEnhancedApp(app: AppCardData): app is EnhancedAppData {
	return (
		'userFavorited' in app &&
		'starCount' in app &&
		!('isFavorite' in app) &&
		!('updatedAtFormatted' in app)
	);
}

interface AppCardProps {
	app: AppCardData;
	onClick: (appId: string) => void;
	onToggleFavorite?: (appId: string) => void;
	showStats?: boolean;
	showUser?: boolean;
	showActions?: boolean;
	className?: string;
}

const getVisibilityIcon = (visibility: string) => {
	switch (visibility) {
		case 'private':
			return <Lock className="h-3 w-3" />;
		case 'team':
			return <Users2 className="h-3 w-3" />;
		case 'board':
		case 'public':
			return <Globe className="h-3 w-3" />;
		default:
			return <Lock className="h-3 w-3" />;
	}
};

function getDeploymentStatusInfo(
	app: AppCardData,
): DeploymentStatusInfo | null {
	if (!hasDeploymentFields(app)) return null;

	const status = getAppDeploymentStatus(app);
	return DEPLOYMENT_STATUS_CONFIG[status];
}

function getLayoutConfig(
	showUser: boolean,
	showActions: boolean,
): LayoutConfig {
	return {
		layout: showUser ? 'detailed' : 'compact',
		showUserInfo: showUser,
		primaryMetadata: showUser ? 'social' : 'deployment',
		showDeploymentStatus: !showUser && showActions,
	};
}

// Reusable components to eliminate duplicate JSX
const StatItem = ({
	icon: Icon,
	value,
	highlighted = false,
}: {
	icon: LucideIcon;
	value: number;
	highlighted?: boolean;
}) => (
	<div className="flex items-center gap-1">
		<Icon
			className={cn(
				'h-3.5 w-3.5 text-kumo-subtle',
				highlighted && 'fill-kumo-warning text-kumo-warning',
			)}
		/>
		<span className="font-medium text-xs text-kumo-subtle tabular-nums">
			{value || 0}
		</span>
	</div>
);

const StatsDisplay = ({ stats }: { stats: StatsData }) => (
	<div className="flex items-center gap-2.5 text-sm text-kumo-subtle">
		<StatItem
			icon={STATS_ICONS.starCount}
			value={stats.starCount || 0}
			highlighted={stats.userStarred}
		/>
		{/* Fork functionality temporarily removed - showing view count instead */}
		{/* <StatItem icon={STATS_ICONS.forkCount} value={stats.forkCount || 0} /> */}
		<StatItem icon={STATS_ICONS.viewCount} value={stats.viewCount || 0} />
	</div>
);

const AppMetadata = ({
	app,
	layoutConfig,
	hasOverlayStatus,
}: {
	app: AppCardData;
	layoutConfig: LayoutConfig;
	hasOverlayStatus?: boolean;
}) => {
	if (layoutConfig.primaryMetadata === 'social' && isPublicApp(app)) {
		const description = app.description?.trim();

		// Discover page layout - title, optional description, stats
		return (
			<div className="flex flex-col gap-1.5 w-full min-w-0">
				<div className="grid gap-1 min-w-0">
					<span className="truncate text-sm font-semibold text-kumo-strong">
						{app.title}
					</span>
					{description ? (
						<p className="line-clamp-2 text-xs leading-relaxed text-kumo-subtle">
							{description}
						</p>
					) : null}
				</div>
				<div className="shrink-0">
					<StatsDisplay stats={getAppStats(app)} />
				</div>
			</div>
		);
	}

	if (
		layoutConfig.primaryMetadata === 'deployment' &&
		(isUserApp(app) || isEnhancedApp(app))
	) {
		// My Apps page layout - show deployment status and update time
		const deploymentStatus = getDeploymentStatusInfo(app);
		return (
			<div className='flex flex-col'>
				<span className="truncate text-ellipsis max-w-60 font-medium text-kumo-strong">
					{app.title}
				</span>
				<div className="flex items-center gap-2.5 text-sm">
					{/* Only show deployment status if there's no overlay status indicator */}
					{deploymentStatus && !hasOverlayStatus && (
						<>
							<div className="flex items-center gap-1.5">
								<div
									className={cn(
										'w-2 h-2 rounded-full transition-all duration-200',
										deploymentStatus.color ===
											'text-green-500' &&
											'bg-green-500 shadow-sm shadow-green-500/20',
										deploymentStatus.color ===
											'text-green-400' &&
											'bg-green-400 animate-pulse shadow-sm shadow-green-400/20',
										deploymentStatus.color ===
											'text-gray-500' &&
											'bg-gray-400 shadow-sm shadow-gray-400/20',
										deploymentStatus.color ===
											'text-gray-500 ' && 'bg-gray-400',
									)}
								/>
								<span
									className={cn(
										'text-xs font-medium transition-colors',
										deploymentStatus.color ===
											'text-green-500' &&
											'text-green-600',
										deploymentStatus.color ===
											'text-green-400' &&
											'text-green-600',
									deploymentStatus.color ===
											'text-gray-500' &&
											'text-kumo-subtle',
									)}
								>
									{deploymentStatus.text}
								</span>
							</div>
							<span className="text-kumo-subtle/60">•</span>
						</>
					)}
					<span className="text-xs text-kumo-subtle font-medium">
						Updated{' '}
						{isUserApp(app)
							? app.updatedAtFormatted
							: isEnhancedApp(app) && app.updatedAt
								? formatDistanceToNow(new Date(app.updatedAt), {
										addSuffix: true,
									})
								: 'Recently'}
					</span>
				</div>
			</div>
		);
	}

	// Fallback for other cases
	return (
		<div className="flex items-center gap-2 text-sm">
			<span className="text-xs text-text-tertiary/80 font-medium">
				{isUserApp(app)
					? `Updated ${app.updatedAtFormatted}`
					: 'Recently updated'}
			</span>
		</div>
	);
};

export const AppCard = React.memo<AppCardProps>(
	({
		app,
		onClick,
		showUser = false,
		showActions = false,
		className,
	}) => {
		const layoutConfig = getLayoutConfig(showUser, showActions);
		const deploymentStatus = getDeploymentStatusInfo(app);

		const itemVariants = {
			hidden: { y: 10, opacity: 0 },
			visible: {
				y: 0,
				opacity: 1,
				transition: {
					type: 'spring' as const,
					stiffness: 200,
					damping: 20,
				},
			},
			exit: {
				y: -10,
				opacity: 0,
				scale: 0.98,
				transition: {
					duration: 0.2,
				},
			},
		};

		return (
			<motion.div
				variants={itemVariants}
				initial="hidden"
				animate="visible"
				exit="exit"
				layout
				className={className}
			>
				{/* Anchor wrapper for right-click context menu support */}
				<a
					href={`/app/${app.id}`}
					onClick={(e) => {
						e.preventDefault();
						onClick(app.id);
					}}
					className="block h-full no-underline"
				>
					<Card
						className={cn(
							'h-full cursor-pointer group relative overflow-hidden rounded-xl border-0 p-1.5 bg-kumo-base',
							'shadow-sm ring-1 ring-kumo-line',
							'hover:bg-kumo-tint hover:shadow-md hover:ring-kumo-line',
						)}
					>
					{/* Enhanced Preview Section with High-Quality Rendering */}
					<div className="relative aspect-[16/10] rounded-[10px] overflow-hidden bg-kumo-recessed">
						{app.screenshotUrl ? (
							<img
								src={app.screenshotUrl}
								alt={`${app.title} preview`}
								className={cn(
									'w-full h-full transition-transform duration-300 ease-out group-hover:scale-[1.02]',
									// High-quality rendering with smart cropping for better visual appeal
									'object-cover object-center',
									'bg-kumo-tint',
								)}
								loading="lazy"
								fetchPriority="low"
								sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
								srcSet={`${app.screenshotUrl} 1x, ${app.screenshotUrl} 1.5x, ${app.screenshotUrl} 2x, ${app.screenshotUrl} 3x`}
								decoding="async"
								onError={(e) => {
									// Smooth fallback to placeholder
									const target = e.target as HTMLImageElement;
									target.style.opacity = '0';
									setTimeout(() => {
										target.style.display = 'none';
										const placeholder =
											target.parentElement?.querySelector(
												'.screenshot-placeholder',
											) as HTMLElement;
										if (placeholder) {
											placeholder.classList.remove(
												'hidden',
											);
											placeholder.style.opacity = '1';
										}
									}, 150);
								}}
								onLoad={(e) => {
									// Ensure smooth appearance with advanced quality enhancement
									const target = e.target as HTMLImageElement;
									target.style.opacity = '1';
									// Apply dynamic quality optimizations after load
									const devicePixelRatio =
										window.devicePixelRatio || 1;
									if (devicePixelRatio >= 2) {
										target.style.imageRendering =
											'high-quality';
										target.style.filter =
											'contrast(1.05) saturate(1.06) brightness(1.02) unsharp-mask(0.7px 0.7px 0px)';
									} else {
										target.style.imageRendering = 'auto';
										target.style.filter =
											'contrast(1.04) saturate(1.05) brightness(1.02) unsharp-mask(0.5px 0.5px 0px)';
									}
									target.style.backfaceVisibility = 'hidden';
									target.style.willChange = 'transform';
								}}
								style={{
									opacity: 0,
									transition: 'opacity 0.3s ease-out',
									// Advanced CSS-level quality optimizations
									imageRendering: 'auto',
									backfaceVisibility: 'hidden',
									transform: 'translate3d(0, 0, 0)',
									willChange: 'transform',
									contain: 'layout style paint',
									isolation: 'isolate',
									// Enhanced quality filters with cross-browser support
									filter: 'contrast(1.04) saturate(1.05) brightness(1.02)',
									WebkitFontSmoothing: 'subpixel-antialiased',
									textRendering: 'optimizeLegibility',
									fontFeatureSettings: '"kern" 1',
								}}
							/>
						) : null}

						<div
							className={cn(
								'screenshot-placeholder w-full h-full flex flex-col items-center justify-center absolute inset-0',
								app.screenshotUrl
									? 'hidden opacity-0'
									: 'opacity-100',
								'bg-kumo-recessed',
							)}
						>
							<div className="flex flex-col items-center gap-2 text-kumo-subtle">
								<Code2 className="h-10 w-10" />
								<div className="text-xs font-medium text-center px-4">
									Preview unavailable
								</div>
							</div>
						</div>

						{/* Deploying status indicator - only show when actually deploying */}
						{deploymentStatus?.color === 'text-green-400' &&
							getAppDeploymentStatus(app) === 'deploying' && (
								<div
									className="absolute top-2 left-2 h-4 w-4 rounded-full bg-kumo-success-tint backdrop-blur-sm flex items-center justify-center ring-1 ring-kumo-success/30"
									title="App is deploying"
									aria-label="App deployment in progress"
								>
									<Loader2 className="w-2 h-2 text-kumo-success animate-spin" />
								</div>
							)}

						{/* Failed deployment status indicator - only show when deployment actually failed */}
						{deploymentStatus?.color === 'text-gray-500' &&
							getAppDeploymentStatus(app) === 'failed' && (
								<div
									className="absolute top-2 left-2 h-4 w-4 rounded-full bg-kumo-tint backdrop-blur-sm flex items-center justify-center ring-1 ring-kumo-line"
									title="Deployment failed"
									aria-label="App deployment failed"
								>
									<CloudOff className="w-2 h-2 text-kumo-subtle" />
								</div>
							)}

						{/* GitHub Repository Badge - moved to app info section, removed from screenshot overlay */}

						{/* Actions Dropdown - positioned in top-right on hover */}
						{showActions && (
							<div className="absolute top-2 right-2">
								<AppActionsDropdown
									appId={app.id}
									appTitle={app.title}
									showOnHover={true}
									className="h-6 w-6 text-text-tertiary hover:text-text-primary bg-kumo-base/90 backdrop-blur-sm hover:bg-kumo-base"
									size="sm"
								/>
							</div>
						)}

						{/* Visibility Badge for user apps */}
						{(isUserApp(app) || isEnhancedApp(app)) && (
							<div className="absolute bottom-2 left-2 bg-kumo-base/90 backdrop-blur-sm rounded-md p-1 text-kumo-subtle">
								{getVisibilityIcon(app.visibility)}
							</div>
						)}
					</div>

					<div className="flex items-start justify-between gap-2 px-2.5 py-2">
						<div className="flex-1 min-w-0">
							{/* Enhanced Adaptive Metadata with GitHub integration */}
							<div className="flex items-start gap-2">
								<div className="flex-1 min-w-0">
									<AppMetadata
										app={app}
										layoutConfig={layoutConfig}
										hasOverlayStatus={
											!!deploymentStatus &&
											deploymentStatus.color !==
												'text-gray-500'
										}
									/>
								</div>
								{/* GitHub Repository Button - integrated into app info */}
								{app.githubRepositoryUrl &&
									app.githubRepositoryVisibility !==
										'private' && (
										<button
											className="group/github shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-full bg-kumo-tint hover:bg-kumo-fill ring-1 ring-kumo-hairline"
											onClick={(e) => {
												e.stopPropagation();
												if (
													app.githubRepositoryUrl
												) {
													window.open(
														app.githubRepositoryUrl,
														'_blank',
														'noopener,noreferrer',
													);
												}
											}}
											title={`View on GitHub (${app.githubRepositoryVisibility || 'public'})`}
											aria-label="View repository on GitHub"
										>
											<Github className="w-3.5 h-3.5 text-kumo-subtle group-hover/github:text-kumo-default" />
										</button>
									)}
							</div>
						</div>
					</div>
					</Card>
				</a>
			</motion.div>
		);
	},
);

AppCard.displayName = 'AppCard';
