import { ToolDefinition } from '../types';
import { StructuredLogger } from '../../../logger';
import { CodingAgentInterface } from 'worker/agents/services/implementations/CodingAgent';

export function createWaitForGenerationTool(
	agent: CodingAgentInterface,
	logger: StructuredLogger
): ToolDefinition<Record<string, never>, { status: string } | { error: string }> {
	return {
		type: 'function',
		function: {
			name: 'wait_for_generation',
			description:
				'Wait for code generation to complete. Use when deep_debug returns GENERATION_IN_PROGRESS error. Returns immediately if no generation is running.',
			parameters: {
				type: 'object',
				properties: {},
				required: [],
			},
		},
		implementation: async () => {
			try {
				if (agent.isCodeGenerating()) {
					logger.info('Waiting for code generation to complete...');
					await agent.waitForGeneration();
					logger.info('Code generation completed');
					return { status: 'Generation completed' };
				} else {
					logger.info('No code generation in progress');
					return { status: 'No generation was running' };
				}
			} catch (error) {
				logger.error('Error waiting for generation', error);
				return {
					error:
						error instanceof Error
							? `Failed to wait for generation: ${error.message}`
							: 'Unknown error while waiting for generation',
				};
			}
		},
	};
}
