import { useEffect, useState, useRef, forwardRef, useCallback } from 'react';
import { RefreshCw, AlertCircle } from 'lucide-react';
import { WebSocket } from 'partysocket';

interface PreviewIframeProps {
    src: string;
    className?: string;
    title?: string;
    shouldRefreshPreview?: boolean;
    manualRefreshTrigger?: number;
    webSocket?: WebSocket | null;
}

// ============================================================================
// Types & Constants
// ============================================================================

interface LoadState {
    status: 'idle' | 'loading' | 'postload' | 'loaded' | 'error';
    attempt: number;
    loadedSrc: string | null;
    errorMessage: string | null;
    previewType?: 'sandbox' | 'dispatcher';
}

const MAX_RETRIES = 10;
const REDEPLOY_AFTER_ATTEMPT = 8;
const POST_LOAD_WAIT_SANDBOX = 0;
const POST_LOAD_WAIT_DISPATCHER = 0;

const getRetryDelay = (attempt: number): number => {
	// 1s, 2s, 4s, 8s (capped)
	return Math.min(1000 * Math.pow(2, attempt), 8000);
};

// ============================================================================
// Main Component
// ============================================================================

export const PreviewIframe = forwardRef<HTMLIFrameElement, PreviewIframeProps>(
	({ src, className = '', title = 'Preview', shouldRefreshPreview = false, manualRefreshTrigger, webSocket }, ref) => {
		
		const [loadState, setLoadState] = useState<LoadState>({
			status: 'idle',
			attempt: 0,
			loadedSrc: null,
			errorMessage: null,
		});

		const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
		const hasRequestedRedeployRef = useRef(false);
        const postLoadTimeoutRef = useRef<NodeJS.Timeout | null>(null);
		// ====================================================================
		// Core Loading Logic
		// ====================================================================

		/**
		 * Test if URL is accessible using a simple HEAD request
		 * Returns preview type if accessible, null otherwise
		 */
		const testAvailability = useCallback(async (url: string): Promise<'sandbox' | 'dispatcher' | null> => {
			try {
				const response = await fetch(url, {
					method: 'HEAD',
					mode: 'cors', // Using CORS to read security-validated headers
					cache: 'no-cache',
					signal: AbortSignal.timeout(8000),
				});
                console.log('Preview availability test response:', response, response.headers.forEach((value, key) => console.log("Header: ",key, value)));
				
				if (!response.ok) {
					console.log('Preview not ready (status:', response.status, ')');
					return null;
				}
				
				// Read the custom header to determine preview type
				// Header will only be present if origin validation passed on server
				const previewType = response.headers.get('X-Preview-Type');
				
                if (previewType === 'sandbox-error') {
                    console.log('Preview not ready (sandbox error)');
                    return null;
                } else if (previewType === 'sandbox' || previewType === 'dispatcher') {
					console.log('Preview available, type:', previewType);
					return previewType;
				}
				
				// Fallback: If no header present (shouldn't happen with valid origin)
				// but the response is OK, assume sandbox for backward compatibility
				console.log('Preview available (type unknown, assuming sandbox)');
				return 'sandbox';
			} catch (error) {
				console.log('Preview not available yet:', error);
				return null;
			}
		}, []);

		/**
		 * Warm the preview by fetching the app entry so vite finishes its dep
		 * crawl before the iframe mounts. HEAD / returns 200 while vite is
		 * still re-bundling; the iframe's parallel ?v=... module requests then
		 * 504 (or 404 on stale hashes). Fetching src/main.tsx forces vite to
		 * transform the entry and chain through all app imports, which is what
		 * "switch to Code tab and back" effectively buys us.
		 */
		const warmupPreview = useCallback(async (url: string): Promise<boolean> => {
			try {
				const entry = await fetch(new URL('src/main.tsx', url).toString(), {
					method: 'GET',
					mode: 'cors',
					cache: 'no-cache',
					signal: AbortSignal.timeout(20000),
				});
				return entry.ok;
			} catch (error) {
				console.log('Preview warmup fetch failed:', error);
				return false;
			}
		}, []);

		/**
		 * Request automatic redeployment via WebSocket
		 */
		const requestRedeploy = useCallback(() => {
			if (!webSocket || webSocket.readyState !== WebSocket.OPEN) {
				console.warn('Cannot request redeploy: WebSocket not connected');
				return;
			}

			if (hasRequestedRedeployRef.current) {
				console.log('Redeploy already requested, skipping duplicate request');
				return;
			}

			console.log('Requesting automatic preview redeployment');
			
			try {
				webSocket.send(JSON.stringify({
					type: 'preview',
				}));
				hasRequestedRedeployRef.current = true;
			} catch (error) {
				console.error('Failed to send redeploy request:', error);
			}
		}, [webSocket]);

		/**
		 * Request screenshot capture via WebSocket
		 */
		const requestScreenshot = useCallback((url: string) => {
			if (!webSocket || webSocket.readyState !== WebSocket.OPEN) {
				console.warn('Cannot request screenshot: WebSocket not connected');
				return;
			}

			console.log('Requesting screenshot capture');
			
			try {
				webSocket.send(JSON.stringify({
					type: 'capture_screenshot',
					data: {
						url,
						viewport: { width: 1280, height: 720 },
					},
				}));
			} catch (error) {
				console.error('Failed to send screenshot request:', error);
			}
		}, [webSocket]);

		/**
		 * Attempt to load the preview with retry logic
		 */
		const loadWithRetry = useCallback(async (url: string, attempt: number) => {
			// Clear any pending retry
			if (retryTimeoutRef.current) {
				clearTimeout(retryTimeoutRef.current);
				retryTimeoutRef.current = null;
			}

            if (postLoadTimeoutRef.current) {
                clearTimeout(postLoadTimeoutRef.current);
                postLoadTimeoutRef.current = null;
            }

			// Check if we've exceeded max retries
			if (attempt >= MAX_RETRIES) {
				setLoadState({
					status: 'error',
					attempt,
					loadedSrc: null,
					errorMessage: 'Preview failed to load after multiple attempts',
				});
				return;
			}

			// Update state to show loading
			setLoadState({
				status: 'loading',
				attempt: attempt + 1,
				loadedSrc: null,
				errorMessage: null,
			});

			// Test availability
			const previewType = await testAvailability(url);

			if (previewType) {
				// HEAD / returned 200, but for sandbox previews we also need to
				// confirm vite has finished dep optimization before mounting the
				// iframe — otherwise the iframe's module requests race vite's
				// re-bundling and 504.
				if (previewType === 'sandbox') {
					console.log('Preview HEAD ok; warming vite module graph before mounting iframe');
					const warm = await warmupPreview(url);
					if (!warm) {
						const delay = getRetryDelay(attempt);
						const nextAttempt = attempt + 1;
						console.log(`Preview not warm yet. Retrying in ${Math.ceil(delay / 1000)}s (attempt ${nextAttempt}/${MAX_RETRIES})`);
						if (nextAttempt === REDEPLOY_AFTER_ATTEMPT) {
							requestRedeploy();
						}
						retryTimeoutRef.current = setTimeout(() => {
							loadWithRetry(url, nextAttempt);
						}, delay);
						return;
					}
				}

				// Success: put component into postload state, keep loading UI visible
				console.log(`Preview available (${previewType}) at attempt ${attempt + 1}`);
				setLoadState({
					status: 'postload',
					attempt: attempt + 1,
					loadedSrc: url,
					errorMessage: null,
					previewType,
				});

				// Wait for page to render before revealing iframe and capturing screenshot
				const waitTime = previewType === 'dispatcher' ? POST_LOAD_WAIT_DISPATCHER : POST_LOAD_WAIT_SANDBOX;
				console.log(`Waiting ${waitTime}ms before showing preview and capturing screenshot (${previewType} app)`);
				postLoadTimeoutRef.current = setTimeout(() => {
					setLoadState(prev => ({
						...prev,
						status: 'loaded',
					}));
					requestScreenshot(url);
				}, waitTime);
			} else {
				// Not available yet - retry with backoff
				const delay = getRetryDelay(attempt);
				const nextAttempt = attempt + 1;
				
				console.log(`Preview not ready. Retrying in ${Math.ceil(delay / 1000)}s (attempt ${nextAttempt}/${MAX_RETRIES})`);

				// Auto-redeploy after 3 failed attempts
				if (nextAttempt === REDEPLOY_AFTER_ATTEMPT) {
					requestRedeploy();
				}

				// Schedule next retry
				retryTimeoutRef.current = setTimeout(() => {
					loadWithRetry(url, nextAttempt);
				}, delay);
			}
		}, [testAvailability, warmupPreview, requestScreenshot, requestRedeploy]);

		/**
		 * Force a fresh reload from scratch
		 */
		const forceReload = useCallback(() => {
			console.log('Force reloading preview');
			hasRequestedRedeployRef.current = false;
			
			if (retryTimeoutRef.current) {
				clearTimeout(retryTimeoutRef.current);
				retryTimeoutRef.current = null;
			}

            if (postLoadTimeoutRef.current) {
                clearTimeout(postLoadTimeoutRef.current);
                postLoadTimeoutRef.current = null;
            }

			setLoadState({
				status: 'idle',
				attempt: 0,
				loadedSrc: null,
				errorMessage: null,
			});

			// Start loading
			loadWithRetry(src, 0);
		}, [src, loadWithRetry]);

		// ====================================================================
		// Effects
		// ====================================================================

		/**
		 * Effect: Load when src changes
		 */
		useEffect(() => {
			if (!src) return;

			console.log('Preview src changed, starting load:', src);
			hasRequestedRedeployRef.current = false;
			
			if (retryTimeoutRef.current) {
				clearTimeout(retryTimeoutRef.current);
				retryTimeoutRef.current = null;
			}

            if (postLoadTimeoutRef.current) {
                clearTimeout(postLoadTimeoutRef.current);
                postLoadTimeoutRef.current = null;
            }

			setLoadState({
				status: 'idle',
				attempt: 0,
				loadedSrc: null,
				errorMessage: null,
			});

			loadWithRetry(src, 0);

			return () => {
				if (retryTimeoutRef.current) {
					clearTimeout(retryTimeoutRef.current);
					retryTimeoutRef.current = null;
				}
				if (postLoadTimeoutRef.current) {
					clearTimeout(postLoadTimeoutRef.current);
					postLoadTimeoutRef.current = null;
				}
			};
		}, [src, loadWithRetry]);

		/**
		 * Effect: Auto-refresh after deployment
		 */
		useEffect(() => {
			if (shouldRefreshPreview && loadState.status === 'loaded' && loadState.loadedSrc) {
				console.log('Auto-refreshing preview after deployment');
				forceReload();
			}
		}, [shouldRefreshPreview, loadState.status, loadState.loadedSrc, forceReload]);

		/**
		 * Effect: Manual refresh trigger
		 */
		useEffect(() => {
			if (manualRefreshTrigger && manualRefreshTrigger > 0) {
				console.log('Manual refresh triggered');
				forceReload();
			}
		}, [manualRefreshTrigger, forceReload]);

		/**
		 * Effect: Cleanup on unmount
		 */
		useEffect(() => {
			return () => {
				if (retryTimeoutRef.current) {
					clearTimeout(retryTimeoutRef.current);
				}
				if (postLoadTimeoutRef.current) {
					clearTimeout(postLoadTimeoutRef.current);
				}
			};
		}, []);

		// ====================================================================
		// Render
		// ====================================================================

		// Loading / postload / loaded — share a single stable iframe element so
		// React never unmounts the warmed-up iframe when status flips to 'loaded'.
		// The iframe stays mounted whenever loadedSrc is set; the spinner overlay
		// is shown on top until the transition to 'loaded' reveals the iframe.
		if (
			loadState.status === 'loading' ||
			loadState.status === 'idle' ||
			loadState.status === 'postload' ||
			loadState.status === 'loaded'
		) {
			const delay = getRetryDelay(loadState.attempt - 1);
			const delaySeconds = Math.ceil(delay / 1000);
			const isLoaded = loadState.status === 'loaded';
			const showIframe = !!loadState.loadedSrc && (loadState.status === 'postload' || isLoaded);
			const showSpinner = !isLoaded;

			return (
				<div
					className={`${className} relative ${isLoaded ? '' : 'flex flex-col items-center justify-center bg-bg-3 border border-text/10 rounded-lg'}`}
				>
					{showIframe && loadState.loadedSrc && (
						<iframe
							sandbox="allow-scripts allow-same-origin allow-pointer-lock allow-forms allow-modals allow-orientation-lock	allow-popups allow-presentation"
							ref={ref}
							src={loadState.loadedSrc}
							className={`absolute inset-0 w-full h-full border-0 ${isLoaded ? '' : 'opacity-0 pointer-events-none'}`}
							title={title}
							aria-hidden={isLoaded ? undefined : true}
							onError={() => {
								console.error('Iframe failed to load');
								setLoadState(prev => ({
									...prev,
									status: 'error',
									errorMessage: 'Preview failed to render',
								}));
							}}
						/>
					)}
					{showSpinner && (
						<div className="text-center p-8 max-w-md">
							<RefreshCw className="size-8 text-accent animate-spin mx-auto mb-4" />
							<h3 className="text-lg font-medium text-text-primary mb-2">
								Loading Preview
							</h3>
							<p className="text-text-primary/70 text-sm mb-4">
								{loadState.attempt === 0
									? 'Checking if your deployed preview is ready...'
									: `Preview not ready yet. Retrying in ${delaySeconds}s... (attempt ${loadState.attempt}/${MAX_RETRIES})`
								}
							</p>
							{loadState.attempt >= REDEPLOY_AFTER_ATTEMPT && (
								<p className="text-xs text-accent/70">
									Auto-redeployment triggered to refresh the preview
								</p>
							)}
							<div className="text-xs text-text-primary/50 mt-2">
								Preview URLs may take a moment to become available after deployment
							</div>
						</div>
					)}
				</div>
			);
		}

		// Error state - after max retries
		return (
			<div className={`${className} flex flex-col items-center justify-center bg-bg-3 border border-text/10 rounded-lg`}>
				<div className="text-center p-8 max-w-md">
					<AlertCircle className="size-8 text-orange-500 mx-auto mb-4" />
					<h3 className="text-lg font-medium text-text-primary mb-2">
						Preview Not Available
					</h3>
					<p className="text-text-primary/70 text-sm mb-6">
						{loadState.errorMessage || 'The preview failed to load after multiple attempts.'}
					</p>
					<div className="space-y-3">
						<button
							onClick={forceReload}
							className="flex items-center justify-center gap-2 px-6 py-3 bg-accent hover:bg-accent/90 text-white rounded-lg transition-colors text-sm mx-auto font-medium w-full"
						>
							<RefreshCw className="size-4" />
							Try Again
						</button>
						<p className="text-xs text-text-primary/60">
							If the issue persists, please describe the problem in chat so I can help diagnose and fix it.
						</p>
					</div>
				</div>
			</div>
		);
	}
);

PreviewIframe.displayName = 'PreviewIframe';
