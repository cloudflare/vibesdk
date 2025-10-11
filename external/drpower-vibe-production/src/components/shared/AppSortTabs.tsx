import React from 'react';
import { Clock, TrendingUp, ChevronDownIcon, Star } from 'lucide-react';
import type { AppSortOption } from '@/api-types';

interface SortOption {
  value: AppSortOption;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface AppSortTabsProps {
  value: AppSortOption;
  onValueChange: (value: AppSortOption) => void;
  availableSorts?: AppSortOption[];
  className?: string;
}

// Define all possible sort options with their display properties
const SORT_CONFIGURATIONS: Record<AppSortOption, SortOption> = {
  recent: {
    value: 'recent',
    label: 'Recent',
    icon: Clock
  },
  popular: {
    value: 'popular',
    label: 'Popular',
    icon: TrendingUp
  },
  trending: {
    value: 'trending',
    label: 'Trending',
    icon: TrendingUp
  },
  starred: {
    value: 'starred',
    label: 'Starred',
    icon: Star
  },
};

export const AppSortTabs: React.FC<AppSortTabsProps> = ({
  value,
  onValueChange,
  availableSorts = ['recent', 'popular', 'trending'],
}) => {
  const sortOptions = availableSorts.map((sortKey) => SORT_CONFIGURATIONS[sortKey]);

  return (<div className="grid grid-cols-1">
        <select
          id="location"
          name="location"
          value={value}
          onChange={(e) => onValueChange(e.target.value as AppSortOption)}
          className="col-start-1 row-start-1 w-full appearance-none rounded-md bg-white py-1.5 pl-3 pr-8 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 focus-visible:outline focus-visible:-outline-offset-2 focus-visible:outline-indigo-600 sm:text-sm/6 dark:bg-white/5 dark:text-white dark:outline-white/10 dark:*:bg-gray-800 dark:focus-visible:outline-indigo-500"
        >
          {sortOptions.map((e) => (<option key={e.value} value={e.value}>{e.label}</option>))}
        </select>
        <ChevronDownIcon
          aria-hidden="true"
          className="pointer-events-none col-start-1 row-start-1 mr-2 size-5 self-center justify-self-end text-gray-500 sm:size-4 dark:text-gray-400"
        />
      </div>);
};