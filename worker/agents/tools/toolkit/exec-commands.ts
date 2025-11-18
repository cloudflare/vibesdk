import { ToolDefinition, ErrorResult } from '../types';
import { StructuredLogger } from '../../../logger';
import { CodingAgentInterface } from 'worker/agents/services/implementations/CodingAgent';
import { ExecuteCommandsResponse } from 'worker/services/sandbox/sandboxTypes';

export type ExecCommandsArgs = {
	commands: string[];
	shouldSave: boolean;
	timeout?: number;
};

export type ExecCommandsResult = ExecuteCommandsResponse | ErrorResult;

export function createExecCommandsTool(
	agent: CodingAgentInterface,
	logger: StructuredLogger,
): ToolDefinition<ExecCommandsArgs, ExecCommandsResult> {
	return {
		type: 'function' as const,
		function: {
			name: 'exec_commands',
			description:
				'Execute shell commands in the sandbox. CRITICAL shouldSave rules: (1) Set shouldSave=true ONLY for package management with specific packages (e.g., "bun add react", "npm install lodash"). (2) Set shouldSave=false for: file operations (rm, mv, cp), plain installs ("bun install"), run commands ("bun run dev"), and temporary operations. Invalid commands in shouldSave=true will be automatically filtered out. Always use bun for package management.',
			parameters: {
				type: 'object',
				properties: {
					commands: { type: 'array', items: { type: 'string' } },
					shouldSave: { type: 'boolean', default: true },
					timeout: { type: 'number', default: 30000 },
				},
				required: ['commands'],
			},
		},
		implementation: async ({ commands, shouldSave = true, timeout = 30000 }) => {
			try {
				logger.info('Executing commands', {
					count: commands.length,
                    commands,
					shouldSave,
					timeout,
				});
				return await agent.execCommands(commands, shouldSave, timeout);
			} catch (error) {
				return {
					error:
						error instanceof Error
							? `Failed to execute commands: ${error.message}`
							: 'Unknown error occurred while executing commands',
				};
			}
		},
	};
}
