import { useMemo, useState } from 'react';
import { ExternalLink, TriangleAlert, X } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { isAppleWebKitBrowser, isCrossSitePreview } from '@/lib/utils';

const DISMISS_KEY = 'preview-compat-dismissed';

function readDismissed(): boolean {
	try {
		return sessionStorage.getItem(DISMISS_KEY) === '1';
	} catch {
		return false;
	}
}

interface PreviewCompatBannerProps {
	previewUrl: string;
}

/**
 * Advisory banner shown above the preview when the viewer is on an Apple/WebKit
 * browser AND the preview runs on a different registrable domain than the
 * dashboard. In that case Safari blocks the cross-site preview cookie, so the
 * embedded iframe's dynamic requests can fail. Opening the preview in a new tab
 * loads it first-party, where it works fully.
 */
export function PreviewCompatBanner({ previewUrl }: PreviewCompatBannerProps) {
	const [dismissed, setDismissed] = useState(readDismissed);

	const show = useMemo(
		() => isAppleWebKitBrowser() && isCrossSitePreview(previewUrl),
		[previewUrl],
	);

	if (!show || dismissed) {
		return null;
	}

	const dismiss = () => {
		try {
			sessionStorage.setItem(DISMISS_KEY, '1');
		} catch {
			// Ignore storage failures; banner just won't persist its dismissal.
		}
		setDismissed(true);
	};

	return (
		<Alert className="rounded-none border-x-0 border-t-0 flex items-center gap-3">
			<TriangleAlert className="text-amber-500" />
			<AlertDescription className="flex-1">
				Preview may not fully load in Safari due to preview being served from a
				different domain.
			</AlertDescription>
			<Button
				variant="outline"
				size="sm"
				onClick={() =>
					window.open(previewUrl, '_blank', 'noopener,noreferrer')
				}
			>
				<ExternalLink />
				Open in new tab
			</Button>
			<button
				type="button"
				aria-label="Dismiss"
				onClick={dismiss}
				className="p-1 rounded hover:bg-bg-2 transition-colors"
			>
				<X className="size-4 text-text-primary/60" />
			</button>
		</Alert>
	);
}
