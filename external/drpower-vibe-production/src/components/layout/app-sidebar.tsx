import React from 'react';
import {
	Users,
	Settings,
	Plus,
	ChevronRight,
	Search,
	Globe,
	Lock,
	Users2,
	Bookmark,
	// LayoutGrid,
	Compass,
} from 'lucide-react';
import './sidebar-overrides.css';
import { useRecentApps, useFavoriteApps, useApps } from '@/hooks/use-apps';
import {
	Sidebar,
	SidebarContent,
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarMenu,
	SidebarMenuItem,
	SidebarMenuButton,
	SidebarMenuAction,
	SidebarSeparator,
	SidebarFooter,
	useSidebar,
} from '@/components/ui/sidebar';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAuth } from '@/contexts/auth-context';
import { useNavigate } from 'react-router';
import { cn } from '@/lib/utils';
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from '@/components/ui/tooltip';
import { formatDistanceToNow, isValid } from 'date-fns';
import { AppActionsDropdown } from '@/components/shared/AppActionsDropdown';

interface App {
	id: string;
	title: string;
	framework?: string | null;
	updatedAt: Date | null;
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

// Reusable AppMenuItem component for consistent app display
interface AppMenuItemProps {
	app: App;
	onClick: (id: string) => void;
	variant?: 'recent' | 'bookmarked';
	showActions?: boolean;
	isCollapsed: boolean;
	getVisibilityIcon: (visibility: App['visibility']) => React.ReactNode;
}

function AppMenuItem({
	app,
	onClick,
	variant = 'recent',
	showActions = true,
	isCollapsed,
	getVisibilityIcon,
}: AppMenuItemProps) {
	const formatTimestamp = () => {
		if (app.updatedAtFormatted) return app.updatedAtFormatted;
		if (app.updatedAt && isValid(app.updatedAt)) {
			return formatDistanceToNow(app.updatedAt, { addSuffix: true });
		}
		return 'Recently';
	};

	return (
		<SidebarMenuItem className="group/app-item">
			<SidebarMenuButton
				asChild
				tooltip={app.title}
				className="cursor-pointer transition-opacity hover:opacity-75 pr-0"
			>
				<a
					href={`/app/${app.id}`}
					onClick={(e) => {
						e.preventDefault();
						onClick(app.id);
					}}
					className="w-full no-underline"
				>
					<div className="flex-1 min-w-0 pr-2">
						<div className="flex items-center gap-2 min-w-0">
							{variant === 'bookmarked' && (
								<Bookmark className="h-3 w-3 fill-yellow-500 text-yellow-500 flex-shrink-0" />
							)}

							<div className="relative flex-1 min-w-0 overflow-hidden">
								<span className="font-medium flex justify-start  items-center  gap-2 text-text-primary/80 whitespace-nowrap">
									<span className="text-ellipsis w-fit overflow-hidden">
										{app.title}{' '}
									</span>
									<div className="flex-shrink-0 min-w-6">
										{getVisibilityIcon(app.visibility)}
									</div>
								</span>

								<div className="absolute inset-y-0 right-0 w-4 bg-gradient-to-l from-bg-2 to-transparent pointer-events-none" />
							</div>
						</div>
						<p className="text-xs text-text-tertiary truncate">
							{formatTimestamp()}
						</p>
					</div>
				</a>
			</SidebarMenuButton>

			{!isCollapsed && showActions && (
				<SidebarMenuAction
					asChild
					className="opacity-0 -mr-2 group-hover/app-item:opacity-100 transition-opacity"
				>
					<AppActionsDropdown
						appId={app.id}
						appTitle={app.title}
						size="sm"
						className="h-6 w-6"
						showOnHover={false}
					/>
				</SidebarMenuAction>
			)}
		</SidebarMenuItem>
	);
}

export function AppSidebar() {
	const { user } = useAuth();
	const navigate = useNavigate();
	const [searchQuery, setSearchQuery] = React.useState('');
	const [expandedGroups, setExpandedGroups] = React.useState<string[]>([
		'apps',
		'boards',
	]);
	const { state, setOpen } = useSidebar();
	const isCollapsed = state === 'collapsed';

	// Fetch real data from API
	const { apps: recentApps, moreAvailable } = useRecentApps();
	const { apps: favoriteApps } = useFavoriteApps();
	const { apps: allApps, loading: allAppsLoading } = useApps();

	const boards: Board[] = []; // Remove mock boards

	// Search functionality - filter all apps based on search query
	const searchResults = React.useMemo(() => {
		if (!searchQuery.trim()) return [];

		return allApps.filter((app) =>
			app.title.toLowerCase().includes(searchQuery.toLowerCase().trim()),
		);
	}, [allApps, searchQuery]);

	const isSearching = searchQuery.trim().length > 0;

	const getVisibilityIcon = (visibility: App['visibility']) => {
		switch (visibility) {
			case 'private':
				return <Lock className="h-3 w-3" />;
			case 'team':
				return <Users2 className="h-3 w-3" />;
			case 'board':
				return <Globe className="h-3 w-3" />;
			case 'public':
				return <Globe className="h-3 w-3" />;
		}
	};

	const toggleGroup = (group: string) => {
		setExpandedGroups((prev) =>
			prev.includes(group)
				? prev.filter((g) => g !== group)
				: [...prev, group],
		);
	};

	if (!user) return;

	return (
		<>
			<Sidebar
				collapsible="icon"
				className={cn(
					'bg-bg-2 transition-all duration-300 ease-in-out',
				)}
			>
				<SidebarContent className="mt-2">
					{/* Build Button */}
					<SidebarGroup>
						<SidebarGroupContent>
	
							{location.pathname !== '/' && (
								<div
									className={cn(
										isCollapsed ? ' pr-2' : 'px-1',
									)}
								>
									<TooltipProvider delayDuration={0}>
										<Tooltip>
											<TooltipTrigger asChild>
												<button
													className={cn(
														'group flex w-full border-[0.5px] border-bg-2 items-center gap-2 font-medium hover:opacity-80 hover:cursor-pointer p-2 rounded-md cursor-hand text-text-secondary hover:text-text-primary',
														isCollapsed
															? 'justify-center bg-accent'
															: 'justify-start bg-accent',
													)}
													onClick={() => {
														// Collapse sidebar when starting a new build
														if (!isCollapsed) {
															setOpen(false);
														}
														navigate('/');
													}}
												>
													<Plus className="h-4 w-4 text-neutral-50" />
													{!isCollapsed && (
														<span className="font-medium text-neutral-50">
															New build
														</span>
													)}
												</button>
											</TooltipTrigger>
										</Tooltip>
									</TooltipProvider>
								</div>
							)}
						</SidebarGroupContent>
					</SidebarGroup>

					{!isCollapsed && (
						<ScrollArea className="flex-1 px-1 relative">
							{/* Gradient fade overlay for app names at sidebar edge */}
							<div className="absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-bg-2 to-transparent pointer-events-none z-10"></div>
							{/* Navigation */}
							<SidebarGroup>
								{expandedGroups.includes('apps') && (
									<SidebarGroupContent>
										{/* Search */}
										<div className="relative bg-bg-3 mb-4 mt-2">
											<Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
											<Input
												placeholder="Search apps..."
												value={searchQuery}
												onChange={(e) =>
													setSearchQuery(
														e.target.value,
													)
												}
												className="h-10 w-full pl-8 placeholder:text-primary/40"
											/>
										</div>
										<SidebarMenu>
											{isSearching ? (
												// Search Results
												<>
													{allAppsLoading ? (
														<SidebarMenuItem>
															<div className="flex items-center justify-center py-4">
																<div className="text-sm text-text-tertiary">
																	Searching...
																</div>
															</div>
														</SidebarMenuItem>
													) : searchResults.length >
													  0 ? (
														<>
															<SidebarMenuItem>
																<div className="px-2 py-1 text-xs text-text-tertiary">
																	Found{' '}
																	{
																		searchResults.length
																	}{' '}
																	app
																	{searchResults.length !==
																	1
																		? 's'
																		: ''}
																</div>
															</SidebarMenuItem>
															{searchResults.map(
																(app) => (
																	<AppMenuItem
																		key={
																			app.id
																		}
																		app={
																			app
																		}
																		onClick={(
																			id,
																		) =>
																			navigate(
																				`/app/${id}`,
																			)
																		}
																		variant="recent"
																		showActions={
																			true
																		}
																		isCollapsed={
																			isCollapsed
																		}
																		getVisibilityIcon={
																			getVisibilityIcon
																		}
																	/>
																),
															)}
														</>
													) : (
														<SidebarMenuItem>
															<div className="flex items-center justify-center py-4">
																<div className="text-sm text-text-tertiary">
																	No apps
																	found for "
																	{
																		searchQuery
																	}
																	"
																</div>
															</div>
														</SidebarMenuItem>
													)}
												</>
											) : (
												// Normal Recent Apps View
												<>
													{recentApps.map((app) => (
														<AppMenuItem
															key={app.id}
															app={app}
															onClick={(id) =>
																navigate(
																	`/app/${id}`,
																)
															}
															variant="recent"
															showActions={true}
															isCollapsed={
																isCollapsed
															}
															getVisibilityIcon={
																getVisibilityIcon
															}
														/>
													))}
													{moreAvailable && (
														<SidebarMenuItem>
															<SidebarMenuButton
																onClick={() =>
																	navigate(
																		'/apps',
																	)
																}
																tooltip="View all apps"
																className="text-text-tertiary hover:text-text-primary view-all-button"
															>
																<ChevronRight className="h-4 w-4" />
																{!isCollapsed && (
																	<span className="font-medium text-text-primary/80">
																		View all
																		apps →
																	</span>
																)}
															</SidebarMenuButton>
														</SidebarMenuItem>
													)}
												</>
											)}
										</SidebarMenu>
									</SidebarGroupContent>
								)}
							</SidebarGroup>

							{/* Favorites */}
							{favoriteApps.length > 0 && (
								<>
									<SidebarSeparator />
									<SidebarGroup className='mt-4'>
										<SidebarGroupLabel
											className={cn(
												'flex items-center gap-2 text-md text-text-primary',
												isCollapsed &&
													'justify-center px-0',
											)}
										>
											{!isCollapsed && 'Bookmarked'}
											<Bookmark className="h-5 w-5 fill-yellow-500 text-yellow-500" />
											
										</SidebarGroupLabel>
										<SidebarGroupContent>
											<SidebarMenu>
												{favoriteApps.map((app) => (
													<AppMenuItem
														key={app.id}
														app={app}
														onClick={(id) =>
															navigate(
																`/app/${id}`,
															)
														}
														showActions={true}
														isCollapsed={
															isCollapsed
														}
														getVisibilityIcon={
															getVisibilityIcon
														}
													/>
												))}
											</SidebarMenu>
										</SidebarGroupContent>
									</SidebarGroup>
								</>
							)}

							{/* Boards */}
							{boards.length > 0 && (
								<>
									<SidebarSeparator />
									<SidebarGroup>
										<SidebarGroupLabel
											className={cn(
												'flex items-center cursor-pointer hover:text-text-primary transition-colors',
												isCollapsed
													? 'justify-center px-0'
													: 'justify-between',
											)}
											onClick={() =>
												toggleGroup('boards')
											}
										>
											{isCollapsed ? (
												<TooltipProvider
													delayDuration={0}
												>
													<Tooltip>
														<TooltipTrigger>
															<Users className="h-4 w-4" />
														</TooltipTrigger>
														<TooltipContent
															side="right"
															className="ml-2"
														>
															My Boards
														</TooltipContent>
													</Tooltip>
												</TooltipProvider>
											) : (
												<>
													<div className="flex items-center gap-2">
														<Users className="h-4 w-4" />
														<span>My Boards</span>
													</div>
													<ChevronRight
														className={cn(
															'h-4 w-4 transition-transform',
															expandedGroups.includes(
																'boards',
															) && 'rotate-90',
														)}
													/>
												</>
											)}
										</SidebarGroupLabel>
										{expandedGroups.includes('boards') && (
											<SidebarGroupContent>
												<SidebarMenu>
													{boards.map((board) => (
														<SidebarMenuItem
															key={board.id}
														>
															<SidebarMenuButton
																onClick={() =>
																	navigate(
																		`/boards/${board.slug}`,
																	)
																}
																tooltip={
																	board.name
																}
																className="board-item-button"
															>
																<div
																	className={cn(
																		'rounded-lg flex-shrink-0 flex items-center justify-center transition-colors',
																		'h-8 w-8',
																		isCollapsed
																			? 'bg-sidebar-accent'
																			: 'bg-sidebar-accent/50',
																	)}
																>
																	<Users2 className="h-4 w-4 text-sidebar-accent-foreground" />
																</div>
																{!isCollapsed && (
																	<div className="flex-1 min-w-0">
																		<p className="text-sm font-medium truncate">
																			{
																				board.name
																			}
																		</p>
																		<p className="text-xs text-text-tertiary truncate">
																			{
																				board.memberCount
																			}{' '}
																			members
																			•{' '}
																			{
																				board.appCount
																			}{' '}
																			apps
																		</p>
																	</div>
																)}
															</SidebarMenuButton>
														</SidebarMenuItem>
													))}
													<SidebarMenuItem>
														<SidebarMenuButton
															onClick={() =>
																navigate(
																	'/boards',
																)
															}
															tooltip="Browse all boards"
															className="text-text-tertiary hover:text-text-primary view-all-button"
														>
															<Plus className="h-4 w-4" />
															{!isCollapsed && (
																<span className="font-medium text-text-primary/80 ml-2">
																	Browse all
																	boards
																</span>
															)}
														</SidebarMenuButton>
													</SidebarMenuItem>
												</SidebarMenu>
											</SidebarGroupContent>
										)}
									</SidebarGroup>
								</>
							)}
						</ScrollArea>
					)}
				</SidebarContent>

				<SidebarFooter>
					{user && (
						<SidebarMenu>
							<SidebarMenuItem>
								<SidebarMenuButton
									id="discover-link"
									onClick={() => navigate('/discover')}
									tooltip="Discover"
									className="group hover:opacity-80 hover:cursor-pointer hover:bg-bg-1/50 transition-all duration-200"
								>
									<Compass className="h-6 w-6 text-text-primary/60 group-hover:text-primary/80 transition-colors" />
									{!isCollapsed && (
										<span className="text-text-primary/80 font-medium group-hover:text-primary transition-colors">
											Discover
										</span>
									)}
								</SidebarMenuButton>
							</SidebarMenuItem>
							<SidebarMenuItem>
								<SidebarMenuButton
									onClick={() => navigate('/settings')}
									tooltip="Settings"
									className="group hover:opacity-80 hover:cursor-pointer hover:bg-bg-1/50 transition-all duration-200"
								>
									<Settings className="h-6 w-6 text-text-primary/60 group-hover:text-primary/80 transition-colors" />
									{!isCollapsed && (
										<span className="font-medium text-text-primary/80 group-hover:text-primary transition-colors">
											Settings
										</span>
									)}
								</SidebarMenuButton>
							</SidebarMenuItem>
						</SidebarMenu>
					)}
				</SidebarFooter>
			</Sidebar>
		</>
	);
}
