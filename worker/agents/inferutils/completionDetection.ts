import { ToolCallResult } from '../tools/types';
import { CompletionSignal } from './common';

/**
 * Detects completion signals from executed tool calls
 */
export class CompletionDetector {
	/**
	 * @param completionToolNames - Array of tool names that signal completion
	 */
	constructor(private readonly completionToolNames: string[]) {}

	/**
	 * Scan executed tool calls for completion signals
	 *
	 * @param executedToolCalls - Array of tool call results from execution
	 * @returns CompletionSignal if completion tool was called, undefined otherwise
	 */
	detectCompletion(
		executedToolCalls: ToolCallResult[]
	): CompletionSignal | undefined {
		for (const call of executedToolCalls) {
			if (this.completionToolNames.includes(call.name)) {
				console.log(
					`[COMPLETION_DETECTOR] Completion signal detected from tool: ${call.name}`
				);

				// Extract summary from tool result if available
				let summary: string | undefined;
				if (
					call.result &&
					typeof call.result === 'object' &&
					call.result !== null &&
					'message' in call.result
				) {
					const msg = (call.result as { message: unknown }).message;
					if (typeof msg === 'string') {
						summary = msg;
					}
				}

				return {
					signaled: true,
					toolName: call.name,
					summary,
					timestamp: Date.now(),
				};
			}
		}

		return undefined;
	}

	/**
	 * Check if a specific tool name is a completion tool
	 *
	 * @param toolName - Name of the tool to check
	 * @returns true if the tool is a completion tool
	 */
	isCompletionTool(toolName: string): boolean {
		return this.completionToolNames.includes(toolName);
	}
}
