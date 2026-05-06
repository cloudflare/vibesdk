/**
 * Usage Limit Checker
 * Validates usage limits before sending prompts and shows appropriate dialogs
 */

import { UsageSummary } from '@/hooks/use-limits';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertCircle, ExternalLink } from 'lucide-react';
import { CloudflareLogo } from '@/components/icons/logos';
import { MINIMUM_CLOUDFLARE_BALANCE } from '../../shared/constants/limits';

export interface LimitCheckDialogResult {
	canProceed: boolean;
	dialogComponent?: React.ReactElement;
}


/**
 * Internal helper: Create "No Token" dialog
 */
function createNoTokenDialog(onConnect: () => void, onClose: () => void): React.ReactElement {
	return (
		<Dialog open={true} onOpenChange={onClose}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<div className="mb-2">
						<AlertCircle className="h-10 w-10 text-text-tertiary" />
					</div>
					<DialogTitle className="text-xl">
						Daily free limit exhausted
					</DialogTitle>
					<DialogDescription className="pt-2 text-sm">
						You've used your free credits. Connect your Cloudflare account to continue building with your own credits.{' '}
						<a
							href="https://developers.cloudflare.com/ai-gateway/"
							target="_blank"
							rel="noopener noreferrer"
							className="text-blue-500 hover:text-blue-600 inline-flex items-center gap-0.5"
						>
							Learn more
							<ExternalLink className="h-3 w-3" />
						</a>
					</DialogDescription>
				</DialogHeader>
				<DialogFooter className="sm:justify-start gap-2">
					<Button
						type="button"
						onClick={() => {
							onClose();
							onConnect();
						}}
						className="w-full sm:w-auto bg-[#f48120] hover:bg-[#e0741a] text-white"
					>
						<CloudflareLogo className="w-4 h-4 mr-2" color1="#fff" color2="#fff" />
						Connect Cloudflare
					</Button>
					<Button
						type="button"
						variant="outline"
						onClick={onClose}
						className="w-full sm:w-auto"
					>
						Cancel
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

/**
 * Internal helper: Create "Not Configured" dialog
 */
function createNotConfiguredDialog(onClose: () => void): React.ReactElement {
	return (
		<Dialog open={true} onOpenChange={onClose}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<div className="mb-2">
						<AlertCircle className="h-10 w-10 text-text-tertiary" />
					</div>
					<DialogTitle className="text-xl">
						Configure AI Gateway
					</DialogTitle>
					<DialogDescription className="pt-2 text-sm">
						Your Cloudflare account is connected but you need to select an AI Gateway to continue.
					</DialogDescription>
				</DialogHeader>
				<DialogFooter className="sm:justify-start gap-2">
					<Button
						type="button"
						onClick={() => {
							onClose();
							window.location.href = '/settings?config_needed=true';
						}}
						className="w-full sm:w-auto bg-[#f48120] hover:bg-[#e0741a] text-white"
					>
						<CloudflareLogo className="w-4 h-4 mr-2" color1="#fff" color2="#fff" />
						Configure Gateway
					</Button>
					<Button
						type="button"
						variant="outline"
						onClick={onClose}
						className="w-full sm:w-auto"
					>
						Cancel
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

/**
 * Internal helper: Create "Insufficient Balance" dialog
 */
function createInsufficientBalanceDialog(balance: number, accountId: string | undefined, onClose: () => void): React.ReactElement {
	return (
		<Dialog open={true} onOpenChange={onClose}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<div className="mb-2">
						<AlertCircle className="h-10 w-10 text-text-tertiary" />
					</div>
					<DialogTitle className="text-xl">
						Insufficient credits
					</DialogTitle>
					<DialogDescription className="pt-2 text-sm">
						Your Cloudflare account has ${balance.toFixed(2)} in credits. Add more credits to continue building.{' '}
						<a
							href="https://developers.cloudflare.com/ai-gateway/"
							target="_blank"
							rel="noopener noreferrer"
							className="text-blue-500 hover:text-blue-600 inline-flex items-center gap-0.5"
						>
							Learn more
							<ExternalLink className="h-3 w-3" />
						</a>
					</DialogDescription>
				</DialogHeader>
				<DialogFooter className="sm:justify-start gap-2">
					<Button
						type="button"
						onClick={() => {
							onClose();
							const url = accountId 
								? `https://dash.cloudflare.com/${accountId}/ai/ai-gateway/credits`
								: 'https://dash.cloudflare.com';
							window.open(url, '_blank');
						}}
						className="w-full sm:w-auto bg-[#f48120] hover:bg-[#e0741a] text-white"
					>
						<ExternalLink className="w-4 h-4 mr-2" />
						Add Credits
					</Button>
					<Button
						type="button"
						variant="outline"
						onClick={onClose}
						className="w-full sm:w-auto"
					>
						Cancel
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

/**
 * Check if user can send a prompt and return appropriate dialog if blocked
 */
export function checkCanSendPrompt(
	limitsData: UsageSummary | null,
	loading: boolean,
	onConnect: () => void,
	onClose: () => void
): LimitCheckDialogResult {
	// If loading or no data, allow proceed (optimistic)
	if (loading || !limitsData) {
		return { canProceed: true };
	}

	const { limitCheck, hasUserToken, hasCloudflareConfigured, cloudflareCredits } = limitsData;

	// If within limits, allow proceed
	if (limitCheck.withinLimits) {
		return { canProceed: true };
	}

	// Free limits are exhausted, check Cloudflare status
	
	// Case 1: No Cloudflare token connected
	if (!hasUserToken) {
		return {
			canProceed: false,
			dialogComponent: createNoTokenDialog(onConnect, onClose),
		};
	}

	// Case 2: Has token but not configured (no AI Gateway setup)
	if (hasUserToken && !hasCloudflareConfigured) {
		return {
			canProceed: false,
			dialogComponent: createNotConfiguredDialog(onClose),
		};
	}

	// Case 3: Configured but insufficient credits
	if (hasUserToken && hasCloudflareConfigured) {
		const credits = cloudflareCredits?.credits ?? 0;
		
		if (credits < MINIMUM_CLOUDFLARE_BALANCE) {
			return {
				canProceed: false,
				dialogComponent: createInsufficientBalanceDialog(
					credits,
					cloudflareCredits?.accountId,
					onClose
				),
			};
		}
	}

	// If we got here, user has token, is configured, and has enough credits
	return { canProceed: true };
}

/**
 * Get appropriate dialog for backend limit error
 * Backend sends generic USAGE_LIMIT_EXCEEDED - frontend uses its own limitsData to determine which dialog
 * Reuses the same logic and dialogs as checkCanSendPrompt for consistency
 */
export function getBackendLimitDialog(
	limitsData: UsageSummary | null,
	onConnect: () => void,
	onClose: () => void
): LimitCheckDialogResult {
	// Use the same logic as checkCanSendPrompt, but don't check if within limits
	// (backend already determined limits are exceeded)
	if (!limitsData) {
		return { canProceed: true };
	}

	const { hasUserToken, hasCloudflareConfigured, cloudflareCredits } = limitsData;

	// Case 1: No Cloudflare token connected
	if (!hasUserToken) {
		return {
			canProceed: false,
			dialogComponent: createNoTokenDialog(onConnect, onClose),
		};
	}

	// Case 2: Has token but not configured (no AI Gateway setup)
	if (hasUserToken && !hasCloudflareConfigured) {
		return {
			canProceed: false,
			dialogComponent: createNotConfiguredDialog(onClose),
		};
	}

	// Case 3: Configured but insufficient credits
	if (hasUserToken && hasCloudflareConfigured) {
		const credits = cloudflareCredits?.credits ?? 0;
		
		if (credits < MINIMUM_CLOUDFLARE_BALANCE) {
			return {
				canProceed: false,
				dialogComponent: createInsufficientBalanceDialog(
					credits,
					cloudflareCredits?.accountId,
					onClose
				),
			};
		}
	}

	// Unknown state - should not block
	return { canProceed: true };
}
