/**
 * Reveal.js integration component for presentation slides
 */

import { useEffect, useRef, useImperativeHandle, forwardRef, memo, type ComponentType } from 'react';
import Reveal from 'reveal.js';
import 'reveal.js/dist/reveal.css';
import type { ManifestMetadata } from '../utils/ManifestParser';

interface RevealJsContainerProps {
	slides: Array<{
		id: string;
		Component: ComponentType<unknown>;
		hasError: boolean;
		error?: Error;
	}>;
	onSlideChange?: (index: number) => void;
	manifestMetadata?: ManifestMetadata | null;
	activeIndex?: number;
	onReady?: () => void;
	thumbnailMode?: boolean;
	printMode?: boolean;
}

export interface RevealJsContainerHandle {
	navigateTo: (index: number) => void;
	next: () => void;
	prev: () => void;
	showAllFragments: () => void;
}

const RevealJsContainerBase = forwardRef<RevealJsContainerHandle, RevealJsContainerProps>(
	function RevealJsContainer(
		{ slides, onSlideChange, manifestMetadata, activeIndex, onReady, thumbnailMode, printMode },
		ref,
	) {
		const deckDivRef = useRef<HTMLDivElement>(null);
		const deckRef = useRef<Reveal.Api | null>(null);
		const isInitializedRef = useRef(false);

		useImperativeHandle(ref, () => ({
			navigateTo: (index: number) => {
				if (deckRef.current && isInitializedRef.current) {
					deckRef.current.slide(index);
				}
			},
			next: () => {
				if (deckRef.current && isInitializedRef.current) {
					deckRef.current.next();
				}
			},
			prev: () => {
				if (deckRef.current && isInitializedRef.current) {
					deckRef.current.prev();
				}
			},
			showAllFragments: () => {
				if (!deckRef.current || !isInitializedRef.current) return;
				const deck = deckRef.current;
				let safety = 0;
				let lastF = deck.getIndices().f ?? 0;
				while (safety < 50) {
					deck.nextFragment();
					const currentF = deck.getIndices().f ?? 0;
					if (currentF === lastF) {
						break;
					}
					lastF = currentF;
					safety += 1;
				}
			},
		}));

		useEffect(() => {
			if (deckRef.current) return;
			if (!deckDivRef.current) return;

			const isThumbnail = thumbnailMode ?? false;
			const isPrint = printMode ?? false;

			const controls = isThumbnail || isPrint ? false : manifestMetadata?.controls ?? true;
			const progress = isThumbnail || isPrint ? false : manifestMetadata?.progress ?? true;
			const center = manifestMetadata?.center ?? true;
			const transition = isThumbnail || isPrint ? 'none' : manifestMetadata?.transition ?? 'slide';
			const slideNumber = isThumbnail ? false : manifestMetadata?.slideNumber ?? false;

			deckRef.current = new Reveal(deckDivRef.current, {
				width: 1920,
				height: 1080,
				margin: 0.04,
				minScale: 0.2,
				maxScale: 2.0,
				controls,
				progress,
				center,
				hash: false,
				slideNumber,
				showSlideNumber: slideNumber ? 'all' : undefined,
				transition,
				controlsLayout: 'bottom-right',
				controlsBackArrows: 'faded',
				navigationMode: 'linear',
				keyboard: false,
				embedded: true,
				touch: true,
				fragments: true,
				pdfSeparateFragments: false,
				pdfMaxPagesPerSlide: 1,
				view: isPrint ? 'print' : null,
			});

			deckRef.current.initialize().then(() => {
				isInitializedRef.current = true;

				deckRef.current?.on(
					'slidechanged',
					((event: unknown) => {
						const slideEvent = event as { indexh: number };
						if (onSlideChange) {
							onSlideChange(slideEvent.indexh);
						}
					}) as EventListener,
				);

				if (onReady) {
					onReady();
				}
			});

			return () => {
				try {
					if (deckRef.current) {
						deckRef.current.destroy();
						deckRef.current = null;
						isInitializedRef.current = false;
					}
				} catch (e) {
					console.warn('[RevealJsContainer] Cleanup failed:', e);
				}
			};
		}, [onSlideChange, manifestMetadata, thumbnailMode, printMode]);

		useEffect(() => {
			if (!deckRef.current || !isInitializedRef.current) return;
			if (typeof activeIndex !== 'number') return;
			deckRef.current.slide(activeIndex);
		}, [activeIndex]);

	return (
		<>
			<style>{`
				.reveal-viewport-embedded {
					position: relative !important;
					top: auto !important;
					left: auto !important;
					width: 100% !important;
					height: 100% !important;
				}
			`}</style>
			<div
				className={`reveal-viewport reveal-viewport-embedded ${
					manifestMetadata?.theme === 'light' ? 'light' : 'dark'
				}`}
			>
				<div className="reveal" ref={deckDivRef}>
					<div className="slides">
						{slides.map((slide) => {
							if (slide.hasError) {
								return (
									<section key={slide.id}>
										<div className="flex items-center justify-center h-full">
											<div className="text-center">
												<div className="text-red-500 font-medium mb-2">Compilation Error</div>
												<div className="text-sm text-gray-600 max-w-md">
													{slide.error?.message || 'Unknown error occurred'}
												</div>
											</div>
										</div>
									</section>
								);
							}

							const SlideComponent = slide.Component;
							return <SlideComponent key={slide.id} />;
						})}
					</div>
				</div>
			</div>
		</>
	);
});

export const RevealJsContainer = memo(
	RevealJsContainerBase,
	(prevProps, nextProps) => {
		if (prevProps.slides.length !== nextProps.slides.length) {
			return false;
		}

		if (prevProps.activeIndex !== nextProps.activeIndex) {
			return false;
		}

		if (prevProps.manifestMetadata !== nextProps.manifestMetadata) {
			return false;
		}

		if (prevProps.onSlideChange !== nextProps.onSlideChange) {
			return false;
		}

		if (prevProps.onReady !== nextProps.onReady) {
			return false;
		}

		if (prevProps.thumbnailMode !== nextProps.thumbnailMode) {
			return false;
		}

		if (prevProps.printMode !== nextProps.printMode) {
			return false;
		}

		for (let i = 0; i < prevProps.slides.length; i++) {
			const prevSlide = prevProps.slides[i];
			const nextSlide = nextProps.slides[i];
			if (
				prevSlide.Component !== nextSlide.Component ||
				prevSlide.hasError !== nextSlide.hasError
			) {
				return false;
			}
		}

		return true;
	},
);
