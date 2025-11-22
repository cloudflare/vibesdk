import { tool, t } from '../types';
import { StructuredLogger } from '../../../logger';
import { ICodingAgent } from 'worker/agents/services/interfaces/ICodingAgent';

export function createRenameProjectTool(
	agent: ICodingAgent,
	logger: StructuredLogger
) {
	return tool({
		name: 'rename_project',
		description: 'Rename the project. Lowercase letters, numbers, hyphens, and underscores only. No spaces or dots. Call this alongside queue_request tool to update the codebase',
		args: {
			newName: t.blueprint().describe('New project name'),
		},
		run: async ({ newName }) => {
			logger.info('Renaming project', { newName });
			const ok = await agent.updateProjectName(newName);
			if (!ok) {
				throw new Error('Failed to rename project');
			}
			return { projectName: newName };
		},
	});
}
