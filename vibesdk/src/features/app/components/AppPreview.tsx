/**
 * App Preview Component
 *
 * Renders the live preview iframe for standard web applications.
 * Wraps the existing PreviewIframe component with app-specific defaults.
 */

import { forwardRef } from 'react';
import { PreviewIframe } from '@/routes/chat/components/preview-iframe';
import type { PreviewComponentProps } from '../../core/types';

export const AppPreview = forwardRef<HTMLIFrameElement, PreviewComponentProps>(
	(
		{
			previewUrl,
			websocket,
			shouldRefreshPreview,
			manualRefreshTrigger,
			previewRef,
			className,
		},
		ref,
	) => {
		if (!previewUrl) {
			return (
				<div className={`${className ?? ''} flex items-center justify-center bg-bg-3 border border-text/10 rounded-lg`}>
					<div className="text-center p-8">
						<p className="text-text-primary/70 text-sm">
							No preview URL available yet. The preview will appear once your app is deployed.
						</p>
					</div>
				</div>
			);
		}

		return (
			<PreviewIframe
				ref={ref ?? previewRef}
				src={previewUrl}
				className={className}
				title="App Preview"
				shouldRefreshPreview={shouldRefreshPreview}
				manualRefreshTrigger={manualRefreshTrigger}
				webSocket={websocket}
			/>
		);
	},
);

AppPreview.displayName = 'AppPreview';
