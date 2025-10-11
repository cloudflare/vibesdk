import { ErrorResult, ToolDefinition } from '../types';
import { StructuredLogger } from '../../../logger';
import { CodingAgentInterface } from 'worker/agents/services/implementations/CodingAgent';

type GetLogsArgs = {
	reset?: boolean;
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
				`Get the current application/server logs from the sandbox environment. Useful for debugging runtime issues, checking console output, or investigating errors. Clears logs every time when called. App\'s browser console warn/error messages are also piped here.
All unread logs would be streamed, so you need to match timestamps on your own to understand things.`,
			parameters: {
				type: 'object',
				properties: {},
				required: [],
			},
		},
		implementation: async (_args?) => {
			try {
				logger.info('Fetching application logs');
				const logs = await agent.getLogs();
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
