import { Message, createUserMessage } from './common';

/**
 * Represents a single tool call record for loop detection
 */
export type ToolCallRecord = {
	toolName: string;
	args: string; // JSON stringified arguments
	timestamp: number;
};

/**
 * State tracking for loop detection
 */
export type LoopDetectionState = {
	recentCalls: ToolCallRecord[];
	repetitionWarnings: number;
};

/**
 * Detects repetitive tool calls and generates warnings to prevent infinite loops.
 *
 * Detection Logic:
 * - Tracks tool calls within a 2-minute sliding window
 * - Flags repetition when 2+ identical calls (same tool + same args) occur
 */
export class LoopDetector {
	private state: LoopDetectionState = {
		recentCalls: [],
		repetitionWarnings: 0,
	};

	detectRepetition(toolName: string, args: Record<string, unknown>): boolean {
		const argsStr = this.safeStringify(args);
		const now = Date.now();
		const WINDOW_MS = 2 * 60 * 1000;

		this.state.recentCalls = this.state.recentCalls.filter(
			(call) => now - call.timestamp < WINDOW_MS
		);

		const matchingCalls = this.state.recentCalls.filter(
			(call) => call.toolName === toolName && call.args === argsStr
		);

		this.state.recentCalls.push({
			toolName,
			args: argsStr,
			timestamp: now,
		});

		if (this.state.recentCalls.length > 1000) {
			this.state.recentCalls = this.state.recentCalls.slice(-1000);
		}

		return matchingCalls.length >= 2;
	}

	/**
	 * Detects significant repetition in generated text using a rolling hash,
	 * catching both short token loops and repeated paragraphs.
	 */
	detectTextRepetition(text: string): boolean {
		if (!text || text.length < 40) {
			return false;
		}

		const CHECK_WINDOW = 4000;
		const recentText = text.slice(-CHECK_WINDOW);
		const textLength = recentText.length;

		// Rolling hash base and modulus
		const BASE = 257;
		const MOD = 1e9 + 7;

		// Helper: Compute hash of a substring
		const computeHash = (str: string, start: number, len: number): number => {
			let hash = 0;
			let pow = 1;
			for (let i = 0; i < len; i++) {
				hash = (hash + (str.charCodeAt(start + i) * pow) % MOD) % MOD;
				pow = (pow * BASE) % MOD;
			}
			return hash;
		};

		// Helper: Verify equality of two substrings (guards against hash collisions)
		const areEqual = (str: string, pos1: number, pos2: number, len: number): boolean => {
			for (let i = 0; i < len; i++) {
				if (str.charCodeAt(pos1 + i) !== str.charCodeAt(pos2 + i)) {
					return false;
				}
			}
			return true;
		};

		// Probe lengths for character-, word-, and sentence-level loops
		const probeLengths = [1, 4, 20];

		for (const probeLen of probeLengths) {
			if (textLength < probeLen * 2) continue;

			const hashMap = new Map<number, number>();
			
			// Precompute BASE^(probeLen-1) mod MOD
			let basePow = 1;
			for (let i = 0; i < probeLen - 1; i++) {
				basePow = (basePow * BASE) % MOD;
			}

			const invBase = this.modInverse(BASE, MOD);

			let currentHash = computeHash(recentText, 0, probeLen);
			hashMap.set(currentHash, 0);

			for (let i = 1; i <= textLength - probeLen; i++) {
				// Rolling hash update
				const oldChar = recentText.charCodeAt(i - 1);
				currentHash = (currentHash - oldChar + MOD) % MOD;
				currentHash = (currentHash * invBase) % MOD;
				const newChar = recentText.charCodeAt(i + probeLen - 1);
				currentHash = (currentHash + (newChar * basePow) % MOD) % MOD;

				if (hashMap.has(currentHash)) {
					const prevPos = hashMap.get(currentHash)!;
					
					// Found a matching probe; the distance gives a candidate loop period.
					if (areEqual(recentText, prevPos, i, probeLen)) {
						const period = i - prevPos;
						if (period < probeLen) continue;

						// Verify that the suffix consists of repeated blocks of length `period`.
						if (recentText.length >= period * 2) {
							const suffixBlock1 = recentText.slice(-2 * period, -period);
							const suffixBlock2 = recentText.slice(-period);
							
							if (suffixBlock1 === suffixBlock2) {
								let requiredReps = 2;
								if (period < 5) requiredReps = 10;
								else if (period < 20) requiredReps = 5;
								else if (period < 50) requiredReps = 3;
								
								let repCount = 2;
								let checkEnd = recentText.length - 2 * period;
								while (checkEnd >= period) {
									const prevBlock = recentText.slice(checkEnd - period, checkEnd);
									if (prevBlock === suffixBlock2) {
										repCount++;
										checkEnd -= period;
									} else {
										break;
									}
								}
								
								if (repCount >= requiredReps) {
									return true;
								}
							}
						}
					}
				}
				
				// Track latest position for this hash to prefer recent, shorter periods.
				hashMap.set(currentHash, i);
			}
		}

		return false;
	}

	/**
	 * Modular multiplicative inverse via extended Euclidean algorithm.
	 */
	private modInverse(a: number, m: number): number {
		// Extended Euclidean algorithm
		const m0 = m;
		let x0 = 0;
		let x1 = 1;

		if (m === 1) return 0;

		while (a > 1) {
			const q = Math.floor(a / m);
			let t = m;
			m = a % m;
			a = t;
			t = x0;
			x0 = x1 - q * x0;
			x1 = t;
		}

		if (x1 < 0) x1 += m0;

		return x1;
	}

	/**
	 * Stringify args with deterministic key ordering and basic circular handling.
	 */
	private safeStringify(args: Record<string, unknown>): string {
		try {
			const sortedArgs = Object.keys(args)
				.sort()
				.reduce((acc, key) => {
					acc[key] = args[key];
					return acc;
				}, {} as Record<string, unknown>);

			return JSON.stringify(sortedArgs);
		} catch (error) {
			return JSON.stringify({
				_error: 'circular_reference_or_stringify_error',
				_keys: Object.keys(args).sort(),
				_errorMessage: error instanceof Error ? error.message : 'Unknown error',
			});
		}
	}

	/**
	 * Generate contextual warning message for injection into conversation history
	 *
	 * @param toolName - Name of the tool that's being repeated
	 * @returns Message object to inject into conversation
	 */
	generateWarning(toolName: string): Message {
		this.state.repetitionWarnings++;

		const warningMessage = `
[!ALERT] CRITICAL: POSSIBLE REPETITION DETECTED

You just attempted to execute "${toolName}" with identical arguments for the ${this.state.repetitionWarnings}th time.

This indicates you may be stuck in a loop. Please take one of these actions:

1. **If your task is complete:**
   - Call the appropriate completion tool with a summary of what you accomplished
   - STOP immediately after calling the completion tool
   - Make NO further tool calls

2. **If you previously declared completion:**
   - Review your recent messages
   - If you already called the completion tool, HALT immediately
   - Do NOT repeat the same work

3. **If your task is NOT complete:**
   - Try a DIFFERENT approach or strategy
   - Use DIFFERENT tools than before
   - Use DIFFERENT arguments or parameters
   - Read DIFFERENT files for more context
   - Consider if the current approach is viable

DO NOT repeat the same action. Doing the same thing repeatedly will not produce different results.

Once you call the completion tool, make NO further tool calls - the system will stop automatically.`.trim();

		return createUserMessage(warningMessage);
	}

	generateTextWarning(): string {
		return `
[!ALERT] CRITICAL: TEXT REPETITION DETECTED

You are repeating the same text content. This indicates a loop.
Please STOP repeating the same sentences.
If you have completed the task, call the completion tool.
If you are waiting for user input, ask a specific question and stop.
`.trim();
	}

	/**
	 * Get the current warning count
	 */
	getWarningCount(): number {
		return this.state.repetitionWarnings;
	}

	/**
	 * Reset the loop detection state
	 */
	reset(): void {
		this.state = {
			recentCalls: [],
			repetitionWarnings: 0,
		};
	}
}
