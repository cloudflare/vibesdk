import { ToolDefinition } from '../types';
import { StructuredLogger } from '../../../logger';
import { CodingAgentInterface } from 'worker/agents/services/implementations/CodingAgent';

type RenameArgs = {
    newName: string;
};

type RenameResult = { projectName: string };

export function createRenameProjectTool(
    agent: CodingAgentInterface,
    logger: StructuredLogger
): ToolDefinition<RenameArgs, RenameResult> {
    return {
        type: 'function' as const,
        function: {
            name: 'rename_project',
            description: 'Rename the project. Lowercase letters, numbers, hyphens, and underscores only. No spaces or dots. Call this alongside queue_request tool to update the codebase',
            parameters: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    newName: {
                        type: 'string',
                        minLength: 3,
                        maxLength: 50,
                        pattern: '^[a-z0-9-_]+$'
                    },
                },
                required: ['newName'],
            },
        },
        implementation: async (args) => {
            logger.info('Renaming project', { newName: args.newName });
            const ok = await agent.updateProjectName(args.newName);
            if (!ok) {
                throw new Error('Failed to rename project');
            }
            return { projectName: args.newName };
        },
    };
}
