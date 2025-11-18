import { ToolDefinition } from '../types';
import { StructuredLogger } from '../../../logger';
import { CodingAgentInterface } from 'worker/agents/services/implementations/CodingAgent';
import { RenderToolCall } from 'worker/agents/operations/UserConversationProcessor';

export function createDeepDebuggerTool(
	agent: CodingAgentInterface,
	logger: StructuredLogger,
    toolRenderer: RenderToolCall,
    streamCb: (chunk: string) => void,
): ToolDefinition<
	{ issue: string; focus_paths?: string[] },
	{ transcript: string } | { error: string }
> {
	// Track calls per conversation turn (resets when buildTools is called again)
	let callCount = 0;
	
	return {
		type: 'function',
		function: {
			name: 'deep_debug',
			description:
				'Autonomous debugging assistant that investigates errors, reads files, and applies fixes. CANNOT run during code generation - will return GENERATION_IN_PROGRESS error if generation is active. LIMITED TO ONE CALL PER CONVERSATION TURN.',
			parameters: {
				type: 'object',
				properties: {
					issue: { type: 'string' },
					focus_paths: { type: 'array', items: { type: 'string' } },
				},
				required: ['issue'],
			},
		},
		implementation: async ({ issue, focus_paths }: { issue: string; focus_paths?: string[] }) => {
			// Check if already called in this turn
			if (callCount > 0) {
				logger.warn('Cannot start debugging: Already called once this turn');
				return {
					error: 'CALL_LIMIT_EXCEEDED: You are only allowed to make a single deep_debug call per conversation turn. Ask user for permission before trying again.'
				};
			}
			
			// Increment call counter
			callCount++;
			
			// Check if code generation is in progress
			if (agent.isCodeGenerating()) {
				logger.warn('Cannot start debugging: Code generation in progress');
				return {
					error: 'GENERATION_IN_PROGRESS: Code generation is currently running. Use wait_for_generation tool, then retry deep_debug.'
				};
			}

			// Check if another debug session is running
			if (agent.isDeepDebugging()) {
				logger.warn('Cannot start debugging: Another debug session in progress');
				return {
					error: 'DEBUG_IN_PROGRESS: Another debug session is currently running. Wait for it to finish, and if it doesn\'t, solve the issue, Use wait_for_debug tool, then retry deep_debug.'
				};
			}

			// Execute debug session - agent handles all logic internally
			const result = await agent.executeDeepDebug(issue, toolRenderer, streamCb, focus_paths);
			
			// Convert discriminated union to tool response format
			if (result.success) {
				return { transcript: result.transcript };
			} else {
				return { error: result.error };
			}
		},
	};
}
