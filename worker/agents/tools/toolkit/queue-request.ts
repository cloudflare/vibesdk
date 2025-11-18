import { ToolDefinition } from '../types';
import { StructuredLogger } from '../../../logger';
import { CodingAgentInterface } from 'worker/agents/services/implementations/CodingAgent';

type QueueRequestArgs = {
	modificationRequest: string;
};

export function createQueueRequestTool(
	agent: CodingAgentInterface,
	logger: StructuredLogger
): ToolDefinition<QueueRequestArgs, null> {
	return {
		type: 'function' as const,
		function: {
			name: 'queue_request',
			description:
				'Queue up modification requests or changes, to be implemented in the next development phase',
			parameters: {
				type: 'object',
				additionalProperties: false,
				properties: {
					modificationRequest: {
						type: 'string',
						minLength: 8,
						description:
							"The changes needed to be made to the app. Please don't supply any code level or implementation details. Provide detailed requirements and description of the changes you want to make.",
					},
				},
				required: ['modificationRequest'],
			},
		},
		implementation: async (args) => {
			logger.info('Received app edit request', {
				modificationRequest: args.modificationRequest,
			});
			agent.queueRequest(args.modificationRequest);
            return null;
		},
	};
}
