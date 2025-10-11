/**
 * Search/Replace Diff Format Implementation
 * 
 * This format is designed to be simple and reliable for LLM-generated diffs.
 * Each edit is specified as a search block followed by a replace block.
 * 
 * Format:
 * ```
 * <<<<<<< SEARCH
 * content to find
 * =======
 * content to replace with
 * >>>>>>> REPLACE
 * ```
 */

export enum MatchingStrategy {
	EXACT = 'exact',
	WHITESPACE_INSENSITIVE = 'whitespace-insensitive', 
	INDENTATION_PRESERVING = 'indentation-preserving',
	FUZZY = 'fuzzy'
}

interface SearchReplaceBlock {
	search: string;
	replace: string;
	lineNumber?: number; // For debugging
}

interface ParseResult {
	blocks: SearchReplaceBlock[];
	errors: string[];
}

interface MatchResult {
	found: boolean;
	startIndex: number;
	endIndex: number;
	matchedText: string;
	strategy: MatchingStrategy;
}

/**
 * Enhanced search/replace diff parser with robust error handling
 * Implements a clean state machine to handle malformed blocks, code fences, and edge cases
 */
function parseSearchReplaceDiff(diffContent: string): ParseResult {
	const blocks: SearchReplaceBlock[] = [];
	const errors: string[] = [];
	
	// Normalize line endings
	const normalizedDiff = diffContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
	const lines = normalizedDiff.split('\n');
	
	// State machine states
	enum ParserState {
		OUTSIDE,      // Outside any block
		IN_SEARCH,    // Collecting search content
		IN_REPLACE,   // Collecting replace content
		MALFORMED     // Block is malformed, skip to next
	}
	
	let state = ParserState.OUTSIDE;
	let currentBlock: { 
		search: string[]; 
		replace: string[]; 
		startLine: number;
		separatorType?: string;
	} | null = null;
	
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i].trim();
		
		switch (state) {
			case ParserState.OUTSIDE:
				if (line === '<<<<<<< SEARCH') {
					// Start new search block
					currentBlock = { 
						search: [], 
						replace: [], 
						startLine: i 
					};
					state = ParserState.IN_SEARCH;
				}
				// Ignore all other lines when outside blocks
				break;
				
			case ParserState.IN_SEARCH:
				if (line === '<<<<<<< SEARCH') {
					// Another SEARCH without REPLACE - previous block is orphaned
					if (currentBlock) {
						errors.push(`Block at line ${currentBlock.startLine + 1}: SEARCH block without corresponding REPLACE (followed by another SEARCH)`);
					}
					// Start new search block
					currentBlock = { 
						search: [], 
						replace: [], 
						startLine: i 
					};
					// Stay in IN_SEARCH state
				} else if (line === '=======' || line === '```') {
					// Found separator - transition to replace collection
					if (currentBlock) {
						currentBlock.separatorType = line;
						state = ParserState.IN_REPLACE;
					}
				} else {
					// Collect search content
					if (currentBlock) {
						currentBlock.search.push(lines[i]);
					}
				}
				break;
				
			case ParserState.IN_REPLACE:
				if (!currentBlock) {
					state = ParserState.OUTSIDE;
					break;
				}
				
				if (line === '>>>>>>> REPLACE') {
					// Found proper end marker
					completeBlock(currentBlock, blocks, errors);
					currentBlock = null;
					state = ParserState.OUTSIDE;
				} else if (currentBlock.separatorType === '```' && line === '```') {
					// Found code fence end
					completeBlock(currentBlock, blocks, errors);
					currentBlock = null;
					state = ParserState.OUTSIDE;
				} else if (line === '<<<<<<< SEARCH') {
					// New search block without proper end - complete current block first
					errors.push(`Block at line ${currentBlock.startLine + 1}: REPLACE block ended prematurely (no end marker found)`);
					completeBlock(currentBlock, blocks, errors);
					
					// Start new search block
					currentBlock = { 
						search: [], 
						replace: [], 
						startLine: i 
					};
					state = ParserState.IN_SEARCH;
				} else if (line === '=======') {
					// Additional separator in replace section - this is always malformed
					// Once we're in IN_REPLACE state, we shouldn't see another separator
					errors.push(`Block at line ${currentBlock.startLine + 1}: Malformed block with multiple separators - block ignored`);
					state = ParserState.MALFORMED;
				} else {
					// Collect replace content
					currentBlock.replace.push(lines[i]);
				}
				break;
				
			case ParserState.MALFORMED:
				if (line === '<<<<<<< SEARCH') {
					// Found next valid block - reset
					currentBlock = { 
						search: [], 
						replace: [], 
						startLine: i 
					};
					state = ParserState.IN_SEARCH;
				} else if (line === '```') {
					// Code fence might end malformed block - go back to outside state
					state = ParserState.OUTSIDE;
					currentBlock = null;
				}
				// Skip all other lines in malformed state
				break;
		}
	}
	
	// Handle incomplete blocks at end of file
	if (currentBlock) {
		switch (state) {
			case ParserState.IN_SEARCH:
				errors.push(`Block at line ${currentBlock.startLine + 1}: SEARCH block without corresponding REPLACE (end of file reached)`);
				break;
			case ParserState.IN_REPLACE:
				errors.push(`Block at line ${currentBlock.startLine + 1}: REPLACE block ended prematurely (end of file reached)`);
				break;
		}
	}
	
	return { blocks, errors };
	
	/**
	 * Helper function to complete and validate a block
	 */
	function completeBlock(
		block: { search: string[]; replace: string[]; startLine: number },
		blocks: SearchReplaceBlock[],
		errors: string[]
	): void {
		const cleanedSearch = block.search.join('\n').replace(/\n+$/, '');
		const cleanedReplace = block.replace.join('\n').replace(/\n+$/, '');
		
		// Allow empty search for pure additions (when search is just whitespace/newlines)
		// But reject truly empty search sections (no content at all)
		if (block.search.length === 0) {
			errors.push(`Block at line ${block.startLine + 1}: Empty SEARCH section`);
			return;
		}
		
		blocks.push({
			search: cleanedSearch,
			replace: cleanedReplace,
			lineNumber: block.startLine + 1
		});
	}
}

/**
 * Normalize whitespace by converting multiple whitespace chars to single spaces
 * and trimming line ends, while preserving line structure
 */
function normalizeWhitespace(text: string): string {
	return text
		.split('\n')
		.map(line => line.replace(/\s+/g, ' ').trim())
		.join('\n')
		.trim();
}

/**
 * Extract indentation pattern from text (preserves relative indentation)
 */
function extractIndentationPattern(text: string): { pattern: string; lines: string[] } {
	const lines = text.split('\n');
	const indentedLines = lines.map(line => {
		const match = line.match(/^(\s*)(.*$)/);
		return match ? { indent: match[1], content: match[2] } : { indent: '', content: line };
	});
	
	const pattern = indentedLines.map(({ indent, content }) => 
		content.trim() ? `${indent.length}:${content.trim()}` : ''
	).join('\n');
	
	return { pattern, lines: indentedLines.map(l => l.content.trim()) };
}

/**
 * Simple fuzzy matching using Levenshtein distance ratio
 */
function calculateSimilarity(a: string, b: string): number {
	if (a === b) return 1.0;
	if (a.length === 0 || b.length === 0) return 0.0;
	
	const maxLen = Math.max(a.length, b.length);
	const distance = levenshteinDistance(a, b);
	return 1 - (distance / maxLen);
}

function levenshteinDistance(a: string, b: string): number {
	const matrix = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(null));
	
	for (let i = 0; i <= a.length; i++) matrix[0][i] = i;
	for (let j = 0; j <= b.length; j++) matrix[j][0] = j;
	
	for (let j = 1; j <= b.length; j++) {
		for (let i = 1; i <= a.length; i++) {
			const substitutionCost = a[i - 1] === b[j - 1] ? 0 : 1;
			matrix[j][i] = Math.min(
				matrix[j][i - 1] + 1, // insertion
				matrix[j - 1][i] + 1, // deletion
				matrix[j - 1][i - 1] + substitutionCost // substitution
			);
		}
	}
	
	return matrix[b.length][a.length];
}

/**
 * Find text match using specified strategy
 */
function findMatch(content: string, searchText: string, strategy: MatchingStrategy): MatchResult {
	switch (strategy) {
		case MatchingStrategy.EXACT:
			return findExactMatch(content, searchText);
		
		case MatchingStrategy.WHITESPACE_INSENSITIVE:
			return findWhitespaceInsensitiveMatch(content, searchText);
		
		case MatchingStrategy.INDENTATION_PRESERVING:
			return findIndentationPreservingMatch(content, searchText);
		
		case MatchingStrategy.FUZZY:
			return findFuzzyMatch(content, searchText);
		
		default:
			return findExactMatch(content, searchText);
	}
}

function findExactMatch(content: string, searchText: string): MatchResult {
	const index = content.indexOf(searchText);
	if (index === -1) {
		return { found: false, startIndex: -1, endIndex: -1, matchedText: '', strategy: MatchingStrategy.EXACT };
	}
	return {
		found: true,
		startIndex: index,
		endIndex: index + searchText.length,
		matchedText: searchText,
		strategy: MatchingStrategy.EXACT
	};
}

function findWhitespaceInsensitiveMatch(content: string, searchText: string): MatchResult {
	const normalizedContent = normalizeWhitespace(content);
	const normalizedSearch = normalizeWhitespace(searchText);
	
	const index = normalizedContent.indexOf(normalizedSearch);
	if (index === -1) {
		return { found: false, startIndex: -1, endIndex: -1, matchedText: '', strategy: MatchingStrategy.WHITESPACE_INSENSITIVE };
	}
	
	// Find the actual text boundaries in the original content
	const actualMatch = findActualMatchBoundaries(content, searchText, normalizedContent, normalizedSearch, index);
	return {
		found: true,
		startIndex: actualMatch.start,
		endIndex: actualMatch.end,
		matchedText: content.slice(actualMatch.start, actualMatch.end),
		strategy: MatchingStrategy.WHITESPACE_INSENSITIVE
	};
}

function findIndentationPreservingMatch(content: string, searchText: string): MatchResult {
	const contentPattern = extractIndentationPattern(content);
	const searchPattern = extractIndentationPattern(searchText);
	
	// Look for pattern match in content
	const patternIndex = contentPattern.pattern.indexOf(searchPattern.pattern);
	if (patternIndex === -1) {
		return { found: false, startIndex: -1, endIndex: -1, matchedText: '', strategy: MatchingStrategy.INDENTATION_PRESERVING };
	}
	
	// Find actual boundaries in original content
	const actualMatch = findPatternMatchBoundaries(content, searchText, contentPattern, searchPattern);
	return {
		found: actualMatch.found,
		startIndex: actualMatch.start,
		endIndex: actualMatch.end,
		matchedText: actualMatch.found ? content.slice(actualMatch.start, actualMatch.end) : '',
		strategy: MatchingStrategy.INDENTATION_PRESERVING
	};
}

function findFuzzyMatch(content: string, searchText: string, threshold: number = 0.8): MatchResult {
	const searchLines = searchText.split('\n');
	const contentLines = content.split('\n');
	
	// IMPROVED: Analyze search quality and adjust threshold dynamically
	const quality = analyzeSearchBlockQuality(searchText, content);
	const adjustedThreshold = Math.max(threshold, quality.recommendedThreshold);
	
	// Use sliding window to find best match with context validation
	let bestMatch = { similarity: 0, contextScore: 0, startLine: -1, endLine: -1, overallScore: 0 };
	
	for (let i = 0; i <= contentLines.length - searchLines.length; i++) {
		const candidate = contentLines.slice(i, i + searchLines.length).join('\n');
		const similarity = calculateSimilarity(normalizeWhitespace(candidate), normalizeWhitespace(searchText));
		
		if (similarity >= adjustedThreshold) {
			// IMPROVED: Validate context for matches above threshold
			const contextScore = validateMatchContext(content, candidate, i, i + searchLines.length);
			const overallScore = similarity * 0.7 + contextScore * 0.3; // Weight similarity higher but include context
			
			if (overallScore > bestMatch.overallScore) {
				bestMatch = { similarity, contextScore, startLine: i, endLine: i + searchLines.length, overallScore };
			}
		}
	}
	
	if (bestMatch.overallScore === 0) {
		return { found: false, startIndex: -1, endIndex: -1, matchedText: '', strategy: MatchingStrategy.FUZZY };
	}
	
	// Convert line indices to character indices
	const beforeLines = contentLines.slice(0, bestMatch.startLine);
	const matchLines = contentLines.slice(bestMatch.startLine, bestMatch.endLine);
	
	const startIndex = beforeLines.join('\n').length + (beforeLines.length > 0 ? 1 : 0);
	const matchedText = matchLines.join('\n');
	const endIndex = startIndex + matchedText.length;
	
	return {
		found: true,
		startIndex,
		endIndex,
		matchedText,
		strategy: MatchingStrategy.FUZZY
	};
}

// Helper functions for boundary detection
function findActualMatchBoundaries(content: string, searchText: string, _normalizedContent: string, normalizedSearch: string, _normalizedIndex: number): { start: number; end: number } {
	// This is a simplified approach - in practice you'd want more sophisticated mapping
	// For now, we'll use the normalized positions as approximations
	const lines = content.split('\n');
	const searchLines = searchText.split('\n');
	
	// Find the line that contains our match
	for (let i = 0; i <= lines.length - searchLines.length; i++) {
		const candidate = lines.slice(i, i + searchLines.length).join('\n');
		if (normalizeWhitespace(candidate) === normalizedSearch) {
			const beforeLines = lines.slice(0, i);
			const startIndex = beforeLines.join('\n').length + (beforeLines.length > 0 ? 1 : 0);
			return { start: startIndex, end: startIndex + candidate.length };
		}
	}
	
	// Fallback to approximate positions
	return { start: _normalizedIndex, end: _normalizedIndex + normalizedSearch.length };
}

function findPatternMatchBoundaries(content: string, searchText: string, _contentPattern: { pattern: string; lines: string[] }, searchPattern: { pattern: string; lines: string[] }): { found: boolean; start: number; end: number } {
	// Simplified pattern matching - could be enhanced
	const lines = content.split('\n');
	const searchLines = searchText.split('\n');
	
	for (let i = 0; i <= lines.length - searchLines.length; i++) {
		const candidate = lines.slice(i, i + searchLines.length).join('\n');
		const candidatePattern = extractIndentationPattern(candidate);
		
		if (candidatePattern.pattern === searchPattern.pattern) {
			const beforeLines = lines.slice(0, i);
			const startIndex = beforeLines.join('\n').length + (beforeLines.length > 0 ? 1 : 0);
			return { found: true, start: startIndex, end: startIndex + candidate.length };
		}
	}
	
	return { found: false, start: -1, end: -1 };
}

/**
 * Apply a single search/replace block to content with robust matching
 */
function applySearchReplaceBlock(
	content: string,
	block: SearchReplaceBlock,
	options: { 
		matchingStrategies?: MatchingStrategy[];
		fuzzyThreshold?: number;
	} = {}
): { result: string | null; error?: string; strategy?: MatchingStrategy } {
	// Handle empty search (pure additions)
	if (block.search.trim() === '') {
		// Append to end of content
		if (content === '') {
			return { result: block.replace };
		}
		const separator = content.endsWith('\n') ? '' : '\n';
		return { result: content + separator + block.replace };
	}
	
	// Default matching strategies in order of preference
	const strategies = options.matchingStrategies || [
		MatchingStrategy.EXACT,
		MatchingStrategy.WHITESPACE_INSENSITIVE,
		MatchingStrategy.INDENTATION_PRESERVING,
		MatchingStrategy.FUZZY
	];
	
	// Try each strategy until one succeeds
	for (const strategy of strategies) {
		const matchResult = findMatch(content, block.search, strategy);
		
		if (!matchResult.found) {
			continue;
		}
		
		// Check for ambiguous matches (multiple occurrences) - CRITICAL SAFETY CHECK
		if (strategy === MatchingStrategy.EXACT) {
			const occurrences = content.split(block.search).length - 1;
			if (occurrences > 1) {
				return { 
					result: null, 
					error: `Search block found ${occurrences} times (ambiguous)` 
				};
			}
		} else {
			// For non-exact strategies, check if there are multiple similar matches
			const potentialMatches = countSimilarMatches(content, block.search, strategy, options.fuzzyThreshold);
			if (potentialMatches > 1) {
				return { 
					result: null, 
					error: `Search block found ${potentialMatches} similar matches (ambiguous) using ${strategy} matching` 
				};
			}
		}
		
		// Apply the replacement
		const before = content.slice(0, matchResult.startIndex);
		const after = content.slice(matchResult.endIndex);
		const result = before + block.replace + after;
		
		return { 
			result, 
			strategy: matchResult.strategy
		};
	}
	
	// No strategy succeeded
	return { 
		result: null, 
		error: `Search block not found using any matching strategy. Tried: ${strategies.join(', ')}` 
	};
}

/**
 * Analyze search block quality to prevent ambiguity
 */
function analyzeSearchBlockQuality(searchText: string, targetContent: string): {
	uniquenessScore: number;
	specificity: number;
	recommendedThreshold: number;
	warnings: string[];
} {
	const warnings: string[] = [];
	let uniquenessScore = 1.0;
	let specificity = 1.0;

	// Check for overly common patterns that cause ambiguity
	const commonPatterns = [
		'const ', 'let ', 'if (', 'for (', '} else {', 'return ', 
		'break;', 'continue;', '&&', '||', '===', '!=='
	];

	for (const pattern of commonPatterns) {
		if (searchText.includes(pattern)) {
			try {
				const escapedPattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
				const occurrences = (targetContent.match(new RegExp(escapedPattern, 'g')) || []).length;
				if (occurrences > 3) {
					uniquenessScore *= 0.85;
				}
			} catch (e) {
				// Skip regex errors
			}
		}
	}

	// Check for repetitive mathematical/algorithmic patterns (your specific issue)
	const mathPatterns = ['Math.sqrt', 'Math.pow', 'getBoundingClientRect', 'distance', 'minDistance', 'bestCandidate'];
	let mathPatternCount = 0;
	for (const pattern of mathPatterns) {
		if (searchText.includes(pattern)) {
			mathPatternCount++;
			try {
				const escapedPattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
				const occurrences = (targetContent.match(new RegExp(escapedPattern, 'g')) || []).length;
				if (occurrences > 2) {
					uniquenessScore *= 0.7;
					specificity *= 0.8;
					warnings.push(`Mathematical pattern "${pattern}" may cause ambiguity (${occurrences} occurrences)`);
				}
			} catch (e) {
				// Skip regex errors
			}
		}
	}

	// Check for case/switch statement context (your specific ArrowDown/ArrowUp issue)
	const hasCaseStatement = /case\s+['"`][^'"`]*['"`]:/.test(searchText);
	if (hasCaseStatement) {
		try {
			const caseCount = (targetContent.match(/case\s+['"`][^'"`]*['"`]:/g) || []).length;
			if (caseCount > 2) {
				uniquenessScore *= 0.6;
				warnings.push('Switch case detected with multiple similar cases - high ambiguity risk');
			}
		} catch (e) {
			// Skip regex errors
		}
	}

	// Calculate recommended threshold
	let recommendedThreshold = 0.8; // Default
	if (uniquenessScore < 0.4) {
		recommendedThreshold = 0.95; // Very high threshold for ambiguous content
	} else if (uniquenessScore < 0.6) {
		recommendedThreshold = 0.9; // High threshold for moderately ambiguous content
	} else if (mathPatternCount > 2) {
		recommendedThreshold = 0.88; // Slightly higher for mathematical patterns
	}

	return {
		uniquenessScore: Math.max(0.1, uniquenessScore),
		specificity: Math.max(0.1, specificity),
		recommendedThreshold,
		warnings
	};
}

/**
 * Enhanced context-aware ambiguity detection
 * IMPROVED: Now includes quality analysis and smart threshold adjustment
 */
function countSimilarMatches(content: string, searchText: string, strategy: MatchingStrategy, fuzzyThreshold?: number): number {
    let count = 0;
    
    // Use direct matching logic based on strategy to avoid recursion
    switch (strategy) {
        case MatchingStrategy.EXACT:
            // Count exact occurrences
            count = content.split(searchText).length - 1;
            break;
            
        case MatchingStrategy.WHITESPACE_INSENSITIVE:
            {
                // Count whitespace-normalized matches
                const normalizedContent = normalizeWhitespace(content);
                const normalizedSearch = normalizeWhitespace(searchText);
                count = normalizedContent.split(normalizedSearch).length - 1;
                break;
            }
            
        case MatchingStrategy.INDENTATION_PRESERVING:
            {
                // Count indentation pattern matches
                const contentPattern = extractIndentationPattern(content);
                const searchPattern = extractIndentationPattern(searchText);
                if (searchPattern.pattern) {
                    count = contentPattern.pattern.split(searchPattern.pattern).length - 1;
                }
                break;
            }
            
        case MatchingStrategy.FUZZY:
            {
                // Enhanced fuzzy counting with smart threshold adjustment
                const quality = analyzeSearchBlockQuality(searchText, content);
                const adjustedThreshold = Math.max(fuzzyThreshold || 0.85, quality.recommendedThreshold);
                
                const lines = content.split('\n');
                const searchLines = searchText.split('\n');
                
                // Use higher standards for counting matches in ambiguous scenarios
                for (let i = 0; i <= lines.length - searchLines.length; i++) {
                    const candidate = lines.slice(i, i + searchLines.length).join('\n');
                    const similarity = calculateSimilarity(
                        normalizeWhitespace(candidate), 
                        normalizeWhitespace(searchText)
                    );
                    
                    // Additional context validation for fuzzy matches
                    if (similarity >= adjustedThreshold) {
                        // Validate that the match doesn't span inappropriate boundaries
                        const contextScore = validateMatchContext(content, candidate, i, i + searchLines.length);
                        if (contextScore > 0.6) { // Only count matches with good context
                            count++;
                        }
                    }
                }
                break;
            }
            
        default:
            count = 0;
    }
    
    return count;
}

/**
 * Validate match context to prevent spanning inappropriate boundaries
 */
function validateMatchContext(_content: string, matchText: string, _startLine: number, _endLine: number): number {
	let contextScore = 1.0;
	
	// Check for problematic boundary patterns
	const problematicPatterns = [
		{ pattern: /^\s*case\s+['"`][^'"`]*['"`]:/, penalty: 0.4 }, // Case boundaries
		{ pattern: /^\s*function\s+\w+/, penalty: 0.3 }, // Function boundaries
		{ pattern: /^\s*}/, penalty: 0.5 }, // Closing brace boundaries
		{ pattern: /{\s*$/, penalty: 0.5 } // Opening brace boundaries
	];
	
	const matchLines = matchText.split('\n');
	for (let i = 0; i < matchLines.length; i++) {
		const line = matchLines[i];
		for (const { pattern, penalty } of problematicPatterns) {
			try {
				if (pattern.test(line)) {
					if (i === 0 || i === matchLines.length - 1) {
						// Boundary at start/end is less problematic
						contextScore *= (1 - penalty * 0.5);
					} else {
						// Boundary in middle is very problematic
						contextScore *= (1 - penalty);
					}
				}
			} catch (e) {
				// Skip regex errors
			}
		}
	}
	
	// Check indentation consistency
	const indentations = matchLines.map(line => (line.match(/^\s*/) || [''])[0].length);
	const minIndent = Math.min(...indentations);
	const maxIndent = Math.max(...indentations);
	const indentRange = maxIndent - minIndent;
	
	if (indentRange > 8) {
		contextScore *= 0.7; // Inconsistent indentation suggests spanning contexts
	}
	
	return Math.max(0.1, contextScore);
}

export interface FailedBlock {
	search: string;
	replace: string;
	error: string;
	lineNumber?: number;
}

export interface ApplyResult {
	content: string;
	results: {
		blocksTotal: number;
		blocksApplied: number;
		blocksFailed: number;
		errors: string[];
		warnings: string[];
		failedBlocks: FailedBlock[];
	};
}

/**
 * Apply search/replace diff with enhanced error handling and telemetry
 */
export function applyDiff(
	originalContent: string,
	diffContent: string,
	options: { 
		strict?: boolean; // If true, fail on any error. If false, apply what we can
		enableTelemetry?: boolean;
		matchingStrategies?: MatchingStrategy[]; // Strategies to try in order
		fuzzyThreshold?: number; // Threshold for fuzzy matching (0.0 - 1.0)
	} = {}
): ApplyResult {
	// Set sensible defaults
	const defaultOptions = {
		strict: true, // Default to strict mode for better error handling
		enableTelemetry: false,
		matchingStrategies: [
			MatchingStrategy.EXACT,
			MatchingStrategy.WHITESPACE_INSENSITIVE,
			MatchingStrategy.INDENTATION_PRESERVING,
			MatchingStrategy.FUZZY
		] as MatchingStrategy[],
		fuzzyThreshold: 0.80 // 85% similarity threshold - good balance of flexibility and precision
	};
	
	// Merge user options with defaults
	const mergedOptions = { ...defaultOptions, ...options };
	const startTime = Date.now();
	const result: ApplyResult = {
		content: originalContent,
		results: {
			blocksTotal: 0,
			blocksApplied: 0,
			blocksFailed: 0,
			errors: [],
			warnings: [],
			failedBlocks: []
		}
	};
	
	try {
		// Validate inputs
		if (typeof originalContent !== 'string') {
			result.results.errors.push('Original content must be a string');
			if (mergedOptions.strict) throw new Error('Original content must be a string');
			return result;
		}
		
		if (typeof diffContent !== 'string') {
			result.results.errors.push('Diff content must be a string');
			if (mergedOptions.strict) throw new Error('Diff content must be a string');
			return result;
		}
		
		// Handle empty diff
		if (!diffContent || diffContent.trim().length === 0) {
			return result;
		}
		
		// Parse the diff
		const { blocks, errors: parseErrors } = parseSearchReplaceDiff(diffContent);
		
		if (parseErrors.length > 0) {
			result.results.errors.push(...parseErrors);
			if (mergedOptions.strict) {
				throw new Error(`Parse errors: ${parseErrors.join('; ')}`);
			}
		}
		
		result.results.blocksTotal = blocks.length;
		
		if (blocks.length === 0) {
			if (mergedOptions.strict && parseErrors.length > 0) {
				throw new Error('No valid search/replace blocks found');
			}
			return result;
		}
		
		// Apply blocks sequentially
		let currentContent = originalContent;
		const failedBlocks: Array<{ block: SearchReplaceBlock; error: string }> = [];
		
		for (const block of blocks) {
			const { result: blockResult, error, strategy } = applySearchReplaceBlock(currentContent, block, {
				matchingStrategies: mergedOptions.matchingStrategies,
				fuzzyThreshold: mergedOptions.fuzzyThreshold
			});
			
			if (blockResult !== null) {
				currentContent = blockResult;
				result.results.blocksApplied++;
				
				// Log which strategy was used for telemetry
				if (mergedOptions.enableTelemetry && strategy) {
					result.results.warnings.push(`Block at line ${block.lineNumber}: Applied using ${strategy} matching`);
				}
			} else {
				result.results.blocksFailed++;
				const errorMsg = `Block at line ${block.lineNumber}: ${error}`;
				result.results.errors.push(errorMsg);
				failedBlocks.push({ block, error: errorMsg });
				
				// Add complete failed block information to results
				result.results.failedBlocks.push({
					search: block.search,
					replace: block.replace,
					error: errorMsg,
					lineNumber: block.lineNumber
				});
				
				if (mergedOptions.strict) {
					throw new Error(errorMsg);
				}
			}
		}
		
		// If all blocks failed, add error even in non-strict mode
		if (result.results.blocksApplied === 0 && result.results.blocksTotal > 0) {
			const errorDetails = failedBlocks.map(({ block, error }) => {
				const preview = block.search.substring(0, 100);
				return `${error}\nSearch: "${preview}${block.search.length > 100 ? '...' : ''}"`;
			}).join('\n\n');
			
			const allFailedError = `All search/replace blocks failed:\n${errorDetails}`;
			result.results.errors.push(allFailedError);
			
			if (mergedOptions.strict) {
				throw new Error(allFailedError);
			}
		}
		
		result.content = currentContent;
		return result;
		
	} finally {
		const processingTimeMs = Date.now() - startTime;
		
		if (mergedOptions.enableTelemetry) {
			console.debug('Search/Replace Diff Telemetry:', {
				...result.results,
				processingTimeMs
			});
		}
	}
}

/**
 * Utility to create a search/replace diff from before/after content
 */
export function createSearchReplaceDiff(
	beforeContent: string,
	afterContent: string,
	options: { 
		contextLines?: number; // How many lines of context to include
		maxSearchSize?: number; // Maximum size of search block
	} = {}
): string {
	const { contextLines = 3, maxSearchSize = 500 } = options;
	
	// Simple line-based diff
	const beforeLines = beforeContent.split('\n');
	const afterLines = afterContent.split('\n');
	
	// Find the first difference
	let firstDiff = -1;
	for (let i = 0; i < Math.min(beforeLines.length, afterLines.length); i++) {
		if (beforeLines[i] !== afterLines[i]) {
			firstDiff = i;
			break;
		}
	}
	
	// Find the last difference
	let lastDiff = -1;
	for (let i = 0; i < Math.min(beforeLines.length, afterLines.length); i++) {
		const beforeIdx = beforeLines.length - 1 - i;
		const afterIdx = afterLines.length - 1 - i;
		if (beforeLines[beforeIdx] !== afterLines[afterIdx]) {
			lastDiff = Math.max(beforeIdx, afterIdx);
			break;
		}
	}
	
	// Handle identical content
	if (firstDiff === -1 && beforeLines.length === afterLines.length) {
		return ''; // No changes
	}
	
	// Handle pure addition
	if (firstDiff === -1 && beforeLines.length < afterLines.length) {
		firstDiff = beforeLines.length;
		lastDiff = afterLines.length - 1;
	}
	
	// Create search/replace block
	const searchStart = Math.max(0, firstDiff - contextLines);
	const searchEnd = Math.min(beforeLines.length - 1, (lastDiff >= 0 ? lastDiff : firstDiff) + contextLines);
	const replaceStart = searchStart;
	const replaceEnd = Math.min(afterLines.length - 1, searchEnd + (afterLines.length - beforeLines.length));
	
	const searchBlock = beforeLines.slice(searchStart, searchEnd + 1).join('\n');
	const replaceBlock = afterLines.slice(replaceStart, replaceEnd + 1).join('\n');
	
	// Check size limit
	if (searchBlock.length > maxSearchSize) {
		// Reduce context
		const reducedContext = Math.max(0, contextLines - 1);
		return createSearchReplaceDiff(beforeContent, afterContent, { 
			...options, 
			contextLines: reducedContext 
		});
	}
	
	return `<<<<<<< SEARCH
${searchBlock}
=======
${replaceBlock}
>>>>>>> REPLACE`;
}

/**
 * Validate a search/replace diff without applying it
 */
export function validateDiff(
	content: string,
	diffContent: string
): { valid: boolean; errors: string[] } {
	const { blocks, errors: parseErrors } = parseSearchReplaceDiff(diffContent);
	const errors = [...parseErrors];
	
	for (const block of blocks) {
		const occurrences = content.split(block.search).length - 1;
		
		if (occurrences === 0) {
			errors.push(`Block at line ${block.lineNumber}: Search pattern not found`);
		} else if (occurrences > 1) {
			errors.push(`Block at line ${block.lineNumber}: Search pattern found ${occurrences} times (ambiguous)`);
		}
	}
	
	return {
		valid: errors.length === 0,
		errors
	};
}

/**
 * Test cases for the enhanced search/replace parser
 * These tests cover all the edge cases mentioned in the requirements
 */
export function runParserTests(): { passed: number; failed: number; details: string[] } {
	const tests: Array<{ name: string; input: string; expectedBlocks: number; expectedErrors: number }> = [
		// Test 1: Normal well-formed block
		{
			name: "Well-formed block",
			input: `<<<<<<< SEARCH
old content
=======
new content
>>>>>>> REPLACE`,
			expectedBlocks: 1,
			expectedErrors: 0
		},
		
		// Test 2: Block within code fences (the main issue from logs)
		{
			name: "Block within code fences",
			input: `# Comment
\`\`\`
<<<<<<< SEARCH
import { ErrorBoundary } from './components/ErrorBoundary';
=======
// import { ErrorBoundary } from './components/ErrorBoundary';
\`\`\``,
			expectedBlocks: 1,
			expectedErrors: 0
		},
		
		// Test 3: SEARCH followed by another SEARCH (invalid)
		{
			name: "SEARCH followed by another SEARCH",
			input: `<<<<<<< SEARCH
first search
<<<<<<< SEARCH
second search
=======
replacement
>>>>>>> REPLACE`,
			expectedBlocks: 1,
			expectedErrors: 1
		},
		
		// Test 4: SEARCH without REPLACE at end of file
		{
			name: "SEARCH without REPLACE at EOF",
			input: `<<<<<<< SEARCH
orphaned search content`,
			expectedBlocks: 0,
			expectedErrors: 1
		},
		
		// Test 5: Multiple separators (malformed)
		{
			name: "Multiple separators in replace section",
			input: `<<<<<<< SEARCH
search content
=======
replace content
=======
extra separator
>>>>>>> REPLACE`,
			expectedBlocks: 1,
			expectedErrors: 0
		},
		
		// Test 6: Mixed code fences and standard markers
		{
			name: "Mixed code fences and standard markers",
			input: `Text before
\`\`\`
<<<<<<< SEARCH
old code
=======
new code
\`\`\`
Text after`,
			expectedBlocks: 1,
			expectedErrors: 0
		},
		
		// Test 7: Empty search section
		{
			name: "Empty search section",
			input: `<<<<<<< SEARCH
=======
new content
>>>>>>> REPLACE`,
			expectedBlocks: 1,
			expectedErrors: 0
		},
		
		// Test 8: Empty replace section
		{
			name: "Empty replace section",
			input: `<<<<<<< SEARCH
old content
=======
>>>>>>> REPLACE`,
			expectedBlocks: 1,
			expectedErrors: 0
		},
		
		// Test 9: Stray separators (should be ignored)
		{
			name: "Stray separators",
			input: `=======
Some text
\`\`\`
More text`,
			expectedBlocks: 0,
			expectedErrors: 0
		},
		
		// Test 10: The specific malformed case from the logs
		{
			name: "Specific malformed case from logs",
			input: `Looking at the provided main.tsx file, I need to analyze it for potential issues:

# Missing ErrorBoundary component - will cause import error

\`\`\`
<<<<<<< SEARCH
import { ErrorBoundary } from './components/ErrorBoundary';
import { RouteErrorBoundary } from './components/RouteErrorBoundary';
=======
// import { ErrorBoundary } from './components/ErrorBoundary';
// import { RouteErrorBoundary } from './components/RouteErrorBoundary';
=======
\`\`\`

# Remove ErrorBoundary wrapper since component doesn't exist

\`\`\`
<<<<<<< SEARCH
const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    errorElement: <RouteErrorBoundary />,
    children: [
      {
        path: "/",
        element: <EditorPage />,
      }
    ]
  },
]);
=======
const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    children: [
      {
        path: "/",
        element: <EditorPage />,
      }
    ]
  },
]);
>>>>>>> REPLACE
\`\`\``,
			expectedBlocks: 2,
			expectedErrors: 0
		}
	];
	
	const results: string[] = [];
	let passed = 0;
	let failed = 0;
	
	for (const test of tests) {
		try {
			const { blocks, errors } = parseSearchReplaceDiff(test.input);
			const blocksMatch = blocks.length === test.expectedBlocks;
			const errorsMatch = errors.length === test.expectedErrors;
			
			if (blocksMatch && errorsMatch) {
				passed++;
				results.push(`✅ ${test.name}: PASSED (${blocks.length} blocks, ${errors.length} errors)`);
			} else {
				failed++;
				results.push(`❌ ${test.name}: FAILED`);
				results.push(`   Expected: ${test.expectedBlocks} blocks, ${test.expectedErrors} errors`);
				results.push(`   Actual: ${blocks.length} blocks, ${errors.length} errors`);
				if (errors.length > 0) {
					results.push(`   Errors: ${errors.join(', ')}`);
				}
			}
		} catch (error) {
			failed++;
			results.push(`❌ ${test.name}: EXCEPTION - ${error instanceof Error ? error.message : String(error)}`);
		}
	}
	
	return { passed, failed, details: results };
}