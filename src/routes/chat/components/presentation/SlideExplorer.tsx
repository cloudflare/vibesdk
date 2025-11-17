import { Presentation } from 'lucide-react';
import clsx from 'clsx';
import type { CompiledSlide } from './PresentationView';
import { SlideThumbnail } from './components/SlideThumbnail';
import { ThumbnailErrorBoundary } from './components/ThumbnailErrorBoundary';

interface SlideExplorerProps {
	slides: CompiledSlide[];
	currentIndex: number;
	onSlideClick: (index: number) => void;
	thumbnailsByIndex?: Record<number, string>;
}

export function SlideExplorer({
	slides,
	currentIndex,
	onSlideClick,
	thumbnailsByIndex,
}: SlideExplorerProps) {
	return (
		<div className="flex-shrink-0 w-[260px] lg:w-[280px] xl:w-[300px] bg-bg-3 border-r border-border-primary h-full overflow-y-auto presentation-print-sidebar">
			<div className="p-4 px-5 text-sm flex items-center gap-2 text-text-50/80 font-semibold border-b border-border-primary bg-bg-2">
				<Presentation className="size-4 text-accent" />
				<span>Slides</span>
				<span className="ml-auto text-xs font-mono text-text-50/50">{slides.length}</span>
			</div>
			<div className="flex flex-col p-4 gap-3">
				{slides.map((slide, index) => (
					<button
						key={slide.id}
						onClick={() => onSlideClick(index)}
						className={clsx(
							'group relative rounded-lg overflow-hidden transition-all duration-200 border bg-bg-3/80',
							index === currentIndex
								? 'border-accent shadow-md'
								: 'border-border-primary hover:border-accent/50 hover:shadow-sm'
						)}
						title={`Slide ${index + 1}`}
					>
						{/* Slide number badge */}
						<div
							className={clsx(
								'absolute top-2 left-2 z-10 text-xs font-medium px-2 py-0.5 rounded backdrop-blur-sm',
								index === currentIndex
									? 'bg-accent text-text-on-brand'
									: 'bg-bg-4/95 text-text-50/70 border border-border-primary'
							)}
						>
							{index + 1}
						</div>

						{/* Slide thumbnail */}
						<div className="relative w-full aspect-[16/9] overflow-hidden rounded-md presentation-thumbnail-bg">
							{thumbnailsByIndex?.[index] ? (
								<img
									src={thumbnailsByIndex[index]}
									alt={`Slide ${index + 1}`}
									className="w-full h-full object-cover"
								/>
							) : !slide.hasError ? (
								<ThumbnailErrorBoundary slideIndex={index}>
									<SlideThumbnail component={slide.Component} />
								</ThumbnailErrorBoundary>
							) : (
								<div className="w-full h-full flex items-center justify-center bg-bg-4 text-red-500 text-xs">
									Error loading slide
								</div>
							)}
						</div>

						{/* Slide filename */}
						<div className="px-3 py-1.5 bg-bg-2 border-t border-border-primary">
							<p className="text-xs font-mono text-text-50/60 truncate">
								{slide.originalFile.filePath.split('/').pop()?.replace('.jsx', '')}
							</p>
						</div>
					</button>
				))}
			</div>
		</div>
	);
}
