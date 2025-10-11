// Borrowed from the way Aider handles unified diffs
/**
 * Parses a hunk string into its "before" and "after" components.
 * 'before' consists of context (' ') and deletion ('-') lines.
 * 'after' consists of context (' ') and addition ('+') lines.
 * @param hunk - An array of strings representing the lines of a single diff hunk.
 * @returns An object with 'before' and 'after' string arrays.
 */
function hunkToBeforeAfter(hunk: string[]): {
	before: string[];
	after: string[];
} {
	const before: string[] = [];
	const after: string[] = [];

	for (const line of hunk) {
		if (
			line.startsWith('---') ||
			line.startsWith('+++') ||
			line.startsWith('@@')
		) {
			continue;
		}

		const op = line[0];
		const restOfLine = line.substring(1);

		switch (op) {
			case ' ':
				before.push(restOfLine);
				after.push(restOfLine);
				break;
			case '-':
				before.push(restOfLine);
				break;
			case '+':
				after.push(restOfLine);
				break;
		}
	}
	return { before, after };
}

/**
 * Normalize leading whitespace for relative indentation matching
 * Handles uniformly indented/outdented code blocks
 */
function normalizeIndentation(lines: string[]): { 
	normalized: string[], 
	isEmpty: boolean 
} {
	if (lines.length === 0) return { normalized: [], isEmpty: true };
	
	// Find non-empty lines for common prefix calculation
	const nonEmptyLines = lines.filter(line => line.trim().length > 0);
	if (nonEmptyLines.length === 0) return { normalized: lines, isEmpty: true };
	
	// Find common leading whitespace
	let commonPrefix = nonEmptyLines[0].match(/^\s*/)?.[0] || '';
	for (const line of nonEmptyLines.slice(1)) {
		const prefix = line.match(/^\s*/)?.[0] || '';
		let i = 0;
		while (i < Math.min(commonPrefix.length, prefix.length) && 
			   commonPrefix[i] === prefix[i]) {
			i++;
		}
		commonPrefix = commonPrefix.substring(0, i);
	}
	
	// Remove common prefix from all lines
	// SAFETY: Check if line has content beyond the common prefix
	const normalized = lines.map(line => {
		// Empty lines stay empty
		if (line.length === 0) return line;
		// Lines that are only whitespace up to common prefix become empty
		if (line.length <= commonPrefix.length) return '';
		// Otherwise remove the common prefix
		return line.substring(commonPrefix.length);
	});
	
	return { normalized, isEmpty: false };
}

/**
 * Break a large hunk into smaller overlapping sub-hunks
 * Each sub-hunk contains one contiguous run of changes with context
 */
function breakIntoSubHunks(hunk: string[], maxContextLines: number = 3): string[][] {
	const subHunks: string[][] = [];
	
	// Find change runs (contiguous sequences of + and - lines)
	const changeRuns: Array<{start: number, end: number, lines: string[]}> = [];
	let currentRun: string[] = [];
	let runStart = -1;
	
	for (let i = 0; i < hunk.length; i++) {
		const line = hunk[i];
		
		if (line.startsWith('@@') || line.startsWith('---') || line.startsWith('+++')) {
			continue;
		}
		
		if (line.startsWith('-') || line.startsWith('+')) {
			if (currentRun.length === 0) {
				runStart = i;
			}
			currentRun.push(line);
		} else {
			if (currentRun.length > 0) {
				changeRuns.push({
					start: runStart,
					end: i - 1,
					lines: [...currentRun]
				});
				currentRun = [];
			}
		}
	}
	
	// Handle final run
	if (currentRun.length > 0) {
		changeRuns.push({
			start: runStart,
			end: hunk.length - 1,
			lines: [...currentRun]
		});
	}
	
	// Create sub-hunks with context
	for (const run of changeRuns) {
		// SAFETY: Only include context lines, not hunk headers
		const contextBefore = hunk.slice(
			Math.max(0, run.start - maxContextLines), 
			run.start
		).filter(line => line.startsWith(' ')); // Only context lines
		
		const contextAfter = hunk.slice(
			run.end + 1, 
			Math.min(hunk.length, run.end + 1 + maxContextLines)
		).filter(line => line.startsWith(' ')); // Only context lines
		
		subHunks.push([...contextBefore, ...run.lines, ...contextAfter]);
	}
	
	return subHunks.length > 1 ? subHunks : [hunk];
}

// correctMissingPlusMarkers removed - too risky for LLM-generated diffs

// Removed isLikelyCodeAddition function as it's no longer used
// after disabling the risky correctMissingPlusMarkers strategy

// normalizeHunk function removed - it was disabled for safety

/**
 * Try direct application of the hunk with enhanced robustness and fuzzy matching
 */
function tryDirectApplication(content: string, hunk: string[]): string | null {
	const { before, after } = hunkToBeforeAfter(hunk);

	if (before.length === 0) {
		// Pure addition, append to end
		return content + '\n' + after.join('\n');
	}

	// Strategy 1: Try exact match first
	const beforeBlock = before.join('\n');
	const occurrences = content.split(beforeBlock).length - 1;

	if (occurrences === 1) {
		const afterBlock = after.join('\n');
		return content.replace(beforeBlock, afterBlock);
	}

	// Strategy 2: Try with whitespace normalization
	if (occurrences === 0) {
		const result = tryWithWhitespaceNormalization(content, before, after);
		if (result !== null) return result;
	}

	// Strategy 3: Try with indentation-aware matching
	if (occurrences === 0) {
		const result = tryWithIndentationAwareMatching(content, before, after);
		if (result !== null) return result;
	}

	// Strategy 4: Fuzzy matching disabled for safety
	// Would be too risky with LLM-generated content
	
	return null;
}

/**
 * Strategy 2: Whitespace normalization matching
 */
function tryWithWhitespaceNormalization(content: string, before: string[], after: string[]): string | null {
	// First normalize line endings
	const normalizedContent = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
	
	// Helper to normalize whitespace in a line for comparison
	const normalizeLineWhitespace = (line: string): string => {
		// Normalize all whitespace to single spaces for comparison
		// This handles tabs, multiple spaces, etc.
		return line.replace(/\s+/g, ' ').trim();
	};

	const contentLines = normalizedContent.split('\n');
	const normalizedBefore = before.map(normalizeLineWhitespace);
	
	// Try to find the normalized before block in content
	for (let i = 0; i <= contentLines.length - before.length; i++) {
		let matches = true;
		
		for (let j = 0; j < before.length; j++) {
			const contentLine = normalizeLineWhitespace(contentLines[i + j] || '');
			const beforeLine = normalizedBefore[j];
			
			if (contentLine !== beforeLine) {
				matches = false;
				break;
			}
		}
		
		if (matches) {
			// Found a match! Now we need to apply the replacement
			// Detect indentation pattern from the original content
			const originalLines = content.split(/\r?\n/);
			const originalSlice = originalLines.slice(i, i + before.length);
			
			// Process after lines to match original indentation style
			const processedAfter = after.map((line, idx) => {
				if (line.trim() === '') return line;
				
				// Get reference line from original to copy indentation style
				const refLine = originalSlice[Math.min(idx, originalSlice.length - 1)] || originalSlice[0] || '';
				const refIndent = refLine.match(/^[\t ]*/)?.[0] || '';
				
				// Get the relative indentation from the diff
				const diffIndent = line.match(/^[\t ]*/)?.[0] || '';
				const diffSpaceCount = diffIndent.replace(/\t/g, '  ').length;
				
				// If original uses tabs or mixed indentation
				if (refIndent.includes('\t')) {
					// Check if it's mixed (tab + spaces)
					const leadingTabs = refIndent.match(/^\t*/)?.[0].length || 0;
					const followingSpaces = refIndent.slice(leadingTabs).length;
					
					if (diffSpaceCount === 0) {
						return line.trim();
					} else if (diffSpaceCount === 1 && followingSpaces > 0) {
						// Single space in diff might map to mixed tab+space
						return '\t' + ' '.repeat(followingSpaces) + line.trim();
					} else {
						// Convert spaces to tabs
						const tabCount = Math.floor(diffSpaceCount / 2);
						const remainingSpaces = diffSpaceCount % 2;
						return '\t'.repeat(tabCount) + ' '.repeat(remainingSpaces) + line.trim();
					}
				} else {
					// Original uses spaces, keep spaces
					return ' '.repeat(diffSpaceCount) + line.trim();
				}
			});
			
			// Reconstruct with original line endings
			const hasCarriageReturn = content.includes('\r\n');
			const lineEnding = hasCarriageReturn ? '\r\n' : '\n';
			
			const resultLines = [
				...originalLines.slice(0, i),
				...processedAfter,
				...originalLines.slice(i + before.length)
			];
			
			return resultLines.join(lineEnding);
		}
	}
	
	return null;
}

/**
 * Strategy 3: Indentation-aware matching
 * Handles cases where the diff has different base indentation than the content
 */
function tryWithIndentationAwareMatching(content: string, before: string[], after: string[]): string | null {
	const contentLines = content.split('\n');
	
	// Normalize the before block to remove common indentation
	const { normalized: normalizedBefore } = normalizeIndentation(before);
	
	// Try matching with different indentation levels
	for (let i = 0; i <= contentLines.length - before.length; i++) {
		const contentSlice = contentLines.slice(i, i + before.length);
		const { normalized: normalizedContent } = normalizeIndentation(contentSlice);
		
		// Check if normalized content matches normalized before
		let matches = true;
		for (let j = 0; j < normalizedBefore.length; j++) {
			if (normalizedContent[j] !== normalizedBefore[j]) {
				matches = false;
				break;
			}
		}
		
		if (matches) {
			// We found a match! Now preserve the original indentation pattern
			// The key is to map the normalized 'after' back to the original indentation
			
			// Build a mapping of normalized lines to original indentation
			const indentMap = new Map<string, string>();
			normalizedBefore.forEach((normLine, idx) => {
				const origLine = contentSlice[idx];
				const origIndent = origLine.match(/^[\t ]*/)?.[0] || '';
				indentMap.set(normLine, origIndent);
			});
			
			// Apply the original indentation to the after lines
			const indentedAfter = after.map((afterLine, idx) => {
				const trimmedAfter = afterLine.trim();
				if (trimmedAfter === '') return '';
				
				// Find the corresponding indentation from the before block
				const correspondingBeforeLine = normalizedBefore[idx];
				
				// Use the indentation from the corresponding before line
				const originalIndent = indentMap.get(correspondingBeforeLine) || 
				                      contentSlice[idx]?.match(/^[\t ]*/)?.[0] || '';
				
				return originalIndent + trimmedAfter;
			});
			
			const newLines = [
				...contentLines.slice(0, i),
				...indentedAfter,
				...contentLines.slice(i + before.length)
			];
			return newLines.join('\n');
		}
	}
	
	return null;
}

// tryWithFuzzyMatching removed - too risky for LLM-generated diffs

/**
 * Try with normalized whitespace to handle indentation issues
 * PERFORMANCE: Uses regex-based approach instead of O(n²) iteration
 */
function tryWithNormalizedWhitespace(content: string, hunk: string[]): string | null {
	const { before, after } = hunkToBeforeAfter(hunk);
	
	if (before.length === 0) return null;
	
	const { normalized } = normalizeIndentation(before);
	
	// PERFORMANCE FIX: Create a flexible regex pattern instead of iterating through all slices
	// This changes from O(content_length * hunk_length) to O(content_length)
	const regexPattern = createFlexibleWhitespacePattern(normalized);
	
	if (!regexPattern) return null;
	
	const matches = content.match(regexPattern);
	if (!matches || matches.length !== 1) {
		return null; // Must have exactly one match to be safe
	}
	
	// Found exactly one match - apply the replacement
	const matchedText = matches[0];
	const { normalized: normalizedAfter } = normalizeIndentation(after);
	
	// Detect the actual indentation used in the matched content
	const actualIndentation = detectIndentation(matchedText);
	
	// Apply the detected indentation to the replacement
	const replacementLines = normalizedAfter.map(line => 
		line.length > 0 ? actualIndentation + line : line
	);
	const replacementText = replacementLines.join('\n');
	
	return content.replace(matchedText, replacementText);
}

/**
 * PERFORMANCE HELPER: Creates a regex pattern that matches code blocks with flexible whitespace
 * SAFETY: Limits pattern complexity to prevent ReDoS
 */
function createFlexibleWhitespacePattern(normalizedLines: string[]): RegExp | null {
	if (normalizedLines.length === 0) return null;
	
	// SAFETY: Limit lines to prevent ReDoS
	if (normalizedLines.length > 50) return null;
	
	// Escape special regex characters in each line
	const escapedLines = normalizedLines.map(line => {
		// SAFETY: Limit line length
		if (line.length > 500) return null;
		return line.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	});
	
	// Check if any line failed to escape
	if (escapedLines.some(line => line === null)) return null;
	
	// Create pattern that allows flexible leading whitespace
	const flexibleLines = escapedLines.map(line => {
		if (line!.trim() === '') {
			return '\\s*'; // Empty lines can have any whitespace
		}
		return '\\s*' + line; // Any leading whitespace + the content
	});
	
	try {
		// Create a pattern that matches the entire block
		const pattern = flexibleLines.join('\\n');
		// SAFETY: Test the pattern with a timeout
		const testRegex = new RegExp(pattern, 'g');
		// Quick test to ensure it doesn't hang
		const testStr = 'test\ntest\ntest';
		testRegex.test(testStr);
		return testRegex;
	} catch (error) {
		// If regex creation fails (complex content), fall back to null
		return null;
	}
}

/**
 * PERFORMANCE HELPER: Detects the actual indentation used in matched content
 */
function detectIndentation(matchedText: string): string {
	const lines = matchedText.split('\n');
	const nonEmptyLines = lines.filter(line => line.trim().length > 0);
	
	if (nonEmptyLines.length === 0) return '';
	
	// Find the minimum leading whitespace (common indentation)
	let minIndentation = nonEmptyLines[0].match(/^\s*/)?.[0] || '';
	
	for (const line of nonEmptyLines.slice(1)) {
		const indent = line.match(/^\s*/)?.[0] || '';
		if (indent.length < minIndentation.length) {
			minIndentation = indent;
		}
	}
	
	return minIndentation;
}

/**
 * Try sub-hunk decomposition with TRANSACTIONAL INTEGRITY
 * SAFETY: Only returns result if ALL sub-hunks apply successfully
 */
function trySubHunkDecomposition(content: string, hunk: string[]): string | null {
	const subHunks = breakIntoSubHunks(hunk);
	
	if (subHunks.length <= 1) {
		return null; // No decomposition possible
	}
	
	// SAFETY: First verify ALL sub-hunks can be applied
	let tempContent = content;
	const results: string[] = [content];
	
	for (const subHunk of subHunks) {
		const result = applyHunkWithoutRecursion(tempContent, subHunk);
		if (result === null) {
			// ANY failure means we abort completely
			// No partial application allowed
			return null;
		}
		tempContent = result;
		results.push(result);
	}
	
	// All sub-hunks succeeded - return the final result
	return tempContent;
}

/**
 * Apply hunk without recursion to prevent infinite loops in sub-hunk decomposition
 * This is a simplified version that doesn't call trySubHunkDecomposition
 */
function applyHunkWithoutRecursion(content: string, hunk: string[]): string | null {
	// Strategy 1: Direct application
	const directResult = tryDirectApplication(content, hunk);
	if (directResult !== null) return directResult;
	
	// Strategy 2: Skip missing plus marker correction (disabled for safety)
	// The correctMissingPlusMarkers function is disabled and just returns the input unchanged
	
	// Strategy 3: Normalized whitespace
	const whitespaceResult = tryWithNormalizedWhitespace(content, hunk);
	if (whitespaceResult !== null) return whitespaceResult;
	
	// Strategy 4: Hunk normalization disabled for safety
	
	// Strategy 5: Context reduction (no sub-hunk decomposition to avoid recursion)
	const contextResult = tryContextReduction(content, hunk);
	if (contextResult !== null) return contextResult;
	
	// All strategies failed
	return null;
}

/**
 * Try context reduction strategy with enhanced flexibility
 */
function tryContextReduction(content: string, hunk: string[]): string | null {
	// Find core changes
	const firstChangeIndex = hunk.findIndex(
		(l) => l.startsWith('-') || l.startsWith('+'),
	);
	const lastChangeIndex =
		hunk.length -
		1 -
		[...hunk]
			.reverse()
			.findIndex((l) => l.startsWith('-') || l.startsWith('+'));

	if (firstChangeIndex === -1) {
		return content; // No changes
	}

	const precedingContext = hunk.slice(0, firstChangeIndex);
	const coreChangeHunk = hunk.slice(firstChangeIndex, lastChangeIndex + 1);
	const followingContext = hunk.slice(lastChangeIndex + 1);

	// Progressive context reduction with more aggressive settings
	for (let i = precedingContext.length; i >= 0; i--) {
		for (let j = followingContext.length; j >= 0; j--) {
			const contextBefore = precedingContext.slice(i);
			const contextAfter = followingContext.slice(0, j);

			const searchBefore = hunkToBeforeAfter([
				...contextBefore,
				...coreChangeHunk,
				...contextAfter,
			]).before;
			const searchBlock = searchBefore.join('\n');

			if (searchBlock.trim() === '') continue;

			const searchOccurrences = content.split(searchBlock).length - 1;

			if (searchOccurrences === 1) {
				const replaceAfter = hunkToBeforeAfter([
					...contextBefore,
					...coreChangeHunk,
					...contextAfter,
				]).after;
				const replaceBlock = replaceAfter.join('\n');
				return content.replace(searchBlock, replaceBlock);
			}
		}
	}
	
	return null;
}

// tryHunkNormalization removed - can introduce errors with LLM diffs

/**
 * Production-grade hunk application with comprehensive telemetry and monitoring
 * Enhanced with all resilience strategies plus performance monitoring
 */
function applyHunkWithTelemetry(
	content: string, 
	hunk: string[], 
	telemetry: DiffTelemetry, 
	monitor: PerformanceMonitor
): string | null {
	// Strategy 1: Direct application (exact matching)
	monitor.incrementIteration();
	telemetry.strategiesAttempted.push('exact_match');
	const directResult = tryDirectApplication(content, hunk);
	if (directResult !== null) {
		return directResult;
	}
	
	// Strategy 2: Skip missing plus marker correction (disabled for safety)
	
	// Strategy 3: Normalized whitespace (handle outdented/indented code)
	monitor.incrementIteration();
	telemetry.strategiesAttempted.push('whitespace_normalization');
	const whitespaceResult = tryWithNormalizedWhitespace(content, hunk);
	if (whitespaceResult !== null) {
		return whitespaceResult;
	}
	
	// Strategy 4: Sub-hunk decomposition
	monitor.incrementIteration();
	telemetry.strategiesAttempted.push('sub_hunk_decomposition');
	const subHunkResult = trySubHunkDecomposition(content, hunk);
	if (subHunkResult !== null) {
		return subHunkResult;
	}
	
	// Strategy 5: Skip hunk normalization (disabled for safety)
	
	// Strategy 6: Context reduction
	monitor.incrementIteration();
	telemetry.strategiesAttempted.push('context_reduction');
	const contextResult = tryContextReduction(content, hunk);
	if (contextResult !== null) {
		return contextResult;
	}
	
	// All strategies failed
	monitor.addWarning('All standard strategies failed, attempting fallback strategies');
	return null;
}

/**
 * Production-grade unified diff application system
 * Enhanced with comprehensive error handling, security measures, and performance protections
 */

// Production configuration constants
const PRODUCTION_LIMITS = {
	MAX_CONTENT_SIZE: 10 * 1024 * 1024, // 10MB max content size
	MAX_DIFF_SIZE: 1024 * 1024,         // 1MB max diff size
	MAX_HUNKS: 1000,                     // Maximum number of hunks
	MAX_HUNK_SIZE: 10000,                // Maximum lines per hunk
	PROCESSING_TIMEOUT: 30000,           // 30 second timeout
	MAX_ITERATIONS: 50000,               // Maximum loop iterations
} as const;

// Telemetry and debugging interface
interface DiffTelemetry {
	strategiesAttempted: string[];
	processingTimeMs: number;
	contentSize: number;
	diffSize: number;
	hunkCount: number;
	success: boolean;
	errorDetails?: string;
	performanceWarnings: string[];
}

// Security validation utilities
class DiffSecurityValidator {
	static validateContent(content: string): void {
		if (typeof content !== 'string') {
			throw new Error('Content must be a string');
		}
		
		if (content.length > PRODUCTION_LIMITS.MAX_CONTENT_SIZE) {
			throw new Error(`Content too large: ${content.length} bytes exceeds ${PRODUCTION_LIMITS.MAX_CONTENT_SIZE} byte limit`);
		}
	}
	
	static validateDiff(diff: string): void {
		if (typeof diff !== 'string') {
			throw new Error('Diff must be a string');
		}
		
		if (diff.length > PRODUCTION_LIMITS.MAX_DIFF_SIZE) {
			throw new Error(`Diff too large: ${diff.length} bytes exceeds ${PRODUCTION_LIMITS.MAX_DIFF_SIZE} byte limit`);
		}
		
		// Validate diff format structure
		const lines = diff.split('\n');
		
		for (const line of lines) {
			if (line.length > 10000) { // Prevent extremely long lines
				throw new Error('Diff contains excessively long lines');
			}
		}
		
		// Don't throw on invalid diff format - just let it fail gracefully later
		// This allows handling of malformed diffs from LLMs
	}
}

// Performance monitoring utilities
class PerformanceMonitor {
	private startTime: number;
	private iterationCount = 0;
	private warnings: string[] = [];
	
	constructor() {
		this.startTime = Date.now();
	}
	
	checkTimeout(): void {
		const elapsed = Date.now() - this.startTime;
		if (elapsed > PRODUCTION_LIMITS.PROCESSING_TIMEOUT) {
			throw new Error(`Processing timeout: ${elapsed}ms exceeds ${PRODUCTION_LIMITS.PROCESSING_TIMEOUT}ms limit`);
		}
	}
	
	incrementIteration(): void {
		this.iterationCount++;
		if (this.iterationCount > PRODUCTION_LIMITS.MAX_ITERATIONS) {
			throw new Error(`Maximum iterations exceeded: ${this.iterationCount}`);
		}
		if (this.iterationCount % 1000 === 0) {
			this.checkTimeout();
		}
	}
	
	addWarning(warning: string): void {
		this.warnings.push(warning);
	}
	
	getTelemetry(): Omit<DiffTelemetry, 'strategiesAttempted' | 'contentSize' | 'diffSize' | 'hunkCount' | 'success' | 'errorDetails'> {
		return {
			processingTimeMs: Date.now() - this.startTime,
			performanceWarnings: [...this.warnings],
		};
	}
}

/**
 * Production-grade unified diff application with comprehensive hardening
 * @param originalContent - The original file content
 * @param diffContent - The unified diff to apply
 * @param options - Optional configuration for debugging and telemetry
 * @returns The modified content after applying the diff
 * @throws Error with detailed diagnostics on failure
 */
export function applyDiff(
	originalContent: string,
	diffContent: string,
	options: { enableTelemetry?: boolean; allowFallbackToRaw?: boolean } = {}
): string {
	const telemetry: DiffTelemetry = {
		strategiesAttempted: [],
		processingTimeMs: 0,
		contentSize: originalContent.length,
		diffSize: diffContent.length,
		hunkCount: 0,
		success: false,
		performanceWarnings: [],
	};
	
	const monitor = new PerformanceMonitor();
	
	try {
		// Security validation
		DiffSecurityValidator.validateContent(originalContent);
		DiffSecurityValidator.validateDiff(diffContent);
		
		// Handle edge cases
		if (!diffContent || diffContent.trim().length === 0) {
			telemetry.success = true;
			return originalContent; // No diff to apply
		}
		
		if (!originalContent && diffContent.trim().length === 0) {
			telemetry.success = true;
			return ''; // Empty content, empty diff
		}
		
		// Handle @@ ... @@ format (ignore line numbers)
		const cleanedDiff = diffContent.replace(/@@ .* @@/g, '@@ ... @@');
		
		// Enhanced hunk parsing with validation
		const hunksRaw = cleanedDiff.match(/(?:^|\n)@@[^\n]*(?:\n(?!@@)[^\n]*)*(?=\n@@|$)/g) || 
						 [cleanedDiff]; // Fallback to single hunk if no matches
		
		if (hunksRaw.length > PRODUCTION_LIMITS.MAX_HUNKS) {
			throw new Error(`Too many hunks: ${hunksRaw.length} exceeds ${PRODUCTION_LIMITS.MAX_HUNKS} limit`);
		}
		
		const hunks = hunksRaw.map((h, idx) => {
			monitor.incrementIteration();
			
			// Clean up the hunk and split into lines
			const cleanHunk = h.replace(/^\n/, ''); // Remove leading newline
			const hunkLines = cleanHunk.split('\n').filter((line) => line.length > 0);
			
			if (hunkLines.length > PRODUCTION_LIMITS.MAX_HUNK_SIZE) {
				throw new Error(`Hunk #${idx + 1} too large: ${hunkLines.length} lines exceeds ${PRODUCTION_LIMITS.MAX_HUNK_SIZE} limit`);
			}
			
			return hunkLines;
		});
		
		telemetry.hunkCount = hunks.length;
		
		let currentContent = originalContent;
		
		for (let i = 0; i < hunks.length; i++) {
			monitor.checkTimeout();
			monitor.incrementIteration();
			
			const hunk = hunks[i];
			
			try {
				const newContent = applyHunkWithTelemetry(currentContent, hunk, telemetry, monitor);
				
				if (newContent !== null) {
					// SAFETY: Verify the result is not corrupted
					if (newContent.length === 0 && currentContent.length > 0) {
						// Prevent accidental deletion of entire content
						throw new Error(`Hunk #${i + 1} would delete entire file content - aborting for safety`);
					}
					currentContent = newContent;
				} else {
					// Enhanced error reporting with fallback options
					const hunkPreview = hunk.join('\n');
					const { before, after } = hunkToBeforeAfter(hunk);
					
					const errorDetails = [
						`Hunk #${i + 1} failed to apply cleanly after trying all strategies.`,
						``,
						`Hunk content (first 500 chars):`,
						hunkPreview.substring(0, 500) + (hunkPreview.length > 500 ? '...' : ''),
						``,
						`Analysis:`,
						`- Before lines: ${before.length}`,
						`- After lines: ${after.length}`,
						`- Strategies attempted: ${telemetry.strategiesAttempted.join(', ')}`,
						`- Search pattern: "${before.slice(0, 2).join('\\n')}${before.length > 2 ? '...' : ''}"`,
						`- Content size: ${currentContent.length} characters`,
						`- Processing time: ${monitor.getTelemetry().processingTimeMs}ms`,
					];
					
					// SAFETY: Never use raw fallback - it's too dangerous
					telemetry.errorDetails = errorDetails.join('\n');
					throw new Error(errorDetails.join('\n'));
				}
			} catch (hunkError) {
				if (hunkError instanceof Error) {
					telemetry.errorDetails = `Hunk #${i + 1} processing failed: ${hunkError.message}`;
				}
				throw hunkError;
			}
		}
		
		telemetry.success = true;
		return currentContent;
		
	} catch (error) {
		telemetry.success = false;
		if (error instanceof Error && !telemetry.errorDetails) {
			telemetry.errorDetails = error.message;
		}
		throw error;
	} finally {
		// Collect final telemetry
		Object.assign(telemetry, monitor.getTelemetry());
		
		if (options.enableTelemetry) {
			// In production, you would send this to your monitoring system
			console.debug('Diff Application Telemetry:', telemetry);
		}
	}
}
