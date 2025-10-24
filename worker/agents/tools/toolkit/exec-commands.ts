import { ToolDefinition, ErrorResult } from '../types';
import { StructuredLogger } from '../../../logger';
import { CodingAgentInterface } from 'worker/agents/services/implementations/CodingAgent';
import { ExecuteCommandsResponse } from 'worker/services/sandbox/sandboxTypes';

export type ExecCommandsArgs = {
	commands: string[];
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
				'Execute shell commands in the sandbox (e.g., tests, build).',
			parameters: {
				type: 'object',
				properties: {
					commands: { type: 'array', items: { type: 'string' } },
					timeout: { type: 'number' },
				},
				required: ['commands'],
			},
		},
		implementation: async ({ commands, timeout }) => {
			try {
				logger.info('Executing commands', {
					count: commands.length,
					timeout,
				});
				return await agent.execCommands(commands, timeout);
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
