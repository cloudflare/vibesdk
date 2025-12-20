import { tool, t } from '../types';
import { StructuredLogger } from '../../../logger';
import { ICodingAgent } from 'worker/agents/services/interfaces/ICodingAgent';

export function createGetLogsTool(
	agent: ICodingAgent,
	logger: StructuredLogger
) {
	return tool({
		name: 'get_logs',
		description:
			`Get cumulative application/server logs from the sandbox environment.

**USE SPARINGLY:** Only call when get_runtime_errors and run_analysis don't provide enough information. Logs are verbose and cumulative - prefer other diagnostic tools first.

**CRITICAL:** Logs are cumulative (NOT cleared unless reset=true). Errors from before your fixes may still appear:
1. Cross-reference with get_runtime_errors (more recent)
2. Re-read actual code to confirm bug is present
3. Check timestamps vs. your deploy times

**WHEN TO USE:**
- Need to see console output or detailed execution flow
- Runtime errors lack detail and static analysis passes
- DON'T use as first diagnostic - try get_runtime_errors and run_analysis first

**DEFAULTS:** 30s window, 100 lines, no reset. Logs are USER-DRIVEN (require user interaction).

**RESET:** Set reset=true to clear accumulated logs before fetching. Use when starting fresh debugging or after major fixes.`,
		args: {
			reset: t.logs.reset().describe('Clear accumulated logs before fetching. Default: false. Set to true when starting fresh debugging or after major fixes to avoid stale errors.'),
			durationSeconds: t.logs.durationSeconds().describe('Time window in seconds. Default: 30 seconds (recent activity). Set to higher value if you need older logs.'),
			maxLines: t.logs.maxLines().describe('Maximum lines to return. Default: 100. Set to -1 for no truncation (warning: heavy token usage). Increase to 200-500 for more context.'),
		},
		run: async ({ reset, durationSeconds, maxLines }) => {
			try {
				const resetValue = reset ?? false;
				const duration = durationSeconds ?? 30;
				const maxLinesValue = maxLines ?? 100;

				logger.info('Fetching application logs', { reset: resetValue, durationSeconds: duration, maxLines: maxLinesValue });
				const logs = await agent.getLogs(resetValue, duration);

				if (maxLinesValue !== -1 && logs) {
					const lines = logs.split('\n');
					if (lines.length > maxLinesValue) {
						const truncatedLines = lines.slice(-maxLinesValue);
						const truncatedLog = [
							`[TRUNCATED: Showing last ${maxLinesValue} of ${lines.length} lines. Set maxLines higher or to -1 for full output]`,
							...truncatedLines
						].join('\n');
						logger.info('Logs truncated', { originalLines: lines.length, truncatedLines: maxLinesValue });
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
	});
}
