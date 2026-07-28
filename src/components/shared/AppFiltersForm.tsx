import React from 'react';
import { MagnifyingGlassIcon } from '@phosphor-icons/react';
import { Input, Button } from '@cloudflare/kumo';
import type { TimePeriod, AppSortOption } from '@/api-types';

interface AppFiltersFormProps {
	// Search props
	searchQuery: string;
	onSearchChange: (query: string) => void;
	onSearchSubmit: (e: React.FormEvent) => void;
	searchPlaceholder?: string;
	showSearchButton?: boolean;

	// Framework filter props
	filterFramework: string;
	onFrameworkChange: (framework: string) => void;

	// Visibility filter props (optional - only for user apps)
	filterVisibility?: string;
	onVisibilityChange?: (visibility: string) => void;
	showVisibility?: boolean;

	// Time period props (conditional)
	period?: TimePeriod;
	onPeriodChange?: (period: TimePeriod) => void;
	sortBy?: AppSortOption;

	// Layout props
	className?: string;
}

export const AppFiltersForm: React.FC<AppFiltersFormProps> = ({
	searchQuery,
	onSearchChange,
	onSearchSubmit,
	searchPlaceholder = 'Search apps...',
	showSearchButton = false,
	className = '',
}) => {
	return (
		<div className={`max-w-4xl ${className}`}>
			<form onSubmit={onSearchSubmit} className="flex gap-2 mb-4">
				<div className="relative">
					<MagnifyingGlassIcon
						weight="duotone"
						className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-tertiary"
					/>
					<Input
						type="text"
						placeholder={searchPlaceholder}
						value={searchQuery}
						onChange={(e) => onSearchChange(e.target.value)}
						className="pl-10 w-90"
					/>
				</div>

				{showSearchButton && <Button type="submit">Search</Button>}
			</form>
		</div>
	);
};
