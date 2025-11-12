import { useState, useEffect, useCallback, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Loader } from 'lucide-react';
import clsx from 'clsx';
import { motion, AnimatePresence } from 'framer-motion';
import { createSlideParser, type ParsedSlide } from '../utils/slide-parser';
import type { FileType } from '../hooks/use-chat';

interface SpectaclePreviewProps {
	deckFile: FileType;
	isGenerating: boolean;
}

export function SpectaclePreview({
	deckFile,
	isGenerating,
}: SpectaclePreviewProps) {
	const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
	const [slides, setSlides] = useState<ParsedSlide[]>([]);
	const [estimatedTotal, setEstimatedTotal] = useState(0);

	// Parse slides from deck file content
	const parser = useMemo(() => createSlideParser(), []);

	useEffect(() => {
		if (!deckFile.fileContents) return;

		// Feed content to parser
		parser.reset();
		parser.feed(deckFile.fileContents);

		// Get extracted slides
		const extractedSlides = parser.getSlides();
		setSlides(extractedSlides);
		setEstimatedTotal(parser.estimateTotalSlides());

		// Only auto-advance during active generation (when new slides are being added)
		// Once generation is complete, stay on current slide
		if (isGenerating && extractedSlides.length > slides.length) {
			// Find last complete slide (backwards compatible)
			let lastCompleteIndex = -1;
			for (let i = extractedSlides.length - 1; i >= 0; i--) {
				if (extractedSlides[i].isComplete) {
					lastCompleteIndex = i;
					break;
				}
			}
			if (lastCompleteIndex !== -1 && lastCompleteIndex > currentSlideIndex) {
				setCurrentSlideIndex(lastCompleteIndex);
			}
		}
	}, [deckFile.fileContents, parser, isGenerating, slides.length, currentSlideIndex]);

	const currentSlide = slides[currentSlideIndex];
	const completeCount = slides.filter((s) => s.isComplete).length;

	const handlePrevSlide = useCallback(() => {
		setCurrentSlideIndex((prev) => Math.max(0, prev - 1));
	}, []);

	const handleNextSlide = useCallback(() => {
		const maxIndex = slides.filter((s) => s.isComplete).length - 1;
		setCurrentSlideIndex((prev) => Math.min(maxIndex, prev + 1));
	}, [slides]);

	// Keyboard navigation
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'ArrowLeft') {
				e.preventDefault();
				handlePrevSlide();
			} else if (e.key === 'ArrowRight') {
				e.preventDefault();
				handleNextSlide();
			}
		};

		window.addEventListener('keydown', handleKeyDown);
		return () => window.removeEventListener('keydown', handleKeyDown);
	}, [handlePrevSlide, handleNextSlide]);

	return (
		<div className="flex-1 flex flex-col overflow-hidden">
			{/* Generation status indicator */}
			{isGenerating && (
				<div className="flex items-center justify-center gap-2 px-4 py-2 bg-accent/10 border-b border-accent/20">
					<Loader className="size-3 animate-spin text-accent" />
					<span className="text-xs text-accent">
						Generating slides... {completeCount} of {estimatedTotal || '?'} complete
					</span>
				</div>
			)}

			{/* Slide viewport */}
			<div className="flex-1 flex items-center justify-center p-8 overflow-hidden">
				{slides.length === 0 ? (
					<div className="flex flex-col items-center gap-4 text-text-secondary">
						<Loader className="size-8 animate-spin text-accent" />
						<div className="text-sm">Waiting for slides...</div>
					</div>
				) : (
					<AnimatePresence mode="wait">
						<motion.div
							key={currentSlideIndex}
							initial={{ opacity: 0, x: 20 }}
							animate={{ opacity: 1, x: 0 }}
							exit={{ opacity: 0, x: -20 }}
							transition={{ duration: 0.2 }}
							className="w-full h-full max-w-4xl max-h-[600px] flex items-center justify-center"
						>
							<SlidePreview
								slide={currentSlide}
								isGenerating={isGenerating && !currentSlide?.isComplete}
							/>
						</motion.div>
					</AnimatePresence>
				)}
			</div>

			{/* Navigation footer */}
			{slides.length > 0 && (
				<div className="flex items-center justify-between px-4 h-14 bg-bg-2 border-t border-border-primary">
					<button
						onClick={handlePrevSlide}
						disabled={currentSlideIndex === 0}
						className={clsx(
							'p-2 rounded-md transition-colors',
							currentSlideIndex === 0
								? 'text-text-tertiary cursor-not-allowed'
								: 'text-text-primary hover:bg-bg-3'
						)}
						aria-label="Previous slide"
					>
						<ChevronLeft className="size-5" />
					</button>

					<div className="flex items-center gap-2">
						{/* Slide dots */}
						<div className="flex items-center gap-1">
							{slides
								.filter((s) => s.isComplete)
								.map((_, idx) => (
									<button
										key={idx}
										onClick={() => setCurrentSlideIndex(idx)}
										className={clsx(
											'rounded-full transition-all',
											idx === currentSlideIndex
												? 'size-2 bg-accent'
												: 'size-1.5 bg-text-tertiary hover:bg-text-secondary'
										)}
										aria-label={`Go to slide ${idx + 1}`}
									/>
								))}
						</div>

						{/* Slide counter */}
						<span className="text-sm text-text-secondary font-mono">
							{currentSlideIndex + 1} / {completeCount}
							{estimatedTotal > completeCount && ` (~${estimatedTotal})`}
						</span>
					</div>

					<button
						onClick={handleNextSlide}
						disabled={currentSlideIndex >= completeCount - 1}
						className={clsx(
							'p-2 rounded-md transition-colors',
							currentSlideIndex >= completeCount - 1
								? 'text-text-tertiary cursor-not-allowed'
								: 'text-text-primary hover:bg-bg-3'
						)}
						aria-label="Next slide"
					>
						<ChevronRight className="size-5" />
					</button>
				</div>
			)}
		</div>
	);
}

/**
 * Simplified slide preview component that renders slide content
 */
function SlidePreview({
	slide,
	isGenerating,
}: {
	slide: ParsedSlide;
	isGenerating: boolean;
}) {
	if (!slide) {
		return (
			<div className="flex items-center justify-center text-text-tertiary">
				No slide content
			</div>
		);
	}

	// Extract backgroundColor from slide props
	const bgColorMatch = slide.jsx.match(/backgroundColor=["'](\w+)["']/);
	const backgroundColor = bgColorMatch ? bgColorMatch[1] : 'primary';

	// Simple content extraction (this is a simplified preview, not full Spectacle rendering)
	const content = extractSlideContent(slide.jsx);

	// Map Spectacle theme colors to our theme
	const bgColorMap: Record<string, string> = {
		primary: 'bg-gradient-to-br from-blue-600 to-blue-800',
		secondary: 'bg-gradient-to-br from-purple-600 to-purple-800',
		tertiary: 'bg-gradient-to-br from-green-600 to-green-800',
		quaternary: 'bg-gradient-to-br from-orange-600 to-orange-800',
	};

	return (
		<div
			className={clsx(
				'relative w-full h-full rounded-lg shadow-2xl p-12 flex flex-col',
				bgColorMap[backgroundColor] || bgColorMap.primary
			)}
		>
			{content.heading && (
				<h1 className="text-5xl font-bold text-white mb-6">{content.heading}</h1>
			)}

			{content.text.map((text, idx) => (
				<p key={idx} className="text-2xl text-white/90 mb-4">
					{text}
				</p>
			))}

			{content.listItems.length > 0 && (
				<ul className="text-xl text-white/90 space-y-3 ml-6">
					{content.listItems.map((item, idx) => (
						<li key={idx} className="list-disc">
							{item}
						</li>
					))}
				</ul>
			)}

			{content.code && (
				<pre className="bg-black/30 rounded p-4 overflow-auto text-sm text-white font-mono mt-4">
					<code>{content.code}</code>
				</pre>
			)}

			{isGenerating && (
				<div className="absolute bottom-4 right-4 flex items-center gap-2 text-white/60 text-sm">
					<Loader className="size-4 animate-spin" />
					<span>Generating...</span>
				</div>
			)}
		</div>
	);
}

/**
 * Extract content from slide JSX for preview rendering
 * This is a simplified parser - not meant to handle all JSX cases
 */
function extractSlideContent(jsx: string): {
	heading: string;
	text: string[];
	listItems: string[];
	code: string;
} {
	const content = {
		heading: '',
		text: [] as string[],
		listItems: [] as string[],
		code: '',
	};

	// Extract Heading content
	const headingMatch = jsx.match(/<Heading[^>]*>(.*?)<\/Heading>/s);
	if (headingMatch) {
		content.heading = headingMatch[1].trim();
	}

	// Extract Text content
	const textMatches = jsx.matchAll(/<Text[^>]*>(.*?)<\/Text>/gs);
	for (const match of textMatches) {
		content.text.push(match[1].trim());
	}

	// Extract ListItem content
	const listMatches = jsx.matchAll(/<ListItem[^>]*>(.*?)<\/ListItem>/gs);
	for (const match of listMatches) {
		content.listItems.push(match[1].trim());
	}

	// Extract CodePane content
	const codeMatch = jsx.match(/<CodePane[^>]*>(.*?)<\/CodePane>/s);
	if (codeMatch) {
		content.code = codeMatch[1].trim();
	}

	return content;
}
