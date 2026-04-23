import { useState, useMemo, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { type UsageSummary, type LimitConfig } from '@/hooks/use-limits';
import { CloudflareLogo } from './icons/logos';

interface CreditsBannerProps {
	limitsData?: UsageSummary | null;
	onConnectCloudflare?: () => void;
	className?: string;
	children?: ReactNode;
	/** Border-radius (in px) of the encapsulated element — banner adds matching bottom padding so it tucks flush beneath it. */
	radius?: number;
}

function getResetDate(window: LimitWindow, periodSeconds?: number): Date | null {
	const now = new Date();
	switch (window) {
		case 'daily': {
			const d = new Date(now);
			d.setDate(d.getDate() + 1);
			d.setHours(0, 0, 0, 0);
			return d;
		}
		case 'weekly': {
			const d = new Date(now);
			const daysUntilMonday = (8 - d.getDay()) % 7 || 7;
			d.setDate(d.getDate() + daysUntilMonday);
			d.setHours(0, 0, 0, 0);
			return d;
		}
		case 'monthly':
			return new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0);
		case 'rolling':
			return periodSeconds ? new Date(now.getTime() + periodSeconds * 1000) : null;
		case 'lifetime':
		default:
			return null;
	}
}

/**
 * Plain money string ('$61.57' for USD, '€12.00' for EUR, otherwise '12.00 XYZ').
 * Avoids Intl's locale prefixes like 'US$' that appear in non-US locales.
 */
function formatMoney(amount: number, currency: string): string {
	const symbols: Record<string, string> = { USD: '$', EUR: '€', GBP: '£' };
	const symbol = symbols[currency];
	const value = amount.toFixed(2);
	return symbol ? `${symbol}${value}` : `${value} ${currency}`;
}

function formatResetIn(target: Date): string {
	const diffMs = target.getTime() - Date.now();
	if (diffMs <= 0) return 'soon';
	const minutes = Math.floor(diffMs / 60000);
	const hours = Math.floor(minutes / 60);
	const days = Math.floor(hours / 24);
	if (days >= 1) return `${days}d`;
	if (hours >= 1) return `${hours}h`;
	return `${Math.max(1, minutes)}m`;
}

type LimitWindow = 'daily' | 'weekly' | 'monthly' | 'lifetime' | 'rolling';

interface BannerInfo {
	content: ReactNode;
	isConnected: boolean;
}

/** Resolve the display reset date, preferring server-provided `resetAt`. */
function resolveResetDate(limit: LimitConfig): Date | null {
	return limit.resetAt
		? new Date(limit.resetAt)
		: getResetDate(limit.window as LimitWindow, limit.periodSeconds);
}

/**
 * Build the banner content for a Cloudflare-connected user whose free tier does not apply
 * (either unlimited plan or free tier exhausted). Renders the Cloudflare logo + gateway balance
 * when credits are known, otherwise a plain fallback string.
 */
function buildConnectedBalanceContent(
	credits: UsageSummary['cloudflareCredits'],
	resetDate: Date | null,
	fallback: string,
): ReactNode {
	const resetSuffix = resetDate ? ` · free credits reset in ${formatResetIn(resetDate)}` : '';
	if (!credits) {
		return `${fallback}${resetSuffix}`;
	}
	return (
		<span className="inline-flex items-center gap-1">
			<CloudflareLogo className="w-3.5 h-3.5" />
			<span>{formatMoney(credits.credits, credits.currency)} {resetSuffix}</span>
		</span>
	);
}

function useBannerInfo(limitsData?: UsageSummary | null): { bannerInfo: BannerInfo | null; dismiss: () => void } {
	const [isDismissed, setIsDismissed] = useState(false);

	const bannerInfo = useMemo<BannerInfo | null>(() => {
		if (isDismissed || !limitsData) return null;
		const { config, usage, hasUserToken, hasCloudflareConfigured, cloudflareCredits } = limitsData;
		const isConnected = hasUserToken && hasCloudflareConfigured;

		// Unlimited access: for Cloudflare-connected users show their gateway balance + when free credits reset.
		if (config?.unlimited) {
			if (!isConnected) return null;
			const resetDate = config.limit ? resolveResetDate(config.limit) : null;
			return {
				content: buildConnectedBalanceContent(cloudflareCredits, resetDate, 'Connected to AI Gateway'),
				isConnected: true,
			};
		}

		const limit = config?.limit;
		if (!limit) return null;

		const current = usage[limit.type]?.[limit.window] || 0;
		const remaining = Math.max(0, limit.maxValue - current);
		const resetDate = resolveResetDate(limit);

		// Free tier exhausted: if connected, surface the gateway balance instead of '0 free credits remaining'.
		if (remaining <= 0 && isConnected) {
			return {
				content: buildConnectedBalanceContent(cloudflareCredits, resetDate, 'Free credits exhausted · using your AI Gateway'),
				isConnected: true,
			};
		}

		const formatNumber = (value: number) => {
			const rounded = Math.round(value * 10) / 10;
			return Number.isInteger(rounded) ? rounded.toString() : rounded.toFixed(1);
		};
		const formatValue = (value: number) => {
			switch (limit.type) {
				case 'prompts': return formatNumber(value);
				case 'credits': return formatNumber(value);
				case 'tokens': return `${(value / 1000).toFixed(0)}K`;
				case 'cost': return `$${value.toFixed(2)}`;
				default: return formatNumber(value);
			}
		};

		const unit = (() => {
			switch (limit.type) {
				case 'prompts': return remaining === 1 ? 'free prompt' : 'free prompts';
				case 'credits': return remaining === 1 ? 'free credit' : 'free credits';
				case 'tokens': return 'free tokens';
				case 'cost': return 'of free credit';
				default: return 'free';
			}
		})();

		const resetVerb = limit.window === 'rolling' && !limit.resetAt ? 'resets within' : 'resets in';
		const resetText = resetDate ? ` · ${resetVerb} ${formatResetIn(resetDate)}` : '';

		return {
			content: `${formatValue(remaining)} ${unit} remaining${resetText}`.trim(),
			isConnected,
		};
	}, [limitsData, isDismissed]);

	return { bannerInfo, dismiss: () => setIsDismissed(true) };
}

export function CreditsBanner({ limitsData, onConnectCloudflare, className, children, radius = 12 }: CreditsBannerProps) {
	const { bannerInfo, dismiss } = useBannerInfo(limitsData);

	if (children) {
		return (
			<div className={`flex flex-col ${className ?? ''}`}>
				{bannerInfo && (
					<BannerContent
						bannerInfo={bannerInfo}
						onConnectCloudflare={onConnectCloudflare}
						onDismiss={dismiss}
						style={{ paddingBottom: radius + 6, marginBottom: -radius, borderTopLeftRadius: radius, borderTopRightRadius: radius, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }}
					/>
				)}
				{children}
			</div>
		);
	}

	if (!bannerInfo) return null;

	return (
		<BannerContent
			bannerInfo={bannerInfo}
			onConnectCloudflare={onConnectCloudflare}
			onDismiss={dismiss}
			className={className}
		/>
	);
}

function BannerContent({
	bannerInfo,
	onConnectCloudflare,
	onDismiss,
	className,
	style,
}: {
	bannerInfo: BannerInfo;
	onConnectCloudflare?: () => void;
	onDismiss: () => void;
	className?: string;
	style?: React.CSSProperties;
}) {
	return (
		<div
			style={style}
			className={`flex items-center justify-between px-3 py-1.5 bg-bg-2 border border-[#f48120]/30 shadow-md ${style?.borderTopLeftRadius !== undefined ? '' : 'rounded-lg'} ${className ?? ''}`}
		>
			<span className="text-xs font-medium text-[#f48120]">
				{bannerInfo.content}
			</span>
			<div className="flex items-center gap-1.5">
				{!bannerInfo.isConnected && (
					<button
						type="button"
						onClick={onConnectCloudflare}
						className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1 rounded-md bg-gradient-to-r from-[#f48120] to-[#faae42] text-white hover:opacity-90 transition-opacity"
					>
						<CloudflareLogo className="w-3.5 h-3.5" color1="#fff" color2="#fff" />
						Connect
					</button>
				)}
				<button
					type="button"
					onClick={onDismiss}
					className="p-0.5 rounded hover:bg-bg-3 text-text-tertiary hover:text-text-primary transition-colors"
				>
					<X className="size-3.5" />
				</button>
			</div>
		</div>
	);
}
