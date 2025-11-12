export interface ParsedSlide {
	index: number;
	jsx: string;
	isComplete: boolean;
}

/**
 * Progressive JSX parser that extracts complete <Slide> components from streaming content
 * Similar to createRepairingJSONParser but for React/JSX
 */
export class SlideParser {
	private buffer: string = '';
	private slides: ParsedSlide[] = [];
	private lastExtractedIndex: number = 0;

	/**
	 * Feed new chunk of JSX content to the parser
	 */
	feed(chunk: string): void {
		this.buffer += chunk;
		this.extractSlides();
	}

	/**
	 * Get all currently extracted slides
	 */
	getSlides(): ParsedSlide[] {
		return this.slides;
	}

	/**
	 * Get the total number of complete slides extracted
	 */
	getCompleteSlideCount(): number {
		return this.slides.filter((s) => s.isComplete).length;
	}

	/**
	 * Estimate total number of slides based on buffer content
	 */
	estimateTotalSlides(): number {
		// Count all <Slide occurrences (both complete and incomplete)
		const slideMatches = this.buffer.match(/<Slide/g);
		return slideMatches ? slideMatches.length : 0;
	}

	/**
	 * Get progress of current incomplete slide (0-100)
	 */
	getCurrentSlideProgress(): number {
		const incompleteSlides = this.slides.filter((s) => !s.isComplete);
		if (incompleteSlides.length === 0) return 0;

		const lastSlide = incompleteSlides[incompleteSlides.length - 1];
		const jsx = lastSlide.jsx;

		// Estimate based on typical slide patterns
		let progress = 0;

		// Has heading
		if (jsx.includes('<Heading')) progress += 20;
		// Has text/content
		if (jsx.includes('<Text') || jsx.includes('<UnorderedList')) progress += 30;
		// Has layout
		if (jsx.includes('<FlexBox') || jsx.includes('<Grid')) progress += 20;
		// Has closing tags
		if (jsx.includes('</FlexBox>') || jsx.includes('</Grid>')) progress += 15;
		// Has notes
		if (jsx.includes('<Notes')) progress += 15;

		return Math.min(progress, 95); // Never show 100% until complete
	}

	/**
	 * Reset the parser state
	 */
	reset(): void {
		this.buffer = '';
		this.slides = [];
		this.lastExtractedIndex = 0;
	}

	/**
	 * Extract complete <Slide> components from the buffer
	 */
	private extractSlides(): void {
		let searchStart = this.lastExtractedIndex;

		while (true) {
			// Find next <Slide opening tag
			const slideStart = this.buffer.indexOf('<Slide', searchStart);
			if (slideStart === -1) break;

			// Find the end of the opening tag (could be <Slide> or <Slide ...>)
			const openTagEnd = this.buffer.indexOf('>', slideStart);
			if (openTagEnd === -1) {
				// Opening tag not complete yet
				this.updateIncompleteSlide(slideStart);
				break;
			}

			// Check if it's a self-closing tag <Slide ... />
			const isSelfClosing =
				openTagEnd > 0 && this.buffer[openTagEnd - 1] === '/';
			if (isSelfClosing) {
				// Self-closing slide (unusual but possible)
				const slideJsx = this.buffer.substring(slideStart, openTagEnd + 1);
				this.addSlide(slideJsx, true);
				searchStart = openTagEnd + 1;
				this.lastExtractedIndex = searchStart;
				continue;
			}

			// Look for matching </Slide> closing tag
			const slideEnd = this.findMatchingClosingTag(
				this.buffer,
				slideStart,
				openTagEnd + 1
			);

			if (slideEnd === -1) {
				// Closing tag not found yet, slide is incomplete
				this.updateIncompleteSlide(slideStart);
				break;
			}

			// Extract complete slide
			const slideJsx = this.buffer.substring(slideStart, slideEnd);
			this.addSlide(slideJsx, true);
			searchStart = slideEnd;
			this.lastExtractedIndex = searchStart;
		}
	}

	/**
	 * Find the matching closing </Slide> tag, accounting for nested tags
	 */
	private findMatchingClosingTag(
		content: string,
		start: number,
		searchFrom: number
	): number {
		let depth = 1; // We've already found one opening <Slide>
		let pos = searchFrom;

		while (pos < content.length && depth > 0) {
			// Look for next opening or closing Slide tag
			const nextOpen = content.indexOf('<Slide', pos);
			const nextClose = content.indexOf('</Slide>', pos);

			if (nextClose === -1) {
				// No closing tag found
				return -1;
			}

			if (nextOpen !== -1 && nextOpen < nextClose) {
				// Found another opening tag before the closing one
				// Check if it's self-closing
				const openEnd = content.indexOf('>', nextOpen);
				if (openEnd > 0 && content[openEnd - 1] === '/') {
					// Self-closing, doesn't affect depth
					pos = openEnd + 1;
				} else {
					// Regular opening tag, increase depth
					depth++;
					pos = openEnd + 1;
				}
			} else {
				// Found closing tag
				depth--;
				if (depth === 0) {
					// This is our matching closing tag
					return nextClose + '</Slide>'.length;
				}
				pos = nextClose + '</Slide>'.length;
			}
		}

		return -1; // No matching closing tag found
	}

	/**
	 * Add or update a slide in the slides array
	 */
	private addSlide(jsx: string, isComplete: boolean): void {
		const existingIndex = this.slides.findIndex((s) => !s.isComplete);

		if (existingIndex !== -1 && isComplete) {
			// Update existing incomplete slide to complete
			this.slides[existingIndex] = {
				index: this.slides[existingIndex].index,
				jsx,
				isComplete: true,
			};
		} else if (existingIndex === -1) {
			// Add new slide
			this.slides.push({
				index: this.slides.length,
				jsx,
				isComplete,
			});
		}
	}

	/**
	 * Update the last incomplete slide with new content
	 */
	private updateIncompleteSlide(slideStart: number): void {
		const partialJsx = this.buffer.substring(slideStart);
		const existingIndex = this.slides.findIndex((s) => !s.isComplete);

		if (existingIndex !== -1) {
			// Update existing incomplete slide
			this.slides[existingIndex] = {
				...this.slides[existingIndex],
				jsx: partialJsx,
			};
		} else {
			// Add new incomplete slide
			this.slides.push({
				index: this.slides.length,
				jsx: partialJsx,
				isComplete: false,
			});
		}
	}
}

/**
 * Factory function to create a new slide parser
 */
export function createSlideParser(): SlideParser {
	return new SlideParser();
}
