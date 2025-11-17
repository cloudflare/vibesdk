import { useState, useRef, useCallback, useEffect, type ComponentType } from 'react';
import { SlideExplorer } from './SlideExplorer';
import { PresentationSandbox } from './components/PresentationSandbox';
import type { ManifestMetadata } from './utils/ManifestParser';

export interface CompiledSlide {
    id: string;
    index: number;
    Component: ComponentType<unknown>;
    originalFile: { filePath: string; fileContents: string };
    hasError: boolean;
    error?: Error;
}
interface PresentationViewProps {
	slides: CompiledSlide[];
	manifestMetadata?: ManifestMetadata | null;
	slidesCss?: string;
	tailwindConfigScript?: string;
	speakerMode?: boolean;
	previewMode?: boolean;
	fullscreenMode?: boolean;
	onFullscreenChange?: (isFullscreen: boolean) => void;
}

export function PresentationView({
	slides,
	manifestMetadata,
	slidesCss,
	tailwindConfigScript,
	speakerMode = false,
	previewMode = false,
	fullscreenMode = false,
	onFullscreenChange,
}: PresentationViewProps) {
	const [currentIndex, setCurrentIndex] = useState(0);
	const containerRef = useRef<HTMLDivElement>(null);
	const [thumbnails, setThumbnails] = useState<Record<number, string>>({});
	const fullscreenRef = useRef(fullscreenMode);

	const handleSlideChange = useCallback((index: number) => {
		setCurrentIndex(index);
	}, []);

	const handleSlideClick = useCallback((index: number) => {
		setCurrentIndex(index);
	}, []);

	const handleThumbnailCapture = useCallback((index: number, dataUrl: string) => {
		setThumbnails((prev) => {
			if (prev[index] === dataUrl) return prev;
			return { ...prev, [index]: dataUrl };
		});
	}, []);

	const [elapsedTime, setElapsedTime] = useState(0);
	const [currentTime, setCurrentTime] = useState(new Date());

	useEffect(() => {
		if (speakerMode) {
			const startTime = Date.now();
			const interval = setInterval(() => {
				setElapsedTime(Math.floor((Date.now() - startTime) / 1000));
				setCurrentTime(new Date());
			}, 1000);
			return () => clearInterval(interval);
		}
	}, [speakerMode]);

	useEffect(() => {
		fullscreenRef.current = fullscreenMode;
	}, [fullscreenMode]);

	useEffect(() => {
		const handleFullscreenChange = () => {
			const isFullscreen = !!document.fullscreenElement;
			if (fullscreenRef.current !== isFullscreen && onFullscreenChange) {
				onFullscreenChange(isFullscreen);
			}
		};

		document.addEventListener('fullscreenchange', handleFullscreenChange);
		return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
	}, [onFullscreenChange]);

	useEffect(() => {
		if (speakerMode || previewMode) {
			const handleKeyPress = (e: KeyboardEvent) => {
				if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') {
					e.preventDefault();
					setCurrentIndex((prev) => Math.min(prev + 1, slides.length - 1));
				} else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
					e.preventDefault();
					setCurrentIndex((prev) => Math.max(prev - 1, 0));
				}
			};
			window.addEventListener('keydown', handleKeyPress);
			return () => window.removeEventListener('keydown', handleKeyPress);
		}
	}, [speakerMode, previewMode, slides.length]);

	const formatTime = (seconds: number) => {
		const hours = Math.floor(seconds / 3600);
		const mins = Math.floor((seconds % 3600) / 60);
		const secs = seconds % 60;
		if (hours > 0) {
			return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
		}
		return `${mins}:${secs.toString().padStart(2, '0')}`;
	};

	const formatCurrentTime = () => {
		return currentTime.toLocaleTimeString('en-US', {
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit',
		});
	};

	const showExplorer = !fullscreenMode && !speakerMode && !previewMode;

	const sandboxProps = {
		slides,
		manifestMetadata: manifestMetadata ?? null,
		slidesCss,
		tailwindConfigScript,
	};

	const slideContainerClass = 'flex-1 bg-bg-4 rounded-lg overflow-hidden border border-border-primary';

	const renderSlideView = (slideIndex: number, interactive: boolean = false) => (
		<PresentationSandbox
			{...sandboxProps}
			currentIndex={slideIndex}
			{...(interactive && { onSlideChange: handleSlideChange })}
		/>
	);

	const renderNextSlide = (textSize: 'text-sm' | 'text-xs' = 'text-sm') => (
		<>
			<div className={`${textSize} font-medium text-text-50 px-2`}>
				{currentIndex < slides.length - 1 ? `Next Slide (${currentIndex + 2})` : 'End'}
			</div>
			<div className={slideContainerClass}>
				{currentIndex < slides.length - 1 ? (
					renderSlideView(currentIndex + 1)
				) : (
					<div className={`flex items-center justify-center h-full text-text-50/50 ${textSize}`}>
						{textSize === 'text-xs' ? 'End' : 'End of presentation'}
					</div>
				)}
			</div>
		</>
	);

	const renderCurrentSlide = () => (
		<>
			<div className="text-sm font-medium text-text-50 px-2">
				Current Slide ({currentIndex + 1} / {slides.length})
			</div>
			<div className={slideContainerClass}>
				{renderSlideView(currentIndex, true)}
			</div>
		</>
	);

	return (
		<div
			ref={containerRef}
			className={
				fullscreenMode
					? 'fixed inset-0 z-50 bg-bg-4'
					: 'flex h-full bg-bg-3 presentation-print-root v1-presentation-root'
			}
		>
			{showExplorer && (
				<SlideExplorer
					slides={slides}
					currentIndex={currentIndex}
					onSlideClick={handleSlideClick}
					thumbnailsByIndex={thumbnails}
				/>
			)}

			{speakerMode ? (
				<div className="flex-1 flex gap-4 p-4 bg-bg-3 overflow-hidden">
					<div className="flex-1 flex flex-col gap-3 overflow-hidden">
						{renderCurrentSlide()}
						<div className="bg-bg-4 rounded-lg p-3 border border-border-primary">
							<div className="text-xs font-medium text-text-50/70 mb-2">Speaker Notes</div>
							<div className="text-xs text-text-50/50 italic">
								Speaker notes will be supported in a future update.
							</div>
						</div>
					</div>
					<div className="w-80 flex flex-col gap-3 overflow-hidden">
						<div className="bg-bg-4 rounded-lg p-3 border border-border-primary">
							<div className="space-y-3">
								<div>
									<div className="text-xs text-text-50/70 mb-1">Elapsed Time</div>
									<div className="text-xl font-mono font-bold text-text-50">
										{formatTime(elapsedTime)}
									</div>
								</div>
								<div>
									<div className="text-xs text-text-50/70 mb-1">Current Time</div>
									<div className="text-lg font-mono font-bold text-text-50">
										{formatCurrentTime()}
									</div>
								</div>
							</div>
						</div>
						{renderNextSlide('text-xs')}
					</div>
				</div>
			) : previewMode ? (
				<div className="flex-1 flex gap-4 p-4 bg-bg-3 overflow-hidden">
					<div className="flex-1 flex flex-col gap-2 overflow-hidden">
						{renderCurrentSlide()}
					</div>
					<div className="flex-1 flex flex-col gap-2 overflow-hidden">
						{renderNextSlide()}
					</div>
				</div>
			) : (
				<div className={fullscreenMode ? 'w-full h-full' : 'flex-1 bg-bg-4 overflow-hidden'}>
					{renderSlideView(currentIndex, true)}
				</div>
			)}

			<PresentationSandbox
				{...sandboxProps}
				currentIndex={0}
				onThumbnailCapture={handleThumbnailCapture}
				hidden
			/>
		</div>
	);
}
