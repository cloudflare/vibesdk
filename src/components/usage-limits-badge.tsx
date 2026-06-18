/**
 * Combined Cloudflare Connect Button with Usage Badge
 * Shows Cloudflare connect button with attached usage indicator
 */

import { useLimitsContext } from '@/contexts/limits-context';
import { Loader2, LucideGlobeLock } from 'lucide-react';

interface UsageLimitsBadgeProps {
	onConnect: () => void;
}

export function UsageLimitsBadge({ onConnect }: UsageLimitsBadgeProps) {
	const { data, loading, error } = useLimitsContext();

	// Get usage info
	let usageText = '';
	let mobileUsageText = '';
	let isExhausted = false;
	let hasUserToken = false;
	let showCredits = false;
	let creditsText = '';
	let needsConfiguration = false;
	let showUsage = false;

	if (!loading && data && !data.cloudflareConnectEnabled) {
		return null;
	}

	if (!loading && !error && data && data.config) {
		const {
			config,
			usage,
			limitCheck,
			hasUserToken: userHasToken,
			hasCloudflareConfigured,
			cloudflareCredits
		} = data;
		const limit = config.limit;
		hasUserToken = userHasToken;

		// If user has token but hasn't configured account/gateway
		if (hasUserToken && !hasCloudflareConfigured) {
			needsConfiguration = true;
		}

		// Backend indicates both that the OAuth cookie is present and an
		// account/gateway is configured; safe to show the credit balance.
		if (hasUserToken && hasCloudflareConfigured && cloudflareCredits) {
			showCredits = true;
			const creditsAmount = cloudflareCredits.credits.toFixed(2);
			creditsText = cloudflareCredits.gatewayName 
				? `$${creditsAmount} (${cloudflareCredits.gatewayName})`
				: `$${creditsAmount} credits`;
		}

		if (limit && !config.unlimited) {
			const current = usage[limit.type]?.[limit.window] || 0;
			const max = limit.maxValue;
			const remaining = Math.max(0, max - current);
			isExhausted = !limitCheck.withinLimits;

			// Format value
			const formatNumber = (value: number) => {
				const rounded = Math.round(value * 10) / 10;
				return Number.isInteger(rounded) ? rounded.toString() : rounded.toFixed(1);
			};
			const formatValue = (value: number) => {
				switch (limit.type) {
					case 'prompts':
						return formatNumber(value);
					case 'tokens':
						return `${(value / 1000).toFixed(0)}K`;
					case 'cost':
						return `$${value.toFixed(1)}`;
					default:
						return formatNumber(value);
				}
			};

			// Get unit name
			const getUnit = () => {
				switch (limit.type) {
					case 'prompts':
						return remaining === 1 ? 'prompt' : 'prompts';
					case 'tokens':
						return 'tokens';
					case 'credits':
						return remaining === 1 ? 'credit' : 'credits';
					case 'cost':
						return '';
					default:
						return '';
				}
			};

			usageText = `${formatValue(remaining)} free ${getUnit()} left`.trim();
			mobileUsageText = `${formatValue(remaining)} ${getUnit()}`.trim();
			showUsage = true;
		}
	}

	return (
		<>
			<button
				type="button"
				className="inline-flex items-center rounded-md text-xs overflow-hidden hover:opacity-80"
				onClick={needsConfiguration || showCredits ? () => window.location.href = '/settings' : onConnect}
			>
				{/* Loading state */}
				{loading && (
					<div className="flex items-center px-2 py-1">
						<Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
					</div>
				)}

				{/* Usage badge - on the LEFT */}
				{!loading && showUsage && !isExhausted && (
					<div className="flex items-center px-2 py-1 text-text-primary font-medium">
						<span className="hidden md:inline">{usageText}</span>
						<span className="md:hidden">{mobileUsageText}</span>
					</div>
				)}

				{/* Red badge when exhausted and no token */}
				{!loading && isExhausted && !hasUserToken && (
					<div className="flex items-center px-2 py-1 bg-gradient-to-r from-red-600 to-red-500 text-white border-r border-red-500/30 font-medium">
						<span className="hidden md:inline">Free limit exhausted</span>
						<span className="md:hidden">Exhausted</span>
					</div>
				)}

				{/* Connect button / Credits display - on the RIGHT */}
				<div className="flex items-center gap-1.5 px-2 py-1 text-text-on-brand bg-brand rounded-md">
					{!showCredits && <LucideGlobeLock className="w-3 h-3" />}
					{loading ? (
						<span className="hidden sm:inline text-muted-foreground">Loading...</span>
					) : needsConfiguration ? (
						<span className="hidden sm:inline font-medium text-amber-500">Configure AI Gateway</span>
					) : showCredits ? (
						<span className="hidden sm:inline font-medium">{creditsText}</span>
					) : (
						<span>Connect</span>
					)}
				</div>
			</button>
		</>
	);
}
