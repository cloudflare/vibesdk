import { ToolDefinition } from '../types';
import { StructuredLogger } from '../../../logger';
import { ICodingAgent } from 'worker/agents/services/interfaces/ICodingAgent';
import { generateBlueprint, type AgenticBlueprintGenerationArgs } from 'worker/agents/planning/blueprint';
import type { Blueprint } from 'worker/agents/schemas';
import { WebSocketMessageResponses } from '../../constants';

type GenerateBlueprintArgs = {
    prompt: string;
};
type GenerateBlueprintResult = { message: string; blueprint: Blueprint };

/**
 * Generates a blueprint
 */
export function createGenerateBlueprintTool(
    agent: ICodingAgent,
    logger: StructuredLogger
): ToolDefinition<GenerateBlueprintArgs, GenerateBlueprintResult> {
    return {
        type: 'function' as const,
        function: {
            name: 'generate_blueprint',
            description:
                'Generate a blueprint using the backend blueprint generator. Produces a plan-based blueprint for agentic behavior and a detailed PRD for phasic. Provide a description/prompt for the project to generate a blueprint.',
            parameters: {
                type: 'object',
                properties: {
                    prompt: {
                        type: 'string',
                        description: 'Prompt/user query for building the project. Use this to provide clarifications, additional requirements, or refined specifications based on conversation context.'
                    }
                },
                required: ['prompt'],
            },
        },
        implementation: async ({ prompt }: GenerateBlueprintArgs) => {
            const { env, inferenceContext, context } = agent.getOperationOptions();

            const isAgentic = agent.getBehavior() === 'agentic';

            // Language/frameworks are optional; provide sensible defaults
            const language = 'typescript';
            const frameworks: string[] = [];

            const args: AgenticBlueprintGenerationArgs = {
                env,
                inferenceContext,
                query: prompt,
                language,
                frameworks,
                templateDetails: context.templateDetails,
                projectType: agent.getProjectType(),
                stream: {
                    chunk_size: 256,
                    onChunk: (chunk: string) => {
                        agent.broadcast(WebSocketMessageResponses.BLUEPRINT_CHUNK, { chunk });
                    }
                }
            };
            const blueprint = await generateBlueprint(args);

            // Persist in state for subsequent steps
            await agent.setBlueprint(blueprint);

            logger.info('Blueprint generated via tool', {
                behavior: isAgentic ? 'agentic' : 'phasic',
                title: blueprint.title,
            });

            return { message: 'Blueprint generated successfully', blueprint };
        },
    };
}
