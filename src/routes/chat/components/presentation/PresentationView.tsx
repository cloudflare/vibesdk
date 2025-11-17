import { useState, useRef, useCallback, type ComponentType } from 'react';
import { X } from 'lucide-react';
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
}

export function PresentationView({
	slides,
	manifestMetadata,
	slidesCss,
	tailwindConfigScript,
}: PresentationViewProps) {
	const [fullscreenMode, setFullscreenMode] = useState(false);
	const [currentIndex, setCurrentIndex] = useState(0);
	const containerRef = useRef<HTMLDivElement>(null);
	const [thumbnails, setThumbnails] = useState<Record<number, string>>({});

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

	const handleFullscreen = useCallback(() => {
		if (!document.fullscreenElement) {
			containerRef.current?.requestFullscreen();
			setFullscreenMode(true);
		} else {
			document.exitFullscreen();
			setFullscreenMode(false);
		}
	}, []);

	return (
		<div
			ref={containerRef}
			className={
				fullscreenMode
					? 'fixed inset-0 z-50 bg-bg-4'
					: 'flex h-full bg-bg-3 presentation-print-root v1-presentation-root'
			}
		>
			{fullscreenMode && (
				<button
					onClick={handleFullscreen}
					className="fixed top-4 right-4 z-50 p-2 bg-bg-2 hover:bg-bg-1 rounded-lg transition-colors text-text-50 border border-border-primary"
					title="Exit fullscreen"
				>
					<X className="size-5" />
				</button>
			)}

			{!fullscreenMode && (
				<SlideExplorer
					slides={slides}
					currentIndex={currentIndex}
					onSlideClick={handleSlideClick}
					thumbnailsByIndex={thumbnails}
				/>
			)}

			<div className={fullscreenMode ? 'w-full h-full' : 'flex-1 bg-bg-4 overflow-hidden'}>
				<PresentationSandbox
					slides={slides}
					currentIndex={currentIndex}
					onSlideChange={handleSlideChange}
					manifestMetadata={manifestMetadata ?? null}
					slidesCss={slidesCss}
					tailwindConfigScript={tailwindConfigScript}
				/>
				<PresentationSandbox
					slides={slides}
					currentIndex={0}
					manifestMetadata={manifestMetadata ?? null}
					slidesCss={slidesCss}
					tailwindConfigScript={tailwindConfigScript}
					onThumbnailCapture={handleThumbnailCapture}
					hidden
				/>
			</div>
		</div>
	);
}
