import { tool, t, type } from '../types';
import { StructuredLogger } from '../../../logger';
import { ICodingAgent } from 'worker/agents/services/interfaces/ICodingAgent';
import { z } from 'zod';

export function createInitializeSlidesTool(
	agent: ICodingAgent,
	logger: StructuredLogger
) {
	return tool({
		name: 'initialize_slides',
		description: 'Initialize a presentation template inside the current workspace and deploy a live preview. Use only if the user wants a slide deck.',
		args: {
			theme: type(z.string().optional(), () => ({
				files: { mode: 'write', paths: [] },
				sandbox: { operation: 'deploy' },
			})).describe('Optional theme preset name'),
			force_preview: t.boolean().optional().describe('Force redeploy sandbox after import'),
		},
		run: async ({ theme, force_preview }) => {
			logger.info('Initializing presentation template', { theme });
			const { templateName, filesImported } = await agent.importTemplate('reveal-presentation-pro');
			logger.info('Imported presentation template', { templateName, filesImported });

			const deployMsg = await agent.deployPreview(true, !!force_preview);
			return { message: `Slides initialized with template '${templateName}', files: ${filesImported}. ${deployMsg}` };
		},
	});
}

