import { useNavigate, useSearchParams } from 'react-router';
import { motion } from 'framer-motion';
import { toggleFavorite } from '@/hooks/use-apps';
import { usePaginatedApps } from '@/hooks/use-paginated-apps';
import { AppListContainer } from '@/components/shared/AppListContainer';
import { AppFiltersForm } from '@/components/shared/AppFiltersForm';
import { AppSortTabs } from '@/components/shared/AppSortTabs';
import { VisibilityFilter } from '@/components/shared/VisibilityFilter';
import type { AppSortOption } from '@/api-types';

export default function AppsPage() {
	const navigate = useNavigate();
	const [searchParams, setSearchParams] = useSearchParams();

	// Derive initial sort from URL or localStorage, fallback to 'recent'
	const allowedSorts: AppSortOption[] = ['recent', 'popular', 'trending', 'starred'];
	const sortParam = searchParams.get('sort') as AppSortOption | null;
	const savedSort = (typeof localStorage !== 'undefined' ? localStorage.getItem('apps.sort') : null) as AppSortOption | null;
	const initialSort: AppSortOption = (sortParam && allowedSorts.includes(sortParam))
		? sortParam
		: (savedSort && allowedSorts.includes(savedSort) ? savedSort : 'recent');

	const {
		// Filter state
		searchQuery,
		setSearchQuery,
		filterFramework,
		filterVisibility,
		sortBy,
		period,

		// Data state
		apps,
		loading,
		loadingMore,
		error,
		totalCount,
		hasMore,

		// Form handlers
		handleSearchSubmit,
		handleSortChange,
		handlePeriodChange,
		handleFrameworkChange,
		handleVisibilityChange,

		// Pagination handlers
		refetch,
		loadMore,
	} = usePaginatedApps({
		type: 'user',
		defaultSort: initialSort,
		includeVisibility: true,
		limit: 20,
	});

	const handleToggleFavorite = async (appId: string) => {
		try {
			await toggleFavorite(appId);
			refetch();
		} catch (error) {
			console.error('Failed to toggle favorite:', error);
		}
	};

	return (
		<div className="min-h-screen bg-bg-3">
			<div className="container mx-auto px-4 py-8">
				<motion.div
					initial={{ opacity: 0, y: -20 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.5 }}
				>
					{/* Header */}
					<div className="mb-8">
						<h1 className="text-6xl font-bold mb-3 font-[departureMono] text-accent">
							MY APPS
						</h1>
						<p className="text-text-tertiary text-lg">
							{loading
								? 'Loading...'
								: `${totalCount} app${totalCount !== 1 ? 's' : ''} in your workspace`}
						</p>
					</div>

					<div className="flex flex-col gap-4">
						<div className="flex items-center gap-4">
							<VisibilityFilter
								value={filterVisibility}
								onChange={handleVisibilityChange}
							/>
						</div>
						
						<div className="flex items-start gap-4 justify-between">
							{/* Search and Filters */}
							<AppFiltersForm
								searchQuery={searchQuery}
								onSearchChange={setSearchQuery}
								onSearchSubmit={handleSearchSubmit}
								searchPlaceholder="Search your apps..."
								filterFramework={filterFramework}
								onFrameworkChange={handleFrameworkChange}
								filterVisibility={filterVisibility}
								onVisibilityChange={handleVisibilityChange}
								showVisibility={false}
								period={period}
								onPeriodChange={handlePeriodChange}
								sortBy={sortBy}
							/>

							<AppSortTabs
								value={sortBy}
								onValueChange={(v) => {
									handleSortChange(v);
									// Persist to URL and localStorage
									try { localStorage.setItem('apps.sort', v); } catch {
                                        console.error('Failed to persist sort to localStorage');
									}
									const next = new URLSearchParams(searchParams);
									next.set('sort', v);
									setSearchParams(next, { replace: true });
								}}
								availableSorts={['recent', 'popular', 'trending', 'starred']}
							/>
						</div>
					</div>

					{/* Unified App List */}
					<AppListContainer
						apps={apps}
						loading={loading}
						loadingMore={loadingMore}
						error={error}
						hasMore={hasMore}
						totalCount={totalCount}
						sortBy={sortBy}
						onAppClick={(appId) => navigate(`/app/${appId}`)}
						onToggleFavorite={handleToggleFavorite}
						onLoadMore={loadMore}
						onRetry={refetch}
						showUser={false}
						showStats={true}
						showActions={true}
						infiniteScroll={true}
						emptyState={
							!searchQuery &&
							filterFramework === 'all' &&
							filterVisibility === 'all' &&
							sortBy === 'recent' &&
							totalCount === 0
								? {
										title: 'No apps yet',
										description:
											'Start building your first app with AI assistance.',
										action: <div></div>,
									}
								: undefined
						}
					/>
				</motion.div>
			</div>
		</div>
	);
}
