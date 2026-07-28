import React from 'react';
import { cn } from '@cloudflare/kumo';
import { motion } from 'framer-motion';
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

import { formatDistanceToNow } from 'date-fns';
import type {
	AppWithFavoriteStatus,
	AppWithUserAndStats,
	EnhancedAppData,
} from '@/api-types';
import { AppActionsDropdown } from './AppActionsDropdown';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import type { LucideIcon } from 'lucide-react';

type AppCardData =
	| AppWithFavoriteStatus
	| (EnhancedAppData & { updatedAtFormatted?: string })
	| AppWithUserAndStats;

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

type CardLayout = 'compact' | 'detailed';

interface LayoutConfig {
	layout: CardLayout;
	showUserInfo: boolean;
	primaryMetadata: 'deployment' | 'social' | 'timestamp';
	showDeploymentStatus: boolean;
}

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

const STATS_ICONS = {
	viewCount: Eye,
	starCount: Star,
	forkCount: Shuffle,
} as const;

function hasDeploymentFields(
	app: AppCardData,
): app is AppCardData & AppWithDeployment {
	return 'deploymentStatus' in app || 'deploymentUrl' in app;
}

function getAppDeploymentStatus(app: AppCardData): DeploymentStatus {
	if (!hasDeploymentFields(app)) return 'none';
	if (app.deploymentUrl) return 'deployed';
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

function formatStat(value: number): string {
	if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
	if (value >= 1_000) return `${(value / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
	return String(value || 0);
}

const StatItem = ({
	icon: Icon,
	value,
}: {
	icon: LucideIcon;
	value: number;
}) => (
	<span className="inline-flex items-center gap-1">
		<Icon className="size-3.5 text-kumo-subtle" />
		<span className="text-xs font-medium tabular-nums text-kumo-subtle">
			{formatStat(value)}
		</span>
	</span>
);

const StatsDisplay = ({ stats }: { stats: StatsData }) => (
	<div className="flex items-center gap-3">
		<StatItem icon={STATS_ICONS.starCount} value={stats.starCount || 0} />
		<StatItem icon={STATS_ICONS.viewCount} value={stats.viewCount || 0} />
	</div>
);

function getUserInitials(name: string | null | undefined): string {
	if (!name?.trim()) return '?';
	const parts = name.trim().split(/\s+/);
	if (parts.length >= 2) {
		return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
	}
	return name.slice(0, 2).toUpperCase();
}

const UserAvatar = ({
	name,
	avatarUrl,
	className,
}: {
	name: string | null | undefined;
	avatarUrl: string | null | undefined;
	className?: string;
}) => (
	<Avatar
		className={cn(
			'size-8 shrink-0 ring-2 ring-kumo-base shadow-sm',
			className,
		)}
	>
		{avatarUrl ? (
			<AvatarImage src={avatarUrl} alt={name || 'User'} />
		) : null}
		<AvatarFallback className="bg-kumo-elevated text-[11px] font-semibold text-kumo-default">
			{getUserInitials(name)}
		</AvatarFallback>
	</Avatar>
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
		return (
			<div className="flex min-w-0 flex-1 items-center gap-2.5">
				<UserAvatar name={app.userName} avatarUrl={app.userAvatar} />
				<div className="flex min-w-0 flex-1 flex-col gap-0.5">
					<span className="truncate text-sm font-semibold leading-snug text-kumo-strong">
						{app.title}
					</span>
					<div className="flex min-w-0 items-center gap-2">
						{app.userName ? (
							<span className="truncate text-xs text-kumo-subtle">
								{app.userName}
							</span>
						) : null}
						{app.userName ? (
							<span className="text-kumo-subtle/40">·</span>
						) : null}
						<StatsDisplay stats={getAppStats(app)} />
					</div>
				</div>
			</div>
		);
	}

	if (
		layoutConfig.primaryMetadata === 'deployment' &&
		(isUserApp(app) || isEnhancedApp(app))
	) {
		const deploymentStatus = getDeploymentStatusInfo(app);
		return (
			<div className="flex min-w-0 flex-1 flex-col gap-0.5">
				<span className="truncate text-sm font-semibold leading-snug text-kumo-strong">
					{app.title}
				</span>
				<div className="flex items-center gap-2 text-sm">
					{deploymentStatus && !hasOverlayStatus && (
						<>
							<div className="flex items-center gap-1.5">
								<div
									className={cn(
										'size-1.5 rounded-full',
										deploymentStatus.color ===
											'text-green-500' &&
											'bg-kumo-success shadow-[0_0_0_3px] shadow-kumo-success/15',
										deploymentStatus.color ===
											'text-green-400' &&
											'bg-kumo-success animate-pulse shadow-[0_0_0_3px] shadow-kumo-success/15',
										deploymentStatus.color ===
											'text-gray-500' && 'bg-kumo-subtle/50',
									)}
								/>
								<span
									className={cn(
										'text-xs font-medium',
										deploymentStatus.color ===
											'text-green-500' &&
											'text-kumo-success',
										deploymentStatus.color ===
											'text-green-400' &&
											'text-kumo-success',
										deploymentStatus.color ===
											'text-gray-500' && 'text-kumo-subtle',
									)}
								>
									{deploymentStatus.text}
								</span>
							</div>
							<span className="text-kumo-subtle/40">·</span>
						</>
					)}
					<span className="text-xs text-kumo-subtle">
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

	return (
		<div className="flex min-w-0 flex-1 flex-col gap-0.5">
			<span className="truncate text-sm font-semibold text-kumo-strong">
				{app.title}
			</span>
			<span className="text-xs text-kumo-subtle">
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
		const deploymentState = getAppDeploymentStatus(app);
		const isDeploying = deploymentState === 'deploying';
		const isFailed = deploymentState === 'failed';

		const itemVariants = {
			hidden: { y: 12, opacity: 0 },
			visible: {
				y: 0,
				opacity: 1,
				transition: {
					type: 'spring' as const,
					stiffness: 260,
					damping: 24,
				},
			},
			exit: {
				y: -8,
				opacity: 0,
				scale: 0.98,
				transition: {
					duration: 0.18,
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
				className={cn('h-full', className)}
			>
				<a
					href={`/app/${app.id}`}
					onClick={(e) => {
						e.preventDefault();
						onClick(app.id);
					}}
					className="group block h-full no-underline outline-none"
				>
					<article
						className={cn(
							'relative flex h-full flex-col overflow-hidden rounded-2xl',
							'bg-kumo-base ring-1 ring-kumo-line/80',
							'shadow-[0_1px_2px_rgba(0,0,0,0.04)]',
							'hover:shadow-[0_12px_40px_-12px_rgba(0,0,0,0.18)]',
							'hover:ring-kumo-line',
							'focus-visible:ring-2 focus-visible:ring-kumo-brand/40',
						)}
					>
						<div className="relative aspect-[16/10] overflow-hidden bg-kumo-recessed">
							{app.screenshotUrl ? (
								<img
									src={app.screenshotUrl}
									alt={`${app.title} preview`}
									className={cn(
										'h-full w-full object-cover object-center',
										'scale-[1.01] duration-500 ease-out group-hover:scale-[1.05]',
										'bg-kumo-tint',
									)}
									loading="lazy"
									fetchPriority="low"
									sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
									srcSet={`${app.screenshotUrl} 1x, ${app.screenshotUrl} 1.5x, ${app.screenshotUrl} 2x, ${app.screenshotUrl} 3x`}
									decoding="async"
									onError={(e) => {
										const target = e.target as HTMLImageElement;
										target.style.opacity = '0';
										setTimeout(() => {
											target.style.display = 'none';
											const placeholder =
												target.parentElement?.querySelector(
													'.screenshot-placeholder',
												) as HTMLElement;
											if (placeholder) {
												placeholder.classList.remove('hidden');
												placeholder.style.opacity = '1';
											}
										}, 150);
									}}
									onLoad={(e) => {
										const target = e.target as HTMLImageElement;
										target.style.opacity = '1';
									}}
									style={{
										opacity: 0,
										transition: 'opacity 0.35s ease-out, transform 0.5s ease-out',
									}}
								/>
							) : null}

							<div
								className={cn(
									'screenshot-placeholder absolute inset-0 flex flex-col items-center justify-center',
									app.screenshotUrl ? 'hidden opacity-0' : 'opacity-100',
									'bg-[radial-gradient(ellipse_at_top,var(--color-kumo-tint)_0%,var(--color-kumo-recessed)_70%)]',
								)}
							>
								<div className="flex flex-col items-center gap-2.5 text-kumo-subtle">
									<div className="flex size-12 items-center justify-center rounded-2xl bg-kumo-base/70 ring-1 ring-kumo-hairline backdrop-blur-sm">
										<Code2 className="size-5" />
									</div>
									<span className="text-xs font-medium">
										Preview unavailable
									</span>
								</div>
							</div>

							{/* Bottom vignette for depth */}
							<div
								aria-hidden
								className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/20 via-black/5 to-transparent opacity-60"
							/>

							{/* Top gloss */}
							<div
								aria-hidden
								className="pointer-events-none absolute inset-x-0 top-0 h-1/4 bg-gradient-to-b from-white/10 to-transparent"
							/>

							{isDeploying && (
								<div
									className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-kumo-base/90 px-2 py-1 text-xs font-medium text-kumo-success shadow-sm ring-1 ring-kumo-success/20 backdrop-blur-md"
									title="App is deploying"
									aria-label="App deployment in progress"
								>
									<Loader2 className="size-3 animate-spin" />
									Deploying
								</div>
							)}

							{isFailed && (
								<div
									className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-kumo-base/90 px-2 py-1 text-xs font-medium text-kumo-subtle shadow-sm ring-1 ring-kumo-line backdrop-blur-md"
									title="Deployment failed"
									aria-label="App deployment failed"
								>
									<CloudOff className="size-3" />
									Failed
								</div>
							)}

							{showActions && (
								<div
									className="absolute right-3 top-3 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
									onClick={(e) => e.preventDefault()}
								>
									<AppActionsDropdown
										appId={app.id}
										appTitle={app.title}
										showOnHover={false}
										className="size-8 text-kumo-subtle hover:text-kumo-default bg-kumo-base/90 shadow-sm ring-1 ring-kumo-hairline backdrop-blur-md hover:bg-kumo-base"
										size="sm"
									/>
								</div>
							)}

							{(isUserApp(app) || isEnhancedApp(app)) && (
								<div className="absolute bottom-3 left-3 inline-flex items-center gap-1 rounded-full bg-kumo-base/90 px-2 py-1 text-kumo-subtle shadow-sm ring-1 ring-kumo-hairline backdrop-blur-md">
									{getVisibilityIcon(app.visibility)}
								</div>
							)}
						</div>

						<div className="flex items-center gap-2 px-3.5 py-3">
							<AppMetadata
								app={app}
								layoutConfig={layoutConfig}
								hasOverlayStatus={isDeploying || isFailed}
							/>

							{app.githubRepositoryUrl &&
								app.githubRepositoryVisibility !== 'private' && (
									<button
										type="button"
										className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-kumo-tint text-kumo-subtle ring-1 ring-kumo-hairline hover:bg-kumo-fill hover:text-kumo-default"
										onClick={(e) => {
											e.preventDefault();
											e.stopPropagation();
											if (app.githubRepositoryUrl) {
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
										<Github className="size-3.5" />
									</button>
								)}
						</div>
					</article>
				</a>
			</motion.div>
		);
	},
);

AppCard.displayName = 'AppCard';
