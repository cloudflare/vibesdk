import { ErrorResult, ToolDefinition } from '../types';
import { StructuredLogger } from '../../../logger';
import { CodingAgentInterface } from 'worker/agents/services/implementations/CodingAgent';

type GetLogsArgs = {
	reset?: boolean;
	durationSeconds?: number;
	maxLines?: number;
};

type GetLogsResult = { logs: string } | ErrorResult;

export function createGetLogsTool(
	agent: CodingAgentInterface,
	logger: StructuredLogger
): ToolDefinition<GetLogsArgs, GetLogsResult> {
	return {
		type: 'function' as const,
		function: {
			name: 'get_logs',
			description:
				`Get cumulative application/server logs from the sandbox environment.

**USE SPARINGLY:** Only call when get_runtime_errors and run_analysis don't provide enough information. Logs are verbose and cumulative - prefer other diagnostic tools first.

**CRITICAL:** Logs are cumulative (NOT cleared unless reset=true). Errors from before your fixes may still appear:
1. Cross-reference with get_runtime_errors (more recent)
2. Re-read actual code to confirm bug is present
3. Check timestamps vs. your deploy times

**WHEN TO USE:**
- ✅ Need to see console output or detailed execution flow
- ✅ Runtime errors lack detail and static analysis passes
- ❌ DON'T use as first diagnostic - try get_runtime_errors and run_analysis first

**DEFAULTS:** 30s window, 100 lines, no reset. Logs are USER-DRIVEN (require user interaction).

**RESET:** Set reset=true to clear accumulated logs before fetching. Use when starting fresh debugging or after major fixes.`,
			parameters: {
				type: 'object',
				properties: {
					reset: {
						type: 'boolean',
						description: 'Clear accumulated logs before fetching. Default: false. Set to true when starting fresh debugging or after major fixes to avoid stale errors.',
					},
					durationSeconds: {
						type: 'number',
						description: 'Time window in seconds. Default: 30 seconds (recent activity). Set to higher value if you need older logs.',
					},
					maxLines: {
						type: 'number',
						description: 'Maximum lines to return. Default: 100. Set to -1 for no truncation (warning: heavy token usage). Increase to 200-500 for more context.',
					},
				},
				required: [],
			},
		},
		implementation: async (args?) => {
			try {
				const reset = args?.reset ?? false; // Default: don't reset
				const durationSeconds = args?.durationSeconds ?? 30; // Default to last 30 seconds
				const maxLines = args?.maxLines ?? 100; // Default to 100 lines
				
				logger.info('Fetching application logs', { reset, durationSeconds, maxLines });
				const logs = await agent.getLogs(reset, durationSeconds);
				
				// Truncate logs if maxLines is not -1
				if (maxLines !== -1 && logs) {
					const lines = logs.split('\n');
					if (lines.length > maxLines) {
						const truncatedLines = lines.slice(-maxLines); // Keep last N lines (most recent)
						const truncatedLog = [
							`[TRUNCATED: Showing last ${maxLines} of ${lines.length} lines. Set maxLines higher or to -1 for full output]`,
							...truncatedLines
						].join('\n');
						logger.info('Logs truncated', { originalLines: lines.length, truncatedLines: maxLines });
						return { logs: truncatedLog };
					}
				}
				
				return { logs };
			} catch (error) {
				return {
					error:
						error instanceof Error
							? `Failed to get logs: ${error.message}`
							: 'Unknown error occurred while fetching logs',
				};
			}
		},
	};
}
