import { ToolDefinition } from '../types';
import { StructuredLogger } from '../../../logger';
import { ICodingAgent } from 'worker/agents/services/interfaces/ICodingAgent';
import { StaticAnalysisResponse } from 'worker/services/sandbox/sandboxTypes';

export type RunAnalysisArgs = {
	files?: string[];
};

export type RunAnalysisResult = StaticAnalysisResponse;

export function createRunAnalysisTool(
	agent: ICodingAgent,
	logger: StructuredLogger,
): ToolDefinition<RunAnalysisArgs, RunAnalysisResult> {
	return {
		type: 'function' as const,
		function: {
			name: 'run_analysis',
			description:
				'Run static analysis (lint + typecheck), optionally scoped to given files.',
			parameters: {
				type: 'object',
				properties: {
					files: { type: 'array', items: { type: 'string' } },
				},
				required: [],
			},
		},
		implementation: async ({ files }) => {
			logger.info('Running static analysis', {
				filesCount: files?.length || 0,
			});
			return await agent.runStaticAnalysisCode(files);
		},
	};
}
