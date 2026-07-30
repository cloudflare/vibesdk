import { Tabs } from '@cloudflare/kumo';
import { ClockIcon, TrendUpIcon, StarIcon } from '@phosphor-icons/react';
import type { AppSortOption } from '@/api-types';

interface SortOption {
	value: AppSortOption;
	label: string;
	icon: React.ComponentType<{
		className?: string;
		weight?: 'duotone' | 'regular';
	}>;
}

interface AppSortTabsProps {
	value: AppSortOption;
	onValueChange: (value: AppSortOption) => void;
	availableSorts?: AppSortOption[];
	className?: string;
}

const SORT_CONFIGURATIONS: Record<AppSortOption, SortOption> = {
	recent: {
		value: 'recent',
		label: 'Recent',
		icon: ClockIcon,
	},
	popular: {
		value: 'popular',
		label: 'Popular',
		icon: TrendUpIcon,
	},
	trending: {
		value: 'trending',
		label: 'Trending',
		icon: TrendUpIcon,
	},
	starred: {
		value: 'starred',
		label: 'Starred',
		icon: StarIcon,
	},
};

export function AppSortTabs({
	value,
	onValueChange,
	availableSorts = ['recent', 'popular', 'trending'],
	className,
}: AppSortTabsProps) {
	const sortOptions = availableSorts.map(
		(sortKey) => SORT_CONFIGURATIONS[sortKey],
	);

	return (
		<Tabs
			value={value}
			onValueChange={(next) => onValueChange(next as AppSortOption)}
			className={className}
			tabs={sortOptions.map((option) => {
				const Icon = option.icon;
				return {
					value: option.value,
					label: (
						<span className="inline-flex items-center gap-1.5">
							<span className="h-lh flex items-center">
								<Icon className="size-3.5" weight="duotone" />
							</span>
							{option.label}
						</span>
					),
				};
			})}
		/>
	);
}
