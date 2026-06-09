import { useNavigate, useSearchParams } from 'react-router';
import { motion } from 'framer-motion';
import { usePaginatedApps } from '@/hooks/use-paginated-apps';
import { AppListContainer } from '@/components/shared/AppListContainer';
import { AppFiltersForm } from '@/components/shared/AppFiltersForm';
import { AppSortTabs } from '@/components/shared/AppSortTabs';
import type { AppSortOption } from '@/api-types';

export default function DiscoverPage() {
	const navigate = useNavigate();
	const [searchParams, setSearchParams] = useSearchParams();

	// Derive initial sort from URL or localStorage, fallback to 'popular'
	const allowedSorts: AppSortOption[] = ['recent', 'popular', 'trending', 'starred'];
	const sortParam = searchParams.get('sort') as AppSortOption | null;
	const savedSort = (typeof localStorage !== 'undefined' ? localStorage.getItem('discover.sort') : null) as AppSortOption | null;
	const initialSort: AppSortOption = (sortParam && allowedSorts.includes(sortParam))
		? sortParam
		: (savedSort && allowedSorts.includes(savedSort) ? savedSort : 'popular');

	const {
		// Filter state
		searchQuery,
		setSearchQuery,
		filterFramework,
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
		handlePeriodChange,
		handleFrameworkChange,

		handleSortChange,

		// Pagination handlers

		refetch,
		loadMore,
	} = usePaginatedApps({
		type: 'public',
		defaultSort: initialSort,
		defaultPeriod: 'week',
		limit: 20,
	});

	return (
		<div className="min-h-screen">
			<div className="container mx-auto px-4 py-8">
				<motion.div
					initial={{ opacity: 0, y: -20 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.5 }}
				>
					{/* Header */}
					<div className="mb-8">
						<h1 className="text-6xl font-bold mb-3 font-[departureMono] text-accent">
							DISCOVER
						</h1>
						<p className="text-text-tertiary text-lg">
							Explore apps built by the community
						</p>
					</div>

					<div className="flex items-start gap-4 justify-between">
						{/* Search and Filters */}
						<AppFiltersForm
							searchQuery={searchQuery}
							onSearchChange={setSearchQuery}
							onSearchSubmit={handleSearchSubmit}
							searchPlaceholder="Search apps..."
							showSearchButton={true}
							filterFramework={filterFramework}
							period={period}
							onFrameworkChange={handleFrameworkChange}
							onPeriodChange={handlePeriodChange}
							sortBy={sortBy}
					/>

						{/* Sort Tabs */}
					<AppSortTabs
						value={sortBy}
						onValueChange={(v) => {
							handleSortChange(v);
							// Persist to URL and localStorage
							try { localStorage.setItem('discover.sort', v); } catch {
								console.error('Failed to persist sort to localStorage');
							}
							const next = new URLSearchParams(searchParams);
							next.set('sort', v);
							setSearchParams(next, { replace: true });
						}}
						availableSorts={['recent', 'popular', 'trending', 'starred']}
					/>
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
						onLoadMore={loadMore}
						onRetry={refetch}
						showUser={true}
						showStats={true}
						infiniteScroll={true}
					/>
				</motion.div>
			</div>
		</div>
	);
}
