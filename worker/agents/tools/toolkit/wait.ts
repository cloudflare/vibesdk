import { ToolDefinition } from '../types';
import { StructuredLogger } from '../../../logger';

type WaitArgs = {
	seconds: number;
	reason?: string;
};

type WaitResult = { message: string };

export function createWaitTool(
	logger: StructuredLogger,
): ToolDefinition<WaitArgs, WaitResult> {
	return {
		type: 'function' as const,
		function: {
			name: 'wait',
			description:
				'Wait/sleep for a specified number of seconds. Use this after deploying changes when you need the user to interact with the app before checking logs. Typical usage: wait 15-30 seconds after deploy_preview to allow time for user interaction.',
			parameters: {
				type: 'object',
				properties: {
					seconds: {
						type: 'number',
						description: 'Number of seconds to wait (typically 15-30 for user interaction)',
					},
					reason: {
						type: 'string',
						description: 'Optional: why you are waiting (e.g., "Waiting for user to interact with app")',
					},
				},
				required: ['seconds'],
			},
		},
		implementation: async ({ seconds, reason }) => {
			const waitMs = Math.min(Math.max(seconds * 1000, 1000), 60000); // Clamp between 1-60 seconds
			const actualSeconds = waitMs / 1000;
			
			logger.info('Waiting', { seconds: actualSeconds, reason });
			
			await new Promise(resolve => setTimeout(resolve, waitMs));
			
			return {
				message: `Waited ${actualSeconds} seconds${reason ? `: ${reason}` : ''}`,
			};
		},
	};
}
