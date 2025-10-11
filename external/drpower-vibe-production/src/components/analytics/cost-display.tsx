/**
 * Clean Cost Display Component
 * Minimal, theme-integrated cost display for analytics data
 */

import { DollarSign } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCost, type AnalyticsDisplayProps } from '@/utils/analytics';

interface CostDisplayProps extends AnalyticsDisplayProps {
  loading?: boolean;
  variant?: 'inline' | 'card';
  className?: string;
  label?: string;
}

export function CostDisplay({
  cost,
  loading = false,
  variant = 'inline',
  className,
  label
}: CostDisplayProps) {
  if (loading) {
    return (
      <div className={cn(
        'animate-pulse',
        variant === 'inline' 
          ? 'h-4 w-12 bg-muted rounded' 
          : 'h-20 w-48 bg-muted rounded-lg',
        className
      )} />
    );
  }

  if (variant === 'inline') {
    return (
      <div className={cn(
        'flex items-center gap-1.5 text-sm text-text-secondary',
        'hover:text-foreground transition-colors duration-200',
        className
      )}>
        <DollarSign className="h-3.5 w-3.5" />
        <span className="font-medium tabular-nums">
          {formatCost(cost)}
        </span>
      </div>
    );
  }

  // Card variant for future use
  if (variant === 'card') {
    return (
      <div className={cn(
        'rounded-lg border bg-card p-4 space-y-2',
        className
      )}>
        <div className="flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-medium">{label || 'Total Cost'}</h3>
        </div>
        <div className="text-2xl font-bold tabular-nums">
          {formatCost(cost)}
        </div>
      </div>
    );
  }

  return null;
}