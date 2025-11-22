import { tool, t } from '../types';
import { StructuredLogger } from '../../../logger';
import { ICodingAgent } from 'worker/agents/services/interfaces/ICodingAgent';
import { StaticAnalysisResponse } from 'worker/services/sandbox/sandboxTypes';

export type RunAnalysisResult = StaticAnalysisResponse;

export function createRunAnalysisTool(
	agent: ICodingAgent,
	logger: StructuredLogger
) {
	return tool({
		name: 'run_analysis',
		description:
			'Run static analysis (lint + typecheck), optionally scoped to given files.',
		args: {
			files: t.analysis.files().describe('Optional array of files to analyze'),
		},
		run: async ({ files }) => {
			logger.info('Running static analysis', {
				filesCount: files?.length || 0,
			});
			return await agent.runStaticAnalysisCode(files);
		},
	});
}
