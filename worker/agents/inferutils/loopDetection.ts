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
	 * Stringify arguments with deterministic key ordering and circular reference handling
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
	 * @param assistantType - Type of assistant for completion tool reference
	 * @returns Message object to inject into conversation
	 */
	generateWarning(toolName: string, assistantType: 'builder' | 'debugger'): Message {
		this.state.repetitionWarnings++;

		const completionTool =
			assistantType === 'builder'
				? 'mark_generation_complete'
				: 'mark_debugging_complete';

		const warningMessage = `
[!ALERT] CRITICAL: POSSIBLE REPETITION DETECTED

You just attempted to execute "${toolName}" with identical arguments for the ${this.state.repetitionWarnings}th time.

This indicates you may be stuck in a loop. Please take one of these actions:

1. **If your task is complete:**
   - Call ${completionTool} with a summary of what you accomplished
   - STOP immediately after calling the completion tool
   - Make NO further tool calls

2. **If you previously declared completion:**
   - Review your recent messages
   - If you already called ${completionTool}, HALT immediately
   - Do NOT repeat the same work

3. **If your task is NOT complete:**
   - Try a DIFFERENT approach or strategy
   - Use DIFFERENT tools than before
   - Use DIFFERENT arguments or parameters
   - Read DIFFERENT files for more context
   - Consider if the current approach is viable

DO NOT repeat the same action. Doing the same thing repeatedly will not produce different results.

Once you call ${completionTool}, make NO further tool calls - the system will stop automatically.`.trim();

		return createUserMessage(warningMessage);
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
