import { ToolDefinition, ErrorResult } from '../types';
import { StructuredLogger } from '../../../logger';
import { CodingAgentInterface } from 'worker/agents/services/implementations/CodingAgent';

export type RegenerateFileArgs = {
	path: string;
	issues: string[];
};

export type RegenerateFileResult =
	| { path: string; diff: string }
	| ErrorResult;

export function createRegenerateFileTool(
	agent: CodingAgentInterface,
	logger: StructuredLogger,
): ToolDefinition<RegenerateFileArgs, RegenerateFileResult> {
	return {
		type: 'function' as const,
		function: {
			name: 'regenerate_file',
			description:
				`Autonomous AI agent that applies surgical fixes to code files. Takes file path and array of specific issues to fix. Returns diff showing changes made.

CRITICAL: Provide detailed, specific issues - not vague descriptions. See system prompt for full usage guide. These would be implemented by an independent LLM AI agent`,
			parameters: {
				type: 'object',
				properties: {
					path: { type: 'string' },
					issues: { type: 'array', items: { type: 'string' } },
				},
				required: ['path', 'issues'],
			},
		},
		implementation: async ({ path, issues }) => {
			try {
				logger.info('Regenerating file', {
					path,
					issuesCount: issues.length,
				});
				return await agent.regenerateFile(path, issues);
			} catch (error) {
				return {
					error:
						error instanceof Error
							? `Failed to regenerate file: ${error.message}`
							: 'Unknown error occurred while regenerating file',
				};
			}
		},
	};
}
