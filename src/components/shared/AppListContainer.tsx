import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, RefreshCw, X, Code2 } from 'lucide-react';
import { SkeletonLine } from '@cloudflare/kumo';
import { Button } from '@/components/ui/button';
import { AppCard } from './AppCard';
import type { AppListData } from '@/hooks/use-paginated-apps';
import type { AppSortOption } from '@/api-types';
import { useInfiniteScroll } from '@/hooks/use-infinite-scroll';

interface AppListContainerProps {
	apps: AppListData[];
	loading: boolean;
	loadingMore: boolean;
	error: string | null;
	hasMore: boolean;
	totalCount: number;
	sortBy: AppSortOption;
	onAppClick: (appId: string) => void;
	onToggleFavorite?: (appId: string) => void;
	onLoadMore: () => void;
	onRetry: () => void;
	showUser?: boolean;
	showStats?: boolean;
	showActions?: boolean;
	infiniteScroll?: boolean;
	emptyState?: {
		title?: string;
		description?: string;
		action?: React.ReactNode;
	};
	className?: string;
}

const containerVariants = {
	hidden: { opacity: 0 },
	visible: {
		opacity: 1,
		transition: {
			staggerChildren: 0.05, // Reduced from 0.1 for faster animation
		},
	},
};

const AppCardSkeleton = ({ showUser = false }: { showUser?: boolean }) => (
	<div className="flex h-full flex-col overflow-hidden rounded-2xl bg-kumo-base shadow-[0_1px_2px_rgba(0,0,0,0.04)] ring-1 ring-kumo-line/80">
		<div className="aspect-[16/10] overflow-hidden bg-kumo-recessed">
			<SkeletonLine
				className="h-full w-full rounded-none"
				minWidth={100}
				maxWidth={100}
			/>
		</div>
		<div className="flex items-center gap-2.5 px-3.5 py-3">
			{showUser && (
				<div className="size-8 shrink-0 overflow-hidden rounded-full ring-2 ring-kumo-base">
					<SkeletonLine
						className="h-full w-full rounded-full"
						minWidth={100}
						maxWidth={100}
					/>
				</div>
			)}
			<div className="flex min-w-0 flex-1 flex-col gap-1">
				<SkeletonLine
					className="h-3.5"
					minWidth={45}
					maxWidth={75}
					blockHeight={18}
				/>
				<div className="flex items-center gap-2">
					<SkeletonLine
						className="h-2.5 w-14"
						minWidth={100}
						maxWidth={100}
					/>
					<SkeletonLine
						className="h-2.5 w-8"
						minWidth={100}
						maxWidth={100}
					/>
				</div>
			</div>
		</div>
	</div>
);

const AppCardSkeletonGrid = ({
	count = 8,
	showUser = false,
}: {
	count?: number;
	showUser?: boolean;
}) => (
	<div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
		{[...Array(count)].map((_, i) => (
			<AppCardSkeleton key={`skeleton-${i}`} showUser={showUser} />
		))}
	</div>
);

const getEmptyStateDefaults = (sortBy: AppSortOption, totalCount: number) => {
	if (totalCount === 0) {
		// No apps at all
		return {
			title: 'No apps yet',
			description: 'Start building your first app with AI assistance.',
		};
	}

	// Apps exist but current filter/sort shows none
	switch (sortBy) {
		case 'popular':
			return {
				title: 'No popular apps yet',
				description:
					'Apps will appear here once they start getting views, stars, or forks.',
			};
		case 'starred':
			return {
				title: 'No bookmarked apps yet',
				description:
					'Apps you bookmark will appear here. Click the bookmark icon on any app to add it.',
			};
		case 'trending':
			return {
				title: 'No trending apps yet',
				description:
					'Apps will appear here based on recent activity and engagement.',
			};
		case 'recent':
		default:
			return {
				title: 'No apps match your filters',
				description:
					"Try adjusting your search or filters to find what you're looking for.",
			};
	}
};

export const AppListContainer: React.FC<AppListContainerProps> = ({
	apps,
	loading,
	loadingMore,
	error,
	hasMore,
	totalCount,
	sortBy,
	onAppClick,
	onToggleFavorite,
	onLoadMore,
	onRetry,
	showUser = false,
	showStats = true,
	showActions = false,
	infiniteScroll = true,
	emptyState,
	className = '',
}) => {
	const defaultEmptyState = getEmptyStateDefaults(sortBy, totalCount);

	const { triggerRef } = useInfiniteScroll({
		threshold: 200,
		enabled: infiniteScroll && hasMore && !loadingMore,
		onLoadMore: onLoadMore,
	});

	if (loading) {
		return (
			<div className={className}>
				<AppCardSkeletonGrid count={8} showUser={showUser} />
			</div>
		);
	}

	if (error) {
		return (
			<div className="text-center py-20">
				<div className="rounded-full bg-destructive/10 p-3 mb-4 inline-flex">
					<X className="h-6 w-6 text-destructive" />
				</div>
				<h3 className="text-xl text-text-secondary font-semibold mb-2">
					Failed to load apps
				</h3>
				<p className="text-kumo-subtle mb-6">{error}</p>
				<Button onClick={onRetry} variant="outline">
					<RefreshCw className="h-4 w-4 mr-2" />
					Retry
				</Button>
			</div>
		);
	}

	if (apps.length === 0) {
		const emptyStateContent = emptyState || defaultEmptyState;

		return (
			<div className="text-center py-20">
				<Code2 className="h-16 w-16 mx-auto mb-4 text-kumo-subtle" />
				<h3 className="text-xl font-semibold mb-2 text-kumo-subtle">
					{emptyStateContent.title}
				</h3>
				<p className="text-kumo-subtle mb-6">
					{emptyStateContent.description}
				</p>
				{'action' in emptyStateContent && emptyStateContent.action}
			</div>
		);
	}

	return (
		<div className={className}>
			<motion.div
				variants={containerVariants}
				initial="hidden"
				animate="visible"
				className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
			>
				<AnimatePresence mode="popLayout">
					{apps.map((app) => (
						<AppCard
							key={app.id}
							app={app}
							onClick={onAppClick}
							onToggleFavorite={onToggleFavorite}
							showStats={showStats}
							showUser={showUser}
							showActions={showActions}
						/>
					))}
				</AnimatePresence>
			</motion.div>

			{infiniteScroll && hasMore && (
				<div
					ref={triggerRef}
					className="relative mt-8"
					style={{ height: loadingMore ? 'auto' : '80px' }}
				>
					{loadingMore && (
						<motion.div
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							transition={{ duration: 0.3 }}
						>
							<AppCardSkeletonGrid
								count={4}
								showUser={showUser}
							/>
						</motion.div>
					)}
				</div>
			)}

			{!infiniteScroll && loadingMore && (
				<div className="flex justify-center mt-8">
					<div className="flex items-center gap-2 text-kumo-subtle">
						<Loader2 className="h-4 w-4 animate-spin" />
						<span className="text-sm">Loading more apps...</span>
					</div>
				</div>
			)}

			{!infiniteScroll && hasMore && (
				<div className="flex justify-center mt-8">
					<Button
						onClick={onLoadMore}
						disabled={loadingMore}
						variant="outline"
						className="gap-2"
					>
						{loadingMore ? (
							<>
								<Loader2 className="h-4 w-4 animate-spin" />
								Loading more...
							</>
						) : (
							<>Load more apps</>
						)}
					</Button>
				</div>
			)}

			{/* Show total count */}
			{totalCount > 0 && (
				<div className="text-left mt-6 text-sm text-kumo-subtle">
					Showing {apps.length} of {totalCount} apps
				</div>
			)}
		</div>
	);
};
