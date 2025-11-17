import { useCallback, useEffect, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { ComponentType } from 'react';
import { RevealJsContainer, type RevealJsContainerHandle } from './RevealJsContainer';
import type { ManifestMetadata } from '../utils/ManifestParser';
import {
	PRISM_THEME,
	INTER_JETBRAINS_FONTS,
	TAILWIND_CDN,
	HTML2CANVAS_CDN,
} from '../compiler/cdnConfig';

interface SandboxSlide {
	id: string;
	Component: ComponentType<unknown>;
	hasError: boolean;
	error?: Error;
}

interface PresentationSandboxProps {
	slides: SandboxSlide[];
	currentIndex: number;
	onSlideChange?: (index: number) => void;
	manifestMetadata?: ManifestMetadata | null;
	slidesCss?: string;
	tailwindConfigScript?: string;
	onThumbnailCapture?: (index: number, dataUrl: string) => void;
	hidden?: boolean;
}

declare global {
	interface Window {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		html2canvas?: (element: HTMLElement, options?: any) => Promise<HTMLCanvasElement>;
	}
}

const html2CanvasPromises = new WeakMap<Window, Promise<void>>();
const keyboardHandlers = new WeakMap<Window, (e: KeyboardEvent) => void>();

function ensureHtml2CanvasLoaded(
	iframe: HTMLIFrameElement,
): Promise<void> {
	const doc = iframe.contentDocument;
	const win = iframe.contentWindow as (Window & { html2canvas?: typeof window.html2canvas }) | null;

	if (!doc || !win) {
		return Promise.resolve();
	}

	if (win.html2canvas) {
		return Promise.resolve();
	}

	const existing = html2CanvasPromises.get(win);
	if (existing) {
		return existing;
	}

	const promise = new Promise<void>((resolve, reject) => {
		const existingScript = doc.querySelector(
			`script[src="${HTML2CANVAS_CDN.url}"]`,
		) as HTMLScriptElement | null;

		if (existingScript && win.html2canvas) {
			resolve();
			return;
		}

		const script = doc.createElement('script');
		script.src = HTML2CANVAS_CDN.url;
		if (HTML2CANVAS_CDN.crossOrigin) {
			script.crossOrigin = HTML2CANVAS_CDN.crossOrigin;
		}
		script.async = true;
		script.onload = () => {
			if (win.html2canvas) {
				resolve();
			} else {
				reject(new Error('html2canvas loaded but not found on window'));
			}
		};
		script.onerror = () => reject(new Error('Failed to load html2canvas'));
		doc.head.appendChild(script);
	});

	html2CanvasPromises.set(win, promise);
	return promise;
}

export function PresentationSandbox({
	slides,
	currentIndex,
	onSlideChange,
	manifestMetadata,
	slidesCss,
	tailwindConfigScript,
	onThumbnailCapture,
	hidden,
}: PresentationSandboxProps) {
	const iframeRef = useRef<HTMLIFrameElement | null>(null);
	const rootRef = useRef<Root | null>(null);
	const revealRef = useRef<RevealJsContainerHandle | null>(null);
	const capturingRef = useRef(false);

	const handleInternalSlideChange = useCallback(
		(index: number) => {
			if (capturingRef.current) {
				return;
			}
			if (onSlideChange) {
				onSlideChange(index);
			}
		},
		[onSlideChange],
	);

	useEffect(() => {
		const iframe = iframeRef.current;
		if (!iframe) return;

		const handleLoad = () => {
			const doc = iframe.contentDocument;
			if (!doc) return;

			const { head, body } = doc;

			if (head) {
				if (tailwindConfigScript) {
					try {
						const blob = new Blob([tailwindConfigScript], {
							type: 'application/javascript',
						});
						const url = URL.createObjectURL(blob);
						const configScript = doc.createElement('script');
						configScript.src = url;
						head.appendChild(configScript);
					} catch (error) {
						console.error('[PresentationSandbox] Failed to load Tailwind config:', error);
					}
				}

				const tailwindScript = doc.createElement('script');
				tailwindScript.src = TAILWIND_CDN.url;
				if (TAILWIND_CDN.crossOrigin) {
					tailwindScript.crossOrigin = TAILWIND_CDN.crossOrigin;
				}
				head.appendChild(tailwindScript);

				const revealLink = doc.createElement('link');
				revealLink.rel = 'stylesheet';
				revealLink.href =
					'https://cdnjs.cloudflare.com/ajax/libs/reveal.js/5.1.0/reveal.min.css';
				revealLink.crossOrigin = 'anonymous';
				head.appendChild(revealLink);

				const prismLink = doc.createElement('link');
				prismLink.rel = 'stylesheet';
				prismLink.href = PRISM_THEME.url;
				if (PRISM_THEME.crossOrigin) {
					prismLink.crossOrigin = PRISM_THEME.crossOrigin;
				}
				head.appendChild(prismLink);

				const fontsLink = doc.createElement('link');
				fontsLink.rel = 'stylesheet';
				fontsLink.href = INTER_JETBRAINS_FONTS.url;
				if (INTER_JETBRAINS_FONTS.crossOrigin) {
					fontsLink.crossOrigin = INTER_JETBRAINS_FONTS.crossOrigin;
				}
				head.appendChild(fontsLink);

				if (hidden) {
					const noAnim = doc.createElement('style');
					noAnim.textContent = `
						*, *::before, *::after {
							animation: none !important;
							transition: none !important;
						}
					`;
					head.appendChild(noAnim);
				}

				if (slidesCss) {
					const style = doc.createElement('style');
					style.textContent = slidesCss;
					head.appendChild(style);
				}
			}

			if (body) {
				let mount = doc.getElementById('root');
				if (!mount) {
					mount = doc.createElement('div');
					mount.id = 'root';
					body.appendChild(mount);
				}

				rootRef.current = createRoot(mount);
				rootRef.current.render(
					<RevealJsContainer
						ref={revealRef}
						slides={slides}
						onSlideChange={handleInternalSlideChange}
						manifestMetadata={manifestMetadata ?? null}
						activeIndex={currentIndex}
						onReady={handleDeckReady}
						thumbnailMode={hidden}
					/>,
				);

				const win = iframe.contentWindow;
				if (win) {
					const handler = (event: KeyboardEvent) => {
						if (!revealRef.current) return;
						const key = event.key;
						if (key === 'ArrowRight' || key === 'PageDown' || key === ' ') {
							event.preventDefault();
							revealRef.current.next();
						} else if (key === 'ArrowLeft' || key === 'PageUp') {
							event.preventDefault();
							revealRef.current.prev();
						}
					};
					win.addEventListener('keydown', handler);
					keyboardHandlers.set(win, handler);
				}
			}
		};

		iframe.addEventListener('load', handleLoad);

		iframe.srcdoc =
			'<!doctype html><html><head></head><body><div id="root"></div></body></html>';

		return () => {
			iframe.removeEventListener('load', handleLoad);
			if (rootRef.current) {
				rootRef.current.unmount();
				rootRef.current = null;
			}
			const win = iframe.contentWindow;
			if (win) {
				const handler = keyboardHandlers.get(win);
				if (handler) {
					win.removeEventListener('keydown', handler);
					keyboardHandlers.delete(win);
				}
			}
		};
	}, []);

	const handleDeckReady = useCallback(() => {
		if (!onThumbnailCapture || capturingRef.current) return;
		const iframe = iframeRef.current;
		if (!iframe || !revealRef.current) return;

		capturingRef.current = true;

		(async () => {
			try {
				await ensureHtml2CanvasLoaded(iframe);

				const doc = iframe.contentDocument;
				const win = iframe.contentWindow as (Window & {
					html2canvas?: (el: HTMLElement, opts?: unknown) => Promise<HTMLCanvasElement>;
				}) | null;
				const h2c = win?.html2canvas;

				if (!doc || !win || !h2c) {
					return;
				}

				if (doc.fonts && typeof doc.fonts.ready === 'object') {
					await doc.fonts.ready;
				}
                
				for (let i = 0; i < slides.length; i++) {
					revealRef.current?.navigateTo(i);
					revealRef.current?.showAllFragments();

					const target =
						(doc.querySelector('.reveal-viewport') as HTMLElement | null) ??
						(doc.querySelector('.reveal') as HTMLElement | null);

					if (!target) {
						continue;
					}

					// eslint-disable-next-line no-await-in-loop
					const fullCanvas = await h2c(target, {
						useCORS: true,
						backgroundColor: null,
						logging: false,
                        foreignObjectRendering: true,
					});

					const thumbCanvas = doc.createElement('canvas');
					thumbCanvas.width = 384;
					thumbCanvas.height = 216;
					const ctx = thumbCanvas.getContext('2d');

					if (ctx) {
						ctx.drawImage(fullCanvas, 0, 0, 384, 216);
						const dataUrl = thumbCanvas.toDataURL('image/png', 0.8);
						onThumbnailCapture(i, dataUrl);
					}
				}

				// Restore deck to the host-selected slide; host currentIndex
				// has not been modified because we suppressed slidechange
				// events while capturing.
				revealRef.current?.navigateTo(currentIndex);
			} finally {
				capturingRef.current = false;
			}
		})();
	}, [onThumbnailCapture, slides.length, currentIndex]);

	// Re-render deck when slides, metadata, or active index change
	useEffect(() => {
		if (!rootRef.current) return;

		rootRef.current.render(
			<RevealJsContainer
				ref={revealRef}
				slides={slides}
				onSlideChange={handleInternalSlideChange}
				manifestMetadata={manifestMetadata ?? null}
				activeIndex={currentIndex}
				onReady={handleDeckReady}
			/>,
		);
	}, [slides, currentIndex, handleInternalSlideChange, manifestMetadata, handleDeckReady]);

	const themeClass =
		manifestMetadata?.theme === 'light' ? 'bg-white' : 'bg-black';

	const iframeClass = hidden
		? `absolute -left-[9999px] top-0 w-[1280px] h-[720px] border-0 ${themeClass}`
		: `w-full h-full border-0 ${themeClass}`;

	return (
		<iframe
			ref={iframeRef}
			title="Presentation"
			className={iframeClass}
			sandbox="allow-scripts allow-same-origin"
		/>
	);
}
