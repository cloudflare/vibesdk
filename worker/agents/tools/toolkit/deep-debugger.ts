import { tool, t, type Type, type } from '../types';
import { StructuredLogger } from '../../../logger';
import { ICodingAgent } from 'worker/agents/services/interfaces/ICodingAgent';
import { RenderToolCall } from 'worker/agents/operations/UserConversationProcessor';
import { z } from 'zod';

export function createDeepDebuggerTool(
	agent: ICodingAgent,
	logger: StructuredLogger,
	toolRenderer: RenderToolCall,
	streamCb: (chunk: string) => void
) {
	let callCount = 0;

	const focusPathsType: Type<string[] | undefined> = type(
		z.array(z.string()).optional(),
		(paths: string[] | undefined) => ({
			files: paths ? { mode: 'write', paths } : { mode: 'write', paths: [] },
			gitCommit: true,
			sandbox: { operation: 'deploy' },
		})
	);

	return tool({
		name: 'deep_debug',
		description:
			'Autonomous debugging assistant that investigates errors, reads files, and applies fixes. CANNOT run during code generation - will return GENERATION_IN_PROGRESS error if generation is active. LIMITED TO ONE CALL PER CONVERSATION TURN.',
		args: {
			issue: t.string().describe('Description of the issue to debug'),
			focus_paths: focusPathsType.describe('Optional array of file paths to focus debugging on'),
		},
		run: async ({ issue, focus_paths }) => {
			if (callCount > 0) {
				logger.warn('Cannot start debugging: Already called once this turn');
				return {
					error: 'CALL_LIMIT_EXCEEDED: You are only allowed to make a single deep_debug call per conversation turn. Ask user for permission before trying again.'
				};
			}

			callCount++;

			if (agent.isCodeGenerating()) {
				logger.warn('Cannot start debugging: Code generation in progress');
				return {
					error: 'GENERATION_IN_PROGRESS: Code generation is currently running. Use wait_for_generation tool, then retry deep_debug.'
				};
			}

			if (agent.isDeepDebugging()) {
				logger.warn('Cannot start debugging: Another debug session in progress');
				return {
					error: 'DEBUG_IN_PROGRESS: Another debug session is currently running. Wait for it to finish, and if it doesn\'t, solve the issue, Use wait_for_debug tool, then retry deep_debug.'
				};
			}

			const result = await agent.executeDeepDebug(issue, toolRenderer, streamCb, focus_paths);

			if (result.success) {
				return { transcript: result.transcript };
			} else {
				return { error: result.error };
			}
		},
	});
}
