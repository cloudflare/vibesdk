import { Presentation } from 'lucide-react';
import { PreviewIframe } from './preview-iframe';
import { WebSocket } from 'partysocket';
import clsx from 'clsx';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { FileType, TemplateDetails } from '@/api-types';

interface PresentationPreviewProps {
	previewUrl: string;
	className?: string;
	shouldRefreshPreview?: boolean;
	manualRefreshTrigger?: number;
	webSocket?: WebSocket | null;
	speakerMode?: boolean;
	previewMode?: boolean;
	allFiles?: FileType[];
	templateDetails?: TemplateDetails | null;
}

interface SlideInfo {
	index: number;
	fileName: string;
	filePath: string;
}

export function PresentationPreview({
	previewUrl,
	className = '',
	shouldRefreshPreview,
	manualRefreshTrigger,
	webSocket,
	speakerMode = false,
	previewMode = false,
	allFiles = [],
	templateDetails = null,
}: PresentationPreviewProps) {
	const iframeRef = useRef<HTMLIFrameElement>(null);
	const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
	const [totalSlides, setTotalSlides] = useState(0);

	const [visibleThumbnails, setVisibleThumbnails] = useState<Set<number>>(new Set());
	const [slideTimestamps, setSlideTimestamps] = useState<Record<number, number>>({});
	const [globalRefreshTimestamp, setGlobalRefreshTimestamp] = useState<number>(Date.now());
	const [mainIframeTimestamp, setMainIframeTimestamp] = useState<number>(Date.now());
	const [generatingSlides, setGeneratingSlides] = useState<Set<number>>(new Set());
	const [failedIframes, setFailedIframes] = useState<Set<number>>(new Set());

	const thumbnailRefs = useRef<Map<number, HTMLDivElement>>(new Map());
	const lastProcessedFiles = useRef<Set<string>>(new Set());
	const sidebarScrollRef = useRef<HTMLDivElement>(null);
	const scrollPosition = useRef<number>(0);
	const wasGenerating = useRef(false);

	const slideDirectory = templateDetails?.slideDirectory || 'public/slides';

	const manifestFile = allFiles.find((file) => file.filePath === `${slideDirectory}/manifest.json`);
	let manifestSlides: SlideInfo[] = [];

	if (manifestFile?.fileContents) {
		try {
			const parsed = JSON.parse(manifestFile.fileContents);
			if (Array.isArray(parsed.slides)) {
				manifestSlides = parsed.slides.map((name: string, idx: number) => ({
					index: idx,
					fileName: name.replace(/\.(json|jsx|tsx)$/i, ''),
					filePath: `${slideDirectory}/${name}`,
				}));
			}
		} catch (error) {
			console.error('Failed to parse manifest.json for slides:', error);
		}
	}

	const discoveredSlides: SlideInfo[] = allFiles
		.filter(
			(file) =>
				file.filePath.startsWith(`${slideDirectory}/`) &&
				/\.(jsx|tsx|json)$/i.test(file.filePath) &&
				!file.filePath.endsWith('manifest.json'),
		)
		.map((file) => {
			const match = file.filePath.match(/(?:Slide)?(\d+)/i);
			const slideNum = match ? parseInt(match[1], 10) : 0;
			return {
				index: slideNum > 0 ? slideNum - 1 : 0,
				fileName: file.filePath.split('/').pop()?.replace(/\.(jsx|tsx|json)$/i, '') || '',
				filePath: file.filePath,
			};
		})
		.sort((a, b) => a.index - b.index || a.fileName.localeCompare(b.fileName));

	const slideFiles: SlideInfo[] = manifestSlides.length > 0 ? manifestSlides : discoveredSlides;

	useEffect(() => {
		const handler = (event: Event) => {
			const detail = (event as CustomEvent).detail as { type: string; path?: string; chunk?: string };
			if (!detail || !iframeRef.current?.contentWindow) return;
			if (!detail.path || !detail.path.includes('/slides/')) return;
			if (!['file_generating', 'file_chunk', 'file_generated'].includes(detail.type)) return;
			const match = detail.path.match(/(\d+)/);
			if (match) {
				const idx = parseInt(match[1], 10) - 1;
				if (!Number.isNaN(idx)) {
					setSlideTimestamps((prev) => ({ ...prev, [idx]: Date.now() }));
				}
			}
			try {
				iframeRef.current.contentWindow.postMessage(detail, '*');
			} catch (error) {
				console.error('Failed to forward presentation file event to iframe', error);
			}
		};
		window.addEventListener('presentation-file-event', handler);
		return () => window.removeEventListener('presentation-file-event', handler);
	}, []);

	useEffect(() => {
		const handleMessage = (event: MessageEvent) => {
			const { type, data } = event.data;

			switch (type) {
				case 'REVEAL_READY':
					if (typeof data?.totalSlides === 'number') {
						setTotalSlides(data.totalSlides);
					}
					break;

				case 'SLIDE_CHANGED':
					if (typeof data?.currentSlide === 'number') {
						setCurrentSlideIndex(data.currentSlide);
					}
					break;

				case 'SLIDE_COUNT_RESPONSE':
					if (typeof data?.totalSlides === 'number') {
						setTotalSlides(data.totalSlides);
					}
					break;

				case 'CURRENT_SLIDE_RESPONSE':
					if (typeof data?.currentSlide === 'number') {
						setCurrentSlideIndex(data.currentSlide);
					}
					break;


				default:
					break;
			}
		};

		window.addEventListener('message', handleMessage);
		return () => window.removeEventListener('message', handleMessage);
	}, []);

	const displaySlides: SlideInfo[] =
		slideFiles.length > 0
			? slideFiles
			: Array.from({ length: totalSlides || 5 }, (_, i) => ({
					index: i,
					fileName: `slide-${i + 1}`,
					filePath: `public/slides/Slide${String(i + 1).padStart(2, '0')}.jsx`,
				}));

	useEffect(() => {
		if (displaySlides.length > 0 && visibleThumbnails.size === 0) {
			const initialVisible = displaySlides.slice(0, 3).map((s) => s.index);
			setVisibleThumbnails(new Set(initialVisible));
		}
	}, [displaySlides, visibleThumbnails.size]);

	useEffect(() => {
		const observer = new IntersectionObserver(
			(entries) => {
				entries.forEach((entry) => {
					const index = parseInt(entry.target.getAttribute('data-slide-index') || '0', 10);
					if (entry.isIntersecting) {
						setVisibleThumbnails((prev) => new Set([...prev, index]));
					}
				});
			},
			{
				rootMargin: '200px',
				threshold: 0.01,
			},
		);

		thumbnailRefs.current.forEach((ref) => observer.observe(ref));

		return () => observer.disconnect();
	}, [displaySlides]);

	useEffect(() => {
		const generatingFiles = allFiles.filter((f) => f.filePath.startsWith(`${slideDirectory}/`) && f.isGenerating === true);

		const indices = generatingFiles
			.map((f) => {
				const match = slideFiles.find((s) => s.filePath === f.filePath);
				return match ? match.index : -1;
			})
			.filter((i) => i >= 0);

		setGeneratingSlides(new Set(indices));
	}, [allFiles, slideDirectory, slideFiles]);

	useEffect(() => {
		const completedFiles = allFiles.filter(
			(f) =>
				(f.filePath.startsWith('public/slides/') ||
					f.filePath.includes('slides-styles') ||
					f.filePath === 'public/_dev/Presentation.jsx' ||
					f.filePath.startsWith('public/_dev/runtime/')) &&
				!f.isGenerating &&
				f.fileContents,
		);

		completedFiles.forEach((file) => {
			const fileKey = `${file.filePath}-${file.fileContents?.length || 0}`;

			if (lastProcessedFiles.current.has(fileKey)) return;

			lastProcessedFiles.current.add(fileKey);

			const isGlobalFile =
				file.filePath.includes('slides-styles') ||
				file.filePath === 'public/_dev/Presentation.jsx' ||
				file.filePath.startsWith('public/_dev/runtime/');

			if (isGlobalFile) {
				const now = Date.now();
				setGlobalRefreshTimestamp(now);
				setMainIframeTimestamp(now);
			} else if (file.filePath.startsWith('public/slides/')) {
				const match = file.filePath.match(/Slide(\d+)/);
				if (match) {
					const slideIndex = parseInt(match[1], 10) - 1;
					const now = Date.now();

					setSlideTimestamps((prev) => ({ ...prev, [slideIndex]: now }));

					if (slideIndex === currentSlideIndex) {
						setMainIframeTimestamp(now);
					}
				}
			}
		});
	}, [allFiles, currentSlideIndex]);

	useEffect(() => {
		if (generatingSlides.size > 0 && !wasGenerating.current) {
			scrollPosition.current = sidebarScrollRef.current?.scrollTop || 0;
			wasGenerating.current = true;
		} else if (generatingSlides.size === 0 && wasGenerating.current) {
			requestAnimationFrame(() => {
				if (sidebarScrollRef.current) {
					sidebarScrollRef.current.scrollTop = scrollPosition.current;
				}
			});
			wasGenerating.current = false;
		}
	}, [generatingSlides]);

	useEffect(() => {
		const currentIndices = new Set(displaySlides.map((s) => s.index));
		thumbnailRefs.current.forEach((_, index) => {
			if (!currentIndices.has(index)) {
				thumbnailRefs.current.delete(index);
			}
		});
	}, [displaySlides]);

	useEffect(() => {
		const currentSlidePaths = new Set(displaySlides.map((s) => s.filePath));

		lastProcessedFiles.current = new Set(
			Array.from(lastProcessedFiles.current).filter((key) => {
				const filePath = key.split('-')[0];
				return currentSlidePaths.has(filePath) || !filePath.startsWith('public/slides/');
			}),
		);
	}, [displaySlides]);

	const mainPreviewUrl = useMemo(() => {
		return `${previewUrl}?t=${mainIframeTimestamp}`;
	}, [previewUrl, mainIframeTimestamp]);

	const sendMessageToIframe = useCallback(
		(message: { type: string; data?: unknown }) => {
			if (iframeRef.current?.contentWindow) {
				iframeRef.current.contentWindow.postMessage(message, '*');
			}
		},
		[],
	);

	const handleSlideClick = useCallback(
		(index: number) => {
			sendMessageToIframe({
				type: 'NAVIGATE_TO_SLIDE',
				data: { index },
			});
		},
		[sendMessageToIframe],
	);

	return (
		<div className={`${className} flex h-full`}>
			{/* Slide Explorer Sidebar */}
			<div
				ref={sidebarScrollRef}
				className="shrink-0 w-[260px] lg:w-[280px] xl:w-[300px] bg-bg-3 border-r border-border-primary h-full overflow-y-auto"
			>
				<div className="p-4 px-5 text-sm flex items-center gap-2 text-text-50/80 font-semibold border-b border-border-primary bg-bg-2">
					<Presentation className="size-4 text-accent" />
					<span>Slides</span>
					<span className="ml-auto text-xs font-mono text-text-50/50">
						{displaySlides.length}
					</span>
				</div>
				<div className="flex flex-col p-4 gap-3">
					{displaySlides.map((slide) => (
						<button
							key={slide.index}
							onClick={() => handleSlideClick(slide.index)}
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
										key={`slide-${slide.index}-${slideTimestamps[slide.index] || globalRefreshTimestamp}`}
										src={`${previewUrl}?showAllFragments=true&t=${slideTimestamps[slide.index] || globalRefreshTimestamp}#/${slide.index}`}
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

								{generatingSlides.has(slide.index) && (
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
									webSocket={webSocket}
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
									webSocket={webSocket}
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
									webSocket={webSocket}
								/>
							</div>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
