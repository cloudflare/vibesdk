import { tool, t, ToolDefinition } from '../types';
import { StructuredLogger } from '../../../logger';
import { ICodingAgent } from 'worker/agents/services/interfaces/ICodingAgent';

type CompletionResult = {
	acknowledged: true;
	message: string;
};

export function createMarkGenerationCompleteTool(
    agent: ICodingAgent,
	logger: StructuredLogger
): ToolDefinition<{ summary: string; filesGenerated: number }, CompletionResult> {
	return tool({
		name: 'mark_generation_complete',
		description: `Signal that initial project generation is complete and ready for the user to review and get feedback. After calling this tool, control would be handed over to the user.`,
		args: {
			summary: t.string().describe('Brief summary of what was built (2-3 sentences max). Describe the key features and functionality implemented.'),
			filesGenerated: t.number().describe('Total count of files generated during this build session'),
		},
		run: async ({ summary, filesGenerated }) => {
			logger.info('Generation marked complete', {
				summary,
				filesGenerated,
				timestamp: new Date().toISOString()
			});
            
            agent.setMVPGenerated();

			return {
				acknowledged: true as const,
				message: `Generation completion acknowledged. Successfully built project with ${filesGenerated} files. ${summary}`,
			};
		},
	});
}

export function createMarkDebuggingCompleteTool(
	logger: StructuredLogger
): ToolDefinition<{ summary: string; issuesFixed: number }, CompletionResult> {
	return tool({
		name: 'mark_debugging_complete',
		description: `Signal that debugging task is complete. Use this when:
- All reported issues have been fixed
- Verification confirms fixes work (run_analysis passes, get_runtime_errors shows no errors)
- No new errors were introduced by your changes
- All task requirements have been met

DO NOT call this tool if you are still investigating issues or in the process of fixing them.

Once you call this tool, make NO further tool calls. The system will stop immediately.`,
		args: {
			summary: t.string().describe('Brief summary of what was fixed (2-3 sentences max). Describe the issues resolved and verification performed.'),
			issuesFixed: t.number().describe('Count of issues successfully resolved'),
		},
		run: async ({ summary, issuesFixed }) => {
			logger.info('Debugging marked complete', {
				summary,
				issuesFixed,
				timestamp: new Date().toISOString()
			});

			return {
				acknowledged: true as const,
				message: `Debugging completion acknowledged. Successfully fixed ${issuesFixed} issue(s). ${summary}`,
			};
		},
	});
}
