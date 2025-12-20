import { Presentation } from 'lucide-react';
import { PreviewIframe } from '@/routes/chat/components/preview-iframe';
import clsx from 'clsx';
import { useState, useRef, useMemo } from 'react';
import { HEADER_STYLES } from '@/routes/chat/components/view-header-styles';
import {
	usePresentationFiles,
	usePresentationSync,
	useIframeMessaging,
	useThumbnailObserver,
} from '../hooks';
import type { PreviewComponentProps } from '../../core/types';

// Feature state keys (shared with PresentationHeaderActions)
const SPEAKER_MODE_KEY = 'speakerMode';
const PREVIEW_MODE_KEY = 'previewMode';

export function PresentationPreview({
	previewUrl,
	className = '',
	shouldRefreshPreview,
	manualRefreshTrigger,
	websocket,
	files = [],
	templateDetails = null,
	featureState,
}: PreviewComponentProps) {
	const iframeRef = useRef<HTMLIFrameElement>(null);
	const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
	const [failedIframes, setFailedIframes] = useState<Set<number>>(new Set());
	const sidebarScrollRef = useRef<HTMLDivElement>(null);

	// Get speaker/preview mode from feature state
	const speakerMode = (featureState[SPEAKER_MODE_KEY] as boolean) ?? false;
	const previewMode = (featureState[PREVIEW_MODE_KEY] as boolean) ?? false;

	const slideDirectory = templateDetails?.slideDirectory || 'public/slides';

	// Custom hooks for modular functionality
	const { slideFiles } = usePresentationFiles(files, slideDirectory);

	const { visibleThumbnails, thumbnailRefs } = useThumbnailObserver(slideFiles);

	const { timestamps, generatingSlides, setGeneratingSlides } = usePresentationSync(
		files,
		slideFiles,
		slideDirectory,
		currentSlideIndex,
	);

	const { navigateToSlide } = useIframeMessaging(
		iframeRef,
		thumbnailRefs,
		slideFiles,
		setGeneratingSlides,
		setCurrentSlideIndex,
	);

	const mainPreviewUrl = useMemo(() => {
		if (!previewUrl) return '';
		return `${previewUrl}?t=${timestamps.main}`;
	}, [previewUrl, timestamps.main]);

	if (!previewUrl) {
		return (
			<div className={`${className} flex items-center justify-center bg-bg-3`}>
				<p className="text-text-primary/50">No preview available</p>
			</div>
		);
	}

	return (
		<div className={`${className} flex h-full`}>
			{/* Slide Explorer Sidebar */}
			<div
				ref={sidebarScrollRef}
				className="shrink-0 w-[260px] lg:w-[280px] xl:w-[300px] bg-bg-3 border-r border-border-primary h-full overflow-y-auto"
			>
				<div className={`${HEADER_STYLES.padding} ${HEADER_STYLES.container} flex items-center gap-2 ${HEADER_STYLES.textBase} font-semibold`}>
					<Presentation className="size-4 text-accent" />
					<span>Slides</span>
					<span className="ml-auto text-xs font-mono text-text-50/50">
						{slideFiles.length}
					</span>
				</div>
				<div className="flex flex-col p-4 gap-3">
					{slideFiles.map((slide) => (
						<button
							key={slide.index}
							onClick={() => navigateToSlide(slide.index)}
							className={clsx(
								'group relative rounded-lg overflow-hidden transition-all duration-200 border bg-bg-3/80',
								slide.index === currentSlideIndex
									? 'border-accent shadow-md'
									: 'border-border-primary hover:border-accent/50 hover:shadow-sm',
							)}
							title={`Slide ${slide.index + 1}: ${slide.fileName}`}
						>
							{/* Slide number badge */}
							<div
								className={clsx(
									'absolute top-2 left-2 z-10 text-xs font-medium px-2 py-0.5 rounded backdrop-blur-sm',
									slide.index === currentSlideIndex
										? 'bg-accent text-text-on-brand'
										: 'bg-bg-4/95 text-text-50/70 border border-border-primary',
								)}
							>
								{slide.index + 1}
							</div>

							{/* Slide thumbnail */}
							<div
								ref={(el) => {
									if (el) thumbnailRefs.current.set(slide.index, el);
								}}
								data-slide-index={slide.index}
								className="relative w-full aspect-video overflow-hidden rounded-md bg-bg-4"
							>
								{visibleThumbnails.has(slide.index) ? (
									<iframe
										key={`slide-${slide.index}-${timestamps.slides[slide.index] || timestamps.global}`}
										src={`${previewUrl}?showAllFragments=true&t=${timestamps.slides[slide.index] || timestamps.global}#/${slide.index}`}
										className="w-full h-full border-none pointer-events-none"
										title={`Slide ${slide.index + 1} preview`}
										style={{
											transform: 'scale(0.195) translateZ(0)',
											transformOrigin: 'top left',
											width: '512.8%',
											height: '512.8%',
											willChange: 'transform',
											backfaceVisibility: 'hidden',
											WebkitFontSmoothing: 'subpixel-antialiased',
										}}
										onLoad={() =>
											setFailedIframes((prev) => {
												const updated = new Set(prev);
												updated.delete(slide.index);
												return updated;
											})
										}
										onError={() => setFailedIframes((prev) => new Set([...prev, slide.index]))}
									/>
								) : (
									<div className="flex items-center justify-center h-full bg-bg-3/50">
										<Presentation className="size-8 text-text-primary/20" />
									</div>
								)}

								{generatingSlides.has(slide.filePath) && (
									<div className="absolute inset-0 bg-accent/20 backdrop-blur-sm flex items-center justify-center z-20">
										<div className="flex flex-col items-center gap-2">
											<div className="size-4 border-2 border-text-on-brand/30 border-t-text-on-brand rounded-full animate-spin" />
											<span className="text-xs font-medium text-text-on-brand">
												Updating...
											</span>
										</div>
									</div>
								)}

								{failedIframes.has(slide.index) && (
									<div className="absolute inset-0 bg-red-500/10 flex items-center justify-center z-20">
										<span className="text-xs text-red-400">Failed to load</span>
									</div>
								)}
							</div>

							{/* Slide filename */}
							<div className="px-3 py-1.5 bg-bg-2 border-t border-border-primary">
								<p className="text-xs font-mono text-text-50/60 truncate">
									{slide.fileName}
								</p>
							</div>
						</button>
					))}
				</div>
			</div>

			{/* Preview Area */}
			<div className="flex-1 min-h-0">
				{speakerMode ? (
					<div className="grid grid-cols-2 gap-2 h-full p-2">
						{/* Current Slide */}
						<div className="flex flex-col border border-text/10 rounded-lg overflow-hidden">
							<div className="px-3 py-2 bg-bg-2 border-b border-text/10">
								<div className="flex items-center gap-2">
									<Presentation className="size-4 text-accent" />
									<span className="text-sm font-medium text-text-primary">
										Current Slide
									</span>
								</div>
							</div>
							<div className="flex-1 min-h-0">
								<PreviewIframe
									ref={iframeRef}
									src={mainPreviewUrl}
									className="w-full h-full"
									title="Current Slide"
									shouldRefreshPreview={shouldRefreshPreview}
									manualRefreshTrigger={manualRefreshTrigger}
									webSocket={websocket}
								/>
							</div>
						</div>

						{/* Next Slide + Notes */}
						<div className="flex flex-col gap-2">
							<div className="flex-1 flex flex-col border border-text/10 rounded-lg overflow-hidden">
								<div className="px-3 py-2 bg-bg-2 border-b border-text/10">
									<div className="flex items-center gap-2">
										<Presentation className="size-4 text-text-primary/50" />
										<span className="text-sm font-medium text-text-primary/70">
											Next Slide
										</span>
									</div>
								</div>
								<div className="flex-1 min-h-0 bg-bg-3 flex items-center justify-center">
									<div className="text-text-primary/50 text-sm text-center p-4">
										Next slide preview
										<br />
										<span className="text-xs">
											(requires Reveal.js integration)
										</span>
									</div>
								</div>
							</div>

							{/* Speaker Notes */}
							<div className="flex-1 flex flex-col border border-text/10 rounded-lg overflow-hidden">
								<div className="px-3 py-2 bg-bg-2 border-b border-text/10">
									<span className="text-sm font-medium text-text-primary/70">
										Speaker Notes
									</span>
								</div>
								<div className="flex-1 min-h-0 bg-bg-3 p-3 overflow-y-auto">
									<p className="text-sm text-text-primary/50">
										Speaker notes will appear here
									</p>
								</div>
							</div>
						</div>
					</div>
				) : previewMode ? (
					<div className="grid grid-cols-2 gap-2 h-full p-2">
						{/* Current Slide */}
						<div className="flex flex-col border border-text/10 rounded-lg overflow-hidden">
							<div className="px-3 py-2 bg-bg-2 border-b border-text/10">
								<div className="flex items-center gap-2">
									<Presentation className="size-4 text-accent" />
									<span className="text-sm font-medium text-text-primary">
										Current
									</span>
								</div>
							</div>
							<div className="flex-1 min-h-0">
								<PreviewIframe
									ref={iframeRef}
									src={mainPreviewUrl}
									className="w-full h-full"
									title="Current Slide"
									shouldRefreshPreview={shouldRefreshPreview}
									manualRefreshTrigger={manualRefreshTrigger}
									webSocket={websocket}
								/>
							</div>
						</div>

						{/* Next Slide */}
						<div className="flex flex-col border border-text/10 rounded-lg overflow-hidden">
							<div className="px-3 py-2 bg-bg-2 border-b border-text/10">
								<div className="flex items-center gap-2">
									<Presentation className="size-4 text-text-primary/50" />
									<span className="text-sm font-medium text-text-primary/70">
										Next
									</span>
								</div>
							</div>
							<div className="flex-1 min-h-0 bg-bg-3 flex items-center justify-center">
								<div className="text-text-primary/50 text-sm text-center p-4">
									Next slide preview
									<br />
									<span className="text-xs">
										(requires Reveal.js integration)
									</span>
								</div>
							</div>
						</div>
					</div>
				) : (
					<div className="w-full h-full flex items-center justify-center bg-bg-2 p-6">
						<div className="w-full h-full max-w-[95%] max-h-[95%] flex items-center justify-center">
							<div className="w-full aspect-video rounded-xl overflow-hidden shadow-2xl border border-border-primary/30 bg-bg-4">
								<PreviewIframe
									ref={iframeRef}
									src={mainPreviewUrl}
									className="w-full h-full"
									title="Presentation"
									shouldRefreshPreview={shouldRefreshPreview}
									manualRefreshTrigger={manualRefreshTrigger}
									webSocket={websocket}
								/>
							</div>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
