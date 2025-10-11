import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from 'lucide-react';
import type { TimePeriod } from '@/api-types';

interface TimePeriodSelectorProps {
  value: TimePeriod;
  onValueChange: (period: TimePeriod) => void;
  className?: string;
  disabled?: boolean;
  showForSort?: 'popular' | 'trending' | 'all'; // Show only for certain sort types
}

const TIME_PERIODS: Array<{
  value: TimePeriod;
  label: string;
  shortLabel: string;
}> = [
  { value: 'today', label: 'Today', shortLabel: 'Today' },
  { value: 'week', label: 'This Week', shortLabel: 'Week' },
  { value: 'month', label: 'This Month', shortLabel: 'Month' },
  { value: 'all', label: 'All Time', shortLabel: 'All' },
];

export const TimePeriodSelector: React.FC<TimePeriodSelectorProps> = ({
  value,
  onValueChange,
  className,
  disabled,
  showForSort = 'all'
}) => {
  // Don't show the selector for 'recent' sort - it doesn't make sense
  if (showForSort !== 'all' && showForSort !== 'popular' && showForSort !== 'trending') {
    return null;
  }

  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger className={className}>
        <Calendar className="h-4 w-4" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {TIME_PERIODS.map((period) => (
          <SelectItem key={period.value} value={period.value}>
            {period.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};