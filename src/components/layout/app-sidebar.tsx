import React from 'react';
import {
	ChevronRight,
	Plus,
	PlusIcon,
	Search,
	Users,
} from 'lucide-react';
import {
	BookmarkSimpleIcon,
	CompassIcon,
	GlobeHemisphereWestIcon,
	LockKey,
	UsersThree,
} from '@phosphor-icons/react';
import { isValid } from 'date-fns';
import { useLocation, useNavigate } from 'react-router';
import {
	CloudflareLogo,
	InputGroup,
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarHeader,
	SidebarGroupLabel,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarSeparator,
	SidebarTrigger,
	useSidebar,
} from '@cloudflare/kumo';
import { useAuth } from '@/contexts/auth-context';
import { useApps, useFavoriteApps, useRecentApps } from '@/hooks/use-apps';
import { AppActionsDropdown } from '@/components/shared/AppActionsDropdown';
import { AuthButton } from '@/components/auth/auth-button';
import { ThemeToggle } from '@/components/theme-toggle';
import { cn } from '@/lib/utils';

interface App {
	id: string;
	title: string;
	framework?: string | null;
	updatedAt: Date | string | null;
	updatedAtFormatted?: string;
	visibility: 'private' | 'team' | 'board' | 'public';
	isFavorite?: boolean;
}

interface Board {
	id: string;
	name: string;
	slug: string;
	memberCount: number;
	appCount: number;
	iconUrl?: string | null;
}

interface AppMenuItemProps {
	app: App;
	onClick: (id: string) => void;
	active?: boolean;
	variant?: 'recent' | 'bookmarked';
	showActions?: boolean;
	isCollapsed: boolean;
	getVisibilityIcon: (visibility: App['visibility']) => React.ReactNode;
}

function AppMenuItem({
	app,
	onClick,
	active = false,
	variant = 'recent',
	showActions = true,
	isCollapsed,
	getVisibilityIcon,
}: AppMenuItemProps) {
	const formatTimestamp = () => {
		const updatedAt =
			app.updatedAt instanceof Date
				? app.updatedAt
				: app.updatedAt
					? new Date(app.updatedAt)
					: null;

		if (updatedAt && isValid(updatedAt)) {
			const diffInSeconds = Math.floor(
				(Date.now() - updatedAt.getTime()) / 1000,
			);

			if (diffInSeconds < 60) return 'now';
			if (diffInSeconds < 3600)
				return `${Math.floor(diffInSeconds / 60)}m ago`;
			if (diffInSeconds < 86400)
				return `${Math.floor(diffInSeconds / 3600)}h ago`;
			if (diffInSeconds < 604800)
				return `${Math.floor(diffInSeconds / 86400)}d ago`;
			if (diffInSeconds < 2592000)
				return `${Math.floor(diffInSeconds / 604800)}w ago`;
			if (diffInSeconds < 31536000)
				return `${Math.floor(diffInSeconds / 2592000)}mo ago`;
			return `${Math.floor(diffInSeconds / 31536000)}y ago`;
		}
		if (app.updatedAtFormatted) return app.updatedAtFormatted;
		return 'Recently';
	};

	return (
		<SidebarMenuItem className="group/app-item">
			<SidebarMenuButton
				active={active}
				href={`/app/${app.id}`}
				tooltip={app.title}
				className="min-h-12 items-start py-2 pr-9 text-sm"
				onClick={(event) => {
					event.preventDefault();
					onClick(app.id);
				}}
			>
				<span className="flex min-w-0 flex-1 flex-col gap-1">
					<span className="flex min-w-0 items-center gap-1.5 text-kumo-default">
						{variant === 'bookmarked' && (
							<BookmarkSimpleIcon
								className="size-3.5 shrink-0"
								weight="duotone"
							/>
						)}
						<span className="truncate">{app.title}</span>
					</span>
					<span className="flex min-w-0 items-center gap-1.5 truncate text-xs font-normal text-kumo-subtle">
						<span className="shrink-0">
							{getVisibilityIcon(app.visibility)}
						</span>
						<span className="shrink-0">•</span>
						<span className="truncate">{formatTimestamp()}</span>
					</span>
				</span>
			</SidebarMenuButton>

			{!isCollapsed && showActions && (
				<div className="absolute right-1.5 top-1/2 z-10 -translate-y-1/2 opacity-0 transition-opacity group-hover/app-item:opacity-100 focus-within:opacity-100">
					<AppActionsDropdown
						appId={app.id}
						appTitle={app.title}
						size="sm"
						className="size-7"
						showOnHover={false}
					/>
				</div>
			)}
		</SidebarMenuItem>
	);
}

export function AppSidebar() {
	const { user } = useAuth();
	const navigate = useNavigate();
	const { pathname } = useLocation();
	const [searchQuery, setSearchQuery] = React.useState('');
	const [expandedGroups, setExpandedGroups] = React.useState<string[]>([
		'apps',
		'boards',
	]);
	const { state } = useSidebar();
	const isCollapsed = state === 'collapsed';

	const { apps: recentApps, moreAvailable } = useRecentApps();
	const { apps: favoriteApps } = useFavoriteApps();
	const { apps: allApps, loading: allAppsLoading } = useApps();

	const boards: Board[] = [];

	const searchResults = React.useMemo(() => {
		const normalizedQuery = searchQuery.toLowerCase().trim();
		if (!normalizedQuery) return [];

		return allApps.filter((app) =>
			app.title.toLowerCase().includes(normalizedQuery),
		);
	}, [allApps, searchQuery]);

	const isSearching = searchQuery.trim().length > 0;

	const favoriteAppIds = React.useMemo(
		() => new Set(favoriteApps.map((app) => app.id)),
		[favoriteApps],
	);

	const appsWithoutBookmarks = React.useMemo(
		() => recentApps.filter((app) => !favoriteAppIds.has(app.id)),
		[recentApps, favoriteAppIds],
	);

	const showAppsSection =
		isSearching ||
		appsWithoutBookmarks.length > 0 ||
		moreAvailable;

	const getVisibilityIcon = (visibility: App['visibility']) => {
		switch (visibility) {
			case 'private':
				return <LockKey className="size-3.5" weight="duotone" />;
			case 'team':
				return <UsersThree className="size-3.5" weight="duotone" />;
			case 'board':
				return (
					<GlobeHemisphereWestIcon
						className="size-3.5"
						weight="duotone"
					/>
				);
			case 'public':
				return (
					<GlobeHemisphereWestIcon
						className="size-3.5"
						weight="duotone"
					/>
				);
		}
	};

	const toggleGroup = (group: string) => {
		setExpandedGroups((prev) =>
			prev.includes(group)
				? prev.filter((g) => g !== group)
				: [...prev, group],
		);
	};

	// if (!user) return null;

	return (
		<Sidebar contentClassName="bg-kumo-elevated">
			<SidebarHeader className="h-12 justify-start px-4">
				<div className="flex items-center gap-2.5 text-kumo-strong">
					<CloudflareLogo
						variant="glyph"
						className="size-7 shrink-0"
					/>
					<span className="truncate text-sm font-black font-funky-mono uppercase tracking-[0.25em] group-data-[state=collapsed]/sidebar:hidden group-data-[mobile=true]/sidebar:inline">
						Build
					</span>
				</div>
			</SidebarHeader>
			<SidebarContent>
				<SidebarGroup className="gap-2 py-1">
					<SidebarMenu className="gap-1">
						{pathname !== '/' && (
							<Sidebar.MenuButton
								icon={PlusIcon}
								className={cn(
									'bg-brand/80 text-white',
								)}
								tooltip="New build"
								onClick={() => navigate('/')}
							>
								New build
							</Sidebar.MenuButton>
						)}

						<Sidebar.MenuButton
							active={pathname === '/discover'}
							icon={CompassIcon}
							id="discover-link"
							tooltip="Discover"
							onClick={() => navigate('/discover')}
						>
							Discover
						</Sidebar.MenuButton>

						{!isCollapsed && user && (
							<InputGroup>
								<InputGroup.Addon>
									<Search className="size-3.5 text-kumo-subtle" />
								</InputGroup.Addon>
								<InputGroup.Input
									aria-label="Search apps"
									placeholder="Search apps"
									value={searchQuery}
									onChange={(event) =>
										setSearchQuery(event.target.value)
									}
								/>
							</InputGroup>
						)}
					</SidebarMenu>
				</SidebarGroup>

				{!isCollapsed && favoriteApps.length > 0 && (
					<SidebarGroup className="">
						<SidebarGroupLabel className="flex items-center">
							<span className="text-xs font-funky-mono">
								Bookmarked
							</span>
						</SidebarGroupLabel>
						<SidebarMenu>
							{favoriteApps.map((app) => (
								<AppMenuItem
									key={app.id}
									app={app}
									active={pathname === `/app/${app.id}`}
									onClick={(id) => navigate(`/app/${id}`)}
									variant="bookmarked"
									isCollapsed={isCollapsed}
									getVisibilityIcon={getVisibilityIcon}
								/>
							))}
						</SidebarMenu>
					</SidebarGroup>
				)}

				{!isCollapsed &&
					showAppsSection &&
					expandedGroups.includes('apps') && (
						<SidebarGroup className="">
							<SidebarMenu>
								<SidebarGroupLabel className="flex items-center">
									<span className="text-xs font-funky-mono">
										Apps
									</span>
								</SidebarGroupLabel>
								{isSearching ? (
									<>
										{allAppsLoading ? (
											<SidebarMenuItem>
												<div className="px-3 py-3 text-sm text-kumo-subtle">
													Searching...
												</div>
											</SidebarMenuItem>
										) : searchResults.length > 0 ? (
											<>
												<SidebarMenuItem>
													<div className="px-3 pb-1 text-xs text-kumo-subtle">
														Found{' '}
														{searchResults.length}{' '}
														app
														{searchResults.length !==
														1
															? 's'
															: ''}
													</div>
												</SidebarMenuItem>
												{searchResults.map((app) => (
													<AppMenuItem
														key={app.id}
														app={app}
														active={
															pathname ===
															`/app/${app.id}`
														}
														onClick={(id) =>
															navigate(
																`/app/${id}`,
															)
														}
														isCollapsed={
															isCollapsed
														}
														getVisibilityIcon={
															getVisibilityIcon
														}
													/>
												))}
											</>
										) : (
											<SidebarMenuItem>
												<div className="px-3 py-3 text-sm text-kumo-subtle">
													No apps found for "
													{searchQuery}"
												</div>
											</SidebarMenuItem>
										)}
									</>
								) : (
									<>
										{appsWithoutBookmarks.map((app) => (
											<AppMenuItem
												key={app.id}
												app={app}
												active={
													pathname ===
													`/app/${app.id}`
												}
												onClick={(id) =>
													navigate(`/app/${id}`)
												}
												isCollapsed={isCollapsed}
												getVisibilityIcon={
													getVisibilityIcon
												}
											/>
										))}
										{moreAvailable && (
											<SidebarMenuButton
												active={pathname === '/apps'}
												icon={
													<ChevronRight className="size-4 text-kumo-subtle" />
												}
												tooltip="View all apps"
												onClick={() =>
													navigate('/apps')
												}
											>
												View all apps
											</SidebarMenuButton>
										)}
									</>
								)}
							</SidebarMenu>
						</SidebarGroup>
					)}

				{!isCollapsed && boards.length > 0 && (
					<>
						<SidebarSeparator />
						<SidebarGroup className="py-2">
							<SidebarGroupLabel
								className="cursor-pointer"
								onClick={() => toggleGroup('boards')}
							>
								<span className="flex items-center justify-between">
									<span className="flex items-center gap-2">
										<Users className="size-3.5" />
										<span>My Boards</span>
									</span>
									<ChevronRight
										className={cn(
											'size-3.5 transition-transform',
											expandedGroups.includes('boards') &&
												'rotate-90',
										)}
									/>
								</span>
							</SidebarGroupLabel>
							{expandedGroups.includes('boards') && (
								<SidebarMenu>
									{boards.map((board) => (
										<SidebarMenuButton
											key={board.id}
											icon={
												<UsersThree
													className="size-4"
													weight="duotone"
												/>
											}
											tooltip={board.name}
											onClick={() =>
												navigate(
													`/boards/${board.slug}`,
												)
											}
										>
											<span className="flex min-w-0 flex-col gap-0.5">
												<span className="truncate">
													{board.name}
												</span>
												<span className="truncate text-xs font-normal text-kumo-subtle">
													{board.memberCount} members
													/ {board.appCount} apps
												</span>
											</span>
										</SidebarMenuButton>
									))}
									<SidebarMenuButton
										icon={
											<Plus className="size-4 text-kumo-subtle" />
										}
										tooltip="Browse all boards"
										onClick={() => navigate('/boards')}
									>
										Browse all boards
									</SidebarMenuButton>
								</SidebarMenu>
							)}
						</SidebarGroup>
					</>
				)}
			</SidebarContent>

			<SidebarFooter className="h-auto border-t border-kumo-line p-3">
				<div className="flex min-w-0 w-full items-center gap-2 group-data-[state=collapsed]/sidebar:flex-col">
					{(!isCollapsed || user) && (
						<div className="flex-1">
							<AuthButton
								display="sidebar"
								className="group-data-[state=collapsed]/sidebar:size-9 group-data-[state=collapsed]/sidebar:flex-none group-data-[state=collapsed]/sidebar:justify-center group-data-[state=collapsed]/sidebar:px-0 w-full"
							/>
						</div>
					)}
					<ThemeToggle
						align="end"
						className="size-9 shrink-0 rounded-lg group-data-[state=collapsed]/sidebar:ml-0"
					/>
					<SidebarTrigger
						aria-label={
							isCollapsed ? 'Open sidebar' : 'Collapse sidebar'
						}
						className="ml-auto size-9 shrink-0 rounded-lg border border-kumo-line bg-kumo-base text-kumo-subtle shadow-none hover:bg-kumo-tint hover:text-kumo-default group-data-[state=collapsed]/sidebar:ml-0"
					/>
				</div>
			</SidebarFooter>
		</Sidebar>
	);
}
