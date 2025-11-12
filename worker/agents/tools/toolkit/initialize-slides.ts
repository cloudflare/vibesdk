import { ToolDefinition } from '../types';
import { StructuredLogger } from '../../../logger';
import { ICodingAgent } from 'worker/agents/services/interfaces/ICodingAgent';

type InitializeSlidesArgs = {
    theme?: string;
    force_preview?: boolean;
};

type InitializeSlidesResult = { message: string };

/**
 * Initializes a Spectacle-based slides runtime in from-scratch projects.
 * - Imports the Spectacle template files into the repository
 * - Commits them
 * - Deploys a preview (agent policy will allow because slides exist)
 */
export function createInitializeSlidesTool(
    agent: ICodingAgent,
    logger: StructuredLogger,
): ToolDefinition<InitializeSlidesArgs, InitializeSlidesResult> {
    return {
        type: 'function' as const,
        function: {
            name: 'initialize_slides',
            description: 'Initialize a Spectacle slides project inside the current workspace and deploy a live preview. Use only if the user wants a slide deck.',
            parameters: {
                type: 'object',
                properties: {
                    theme: { type: 'string', description: 'Optional theme preset name' },
                    force_preview: { type: 'boolean', description: 'Force redeploy sandbox after import' },
                },
                required: [],
            },
        },
        implementation: async ({ theme, force_preview }: InitializeSlidesArgs) => {
            logger.info('Initializing slides via Spectacle template', { theme });
            const { templateName, filesImported } = await agent.importTemplate('spectacle');
            logger.info('Imported template', { templateName, filesImported });

            const deployMsg = await agent.deployPreview(true, !!force_preview);
            return { message: `Slides initialized with template '${templateName}', files: ${filesImported}. ${deployMsg}` };
        },
    };
}

