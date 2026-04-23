/**
 * Usage Limits Card Component
 * Displays user's free tier usage and remaining limits
 */

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
	Zap, 
	AlertTriangle, 
	CheckCircle2, 
	TrendingUp,
	RefreshCw,
	Calendar,
	BarChart3
} from 'lucide-react';
import { useLimitsContext } from '@/contexts/limits-context';
import { cn } from '@/lib/utils';
import CloudflareLogo from '@/assets/provider-logos/cloudflare.svg?react';

interface UsageLimitsCardProps {
	className?: string;
	onConnectToken?: () => void;
}

export function UsageLimitsCard({ className, onConnectToken }: UsageLimitsCardProps) {
	const { data, loading, error, refetch } = useLimitsContext();

	if (loading) {
		return (
			<Card className={cn('dark:bg-bg-4/50', className)}>
				<CardHeader className="border-b">
					<div className="flex items-center gap-2">
						<Zap className="h-5 w-5 text-[#f48120]" />
						<CardTitle>Usage Limits</CardTitle>
					</div>
					<CardDescription>Your free tier usage</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4 pt-6">
					<Skeleton className="h-20 w-full" />
					<Skeleton className="h-20 w-full" />
				</CardContent>
			</Card>
		);
	}

	if (error) {
		return (
			<Card className={cn('dark:bg-bg-4/50', className)}>
				<CardHeader className="border-b">
					<div className="flex items-center gap-2">
						<Zap className="h-5 w-5 text-[#f48120]" />
						<CardTitle>Usage Limits</CardTitle>
					</div>
				</CardHeader>
				<CardContent className="pt-6">
					<Alert variant="destructive">
						<AlertTriangle className="h-4 w-4" />
						<AlertDescription>{error}</AlertDescription>
					</Alert>
					<Button 
						onClick={refetch} 
						variant="outline" 
						size="sm" 
						className="mt-4 w-full"
					>
						<RefreshCw className="h-4 w-4 mr-2" />
						Retry
					</Button>
				</CardContent>
			</Card>
		);
	}

	if (!data) return null;

	const { config, usage, limitCheck, hasUserToken } = data;
	const isUnlimited = config.unlimited;
	const limit = config.limit;

	// Get current usage for the active limit type and window
	const current = usage[limit.type]?.[limit.window] || 0;
	const max = limit.maxValue;
	const percentUsed = max > 0 ? (current / max) * 100 : 0;
	const remaining = Math.max(0, max - current);

	// Determine status
	const isExceeded = !limitCheck.withinLimits;
	const isWarning = percentUsed >= 80 && percentUsed < 100;

	// Format values based on type
	const formatValue = (value: number, type: string) => {
		switch (type) {
			case 'prompts':
				return value.toString();
			case 'tokens':
				return `${(value / 1000).toFixed(1)}K`;
			case 'cost':
				return `$${value.toFixed(2)}`;
			default:
				return value.toString();
		}
	};

	const getTypeLabel = (type: string) => {
		switch (type) {
			case 'prompts':
				return 'Prompts';
			case 'tokens':
				return 'Tokens';
			case 'cost':
				return 'Cost';
			default:
				return type;
		}
	};

	const getWindowLabel = (window: string) => {
		switch (window) {
			case 'daily':
				return 'Today';
			case 'weekly':
				return 'This Week';
			case 'monthly':
				return 'This Month';
			case 'lifetime':
				return 'All Time';
			default:
				return window;
		}
	};

	return (
		<Card className={cn('dark:bg-bg-4/50', className)}>
			<CardHeader className="border-b">
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-2">
						<Zap className="h-5 w-5 text-[#f48120]" />
						<CardTitle>Free Tier Usage</CardTitle>
					</div>
					<Button 
						onClick={refetch} 
						variant="ghost" 
						size="icon"
						className="h-8 w-8"
					>
						<RefreshCw className="h-4 w-4" />
					</Button>
				</div>
				<CardDescription className="flex items-center gap-2 mt-2">
					<Calendar className="h-3 w-3" />
					{getWindowLabel(limit.window)}
				</CardDescription>
			</CardHeader>
			<CardContent className="pt-6">
				{isUnlimited ? (
					<Alert className="bg-gradient-to-r from-green-500/10 to-emerald-500/10 border-green-500/20">
						<CheckCircle2 className="h-4 w-4 text-green-600" />
						<AlertDescription className="text-green-700 dark:text-green-400">
							You have unlimited access! 🎉
						</AlertDescription>
					</Alert>
				) : (
					<>
						{/* Main Content: Usage Stats (Left) + Connect Button (Right) */}
						<div className="flex flex-col lg:flex-row gap-6 items-start">
							{/* Left: Usage Stats */}
							<div className="flex-1 space-y-4 w-full">
								{/* Usage Progress */}
								<div className="space-y-3">
									<div className="flex items-center justify-between text-sm">
										<div className="flex items-center gap-2">
											<BarChart3 className="h-4 w-4 text-text-tertiary" />
											<span className="font-medium">{getTypeLabel(limit.type)}</span>
										</div>
										<div className="flex items-center gap-2">
											<span className={cn(
												"font-semibold",
												isExceeded && "text-red-600",
												isWarning && "text-amber-600"
											)}>
												{formatValue(current, limit.type)}
											</span>
											<span className="text-text-tertiary">/</span>
											<span className="text-text-tertiary">
												{formatValue(max, limit.type)}
											</span>
										</div>
									</div>

									<Progress 
										value={Math.min(percentUsed, 100)} 
										className={cn(
											"h-2",
											isExceeded && "[&>div]:bg-red-500",
											isWarning && "[&>div]:bg-amber-500"
										)}
									/>

									<div className="flex items-center justify-between text-xs text-text-tertiary">
										<span>{percentUsed.toFixed(1)}% used</span>
										<span className="font-medium text-foreground">
											{formatValue(remaining, limit.type)} remaining
										</span>
									</div>
								</div>

								{/* Status Alert */}
								{isExceeded && (
									<Alert variant="destructive" className="border-red-500/50">
										<AlertTriangle className="h-4 w-4" />
										<AlertDescription>
											<p className="font-medium mb-1">Limit Exceeded</p>
											<p className="text-sm">
												{hasUserToken 
													? "Using your connected Cloudflare AI Gateway token."
													: "Connect your Cloudflare AI Gateway token to continue."
												}
											</p>
										</AlertDescription>
									</Alert>
								)}

								{isWarning && !isExceeded && (
									<Alert className="bg-amber-500/10 border-amber-500/20">
										<TrendingUp className="h-4 w-4 text-amber-600" />
										<AlertDescription className="text-amber-700 dark:text-amber-400">
											<p className="font-medium mb-1">Approaching Limit</p>
											<p className="text-sm">
												You've used {percentUsed.toFixed(0)}% of your free tier.
											</p>
										</AlertDescription>
									</Alert>
								)}
							</div>

							{/* Right: Cloudflare Connect Button - ALWAYS VISIBLE */}
							<div className="flex-shrink-0 w-full lg:w-auto">
								<div className="space-y-3">
									<Button 
										onClick={onConnectToken}
										className="w-full lg:w-auto gap-2 bg-gradient-to-r from-[#f48120] to-[#faae42] hover:from-[#f48120]/90 hover:to-[#faae42]/90"
										size="lg"
									>
										<CloudflareLogo className="h-5 w-5" />
										{hasUserToken ? 'Manage Connection' : 'Connect Cloudflare'}
									</Button>
									
									{hasUserToken ? (
										<div className="flex items-center justify-center gap-2 text-xs text-green-600 dark:text-green-400">
											<CheckCircle2 className="h-3 w-3" />
											<span>Connected</span>
										</div>
									) : (
										<p className="text-xs text-center text-text-tertiary max-w-[200px]">
											Continue using with your own token
										</p>
									)}
								</div>
							</div>
						</div>
					</>
				)}

				{/* Additional Usage Stats */}
				<div className="pt-4 border-t space-y-2">
					<p className="text-xs font-medium text-text-tertiary uppercase tracking-wide">
						All Usage
					</p>
					{Object.entries(usage).map(([type, windows]) => (
						<div key={type} className="space-y-1">
							<p className="text-xs font-medium text-text-secondary">{getTypeLabel(type)}</p>
							{Object.entries(windows).map(([window, value]) => (
								<div key={`${type}-${window}`} className="flex items-center justify-between text-sm pl-2">
									<span className="text-text-tertiary text-xs">
										{getWindowLabel(window)}
									</span>
									<span className="font-medium">
										{formatValue(value as number, type)}
									</span>
								</div>
							))}
						</div>
					))}
				</div>
			</CardContent>
		</Card>
	);
}
