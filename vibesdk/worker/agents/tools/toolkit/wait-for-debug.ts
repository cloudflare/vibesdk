import { tool } from '../types';
import { StructuredLogger } from '../../../logger';
import { ICodingAgent } from 'worker/agents/services/interfaces/ICodingAgent';

export function createWaitForDebugTool(
	agent: ICodingAgent,
	logger: StructuredLogger
) {
	return tool({
		name: 'wait_for_debug',
		description:
			'Wait for the current debug session to complete. Use when deep_debug returns DEBUG_IN_PROGRESS error. Returns immediately if no debug session is running.',
		args: {},
		run: async () => {
			try {
				if (agent.isDeepDebugging()) {
					logger.info('Waiting for debug session to complete...');
					await agent.waitForDeepDebug();
					logger.info('Debug session completed');
					return { status: 'Debug session completed' };
				} else {
					logger.info('No debug session in progress');
					return { status: 'No debug session was running' };
				}
			} catch (error) {
				logger.error('Error waiting for debug session', error);
				return {
					error:
						error instanceof Error
							? `Failed to wait for debug session: ${error.message}`
							: 'Unknown error while waiting for debug session',
				};
			}
		},
	});
}
