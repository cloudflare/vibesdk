import { tool, t } from '../types';
import { StructuredLogger } from '../../../logger';

export function createWaitTool(logger: StructuredLogger) {
	return tool({
		name: 'wait',
		description: 'Wait/sleep for a specified number of seconds. Use this after deploying changes when you need the user to interact with the app before checking logs. Typical usage: wait 15-30 seconds after deploy_preview to allow time for user interaction.',
		args: {
			seconds: t.number().describe('Number of seconds to wait (typically 15-30 for user interaction)'),
			reason: t.string().optional().describe('Optional: why you are waiting (e.g., "Waiting for user to interact with app")'),
		},
		run: async ({ seconds, reason }) => {
			const waitMs = Math.min(Math.max(seconds * 1000, 1000), 60000);
			const actualSeconds = waitMs / 1000;

			logger.info('Waiting', { seconds: actualSeconds, reason });

			await new Promise(resolve => setTimeout(resolve, waitMs));

			return {
				message: `Waited ${actualSeconds} seconds${reason ? `: ${reason}` : ''}`,
			};
		},
	});
}
