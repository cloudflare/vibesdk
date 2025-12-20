import { tool, t } from '../types';
import { StructuredLogger } from '../../../logger';
import { ICodingAgent } from 'worker/agents/services/interfaces/ICodingAgent';
import { ExecuteCommandsResponse } from 'worker/services/sandbox/sandboxTypes';

export type ExecCommandsResult = ExecuteCommandsResponse | { error: string };

export function createExecCommandsTool(
	agent: ICodingAgent,
	logger: StructuredLogger
) {
	return tool({
		name: 'exec_commands',
		description:
			'Execute shell commands in the sandbox. CRITICAL shouldSave rules: (1) Set shouldSave=true ONLY for package management with specific packages (e.g., "bun add react", "npm install lodash"). (2) Set shouldSave=false for: file operations (rm, mv, cp), plain installs ("bun install"), run commands ("bun run dev"), and temporary operations. Invalid commands in shouldSave=true will be automatically filtered out. Always use bun for package management.',
		args: {
			commands: t.commands().describe('Array of shell commands to execute'),
			shouldSave: t.boolean().default(true).describe('Whether to save package management commands to blueprint'),
			timeout: t.number().default(30000).describe('Timeout in milliseconds'),
		},
		run: async ({ commands, shouldSave, timeout }) => {
			try {
				const shouldSaveValue = shouldSave ?? true;
				const timeoutValue = timeout ?? 30000;

				logger.info('Executing commands', {
					count: commands.length,
					commands,
					shouldSave: shouldSaveValue,
					timeout: timeoutValue,
				});
				const output = await agent.execCommands(commands, shouldSave, timeout);
				
				// Truncate output to max 1000 characters per result
				const MAX_OUTPUT_LENGTH = 1000;
				const truncatedOutput = {
					...output,
					results: output.results.map((result) => ({
						...result,
						output:
							result.output.length > MAX_OUTPUT_LENGTH
								? result.output.substring(0, MAX_OUTPUT_LENGTH) + '\n[truncated to max 1000 characters]'
								: result.output,
					})),
				};
				return truncatedOutput;
			} catch (error) {
				return {
					error:
						error instanceof Error
							? `Failed to execute commands: ${error.message}`
							: 'Unknown error occurred while executing commands',
				};
			}
		},
	});
}
