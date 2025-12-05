import { tool, t } from '../types';
import { StructuredLogger } from '../../../logger';
import { ICodingAgent } from 'worker/agents/services/interfaces/ICodingAgent';
import { generateBlueprint, type AgenticBlueprintGenerationArgs } from 'worker/agents/planning/blueprint';
import { WebSocketMessageResponses } from '../../constants';

export function createGenerateBlueprintTool(
	agent: ICodingAgent,
	logger: StructuredLogger
) {
	return tool({
		name: 'generate_blueprint',
		description:
			'Generate a blueprint using the backend blueprint generator. Produces a plan-based blueprint for agentic behavior and a detailed PRD for phasic. Provide a description/prompt for the project to generate a blueprint.',
		args: {
			prompt: t.blueprint().describe('Prompt/user query for building the project. Use this to provide clarifications, additional requirements, or refined specifications based on conversation context.'),
		},
		run: async ({ prompt }) => {
			const { env, inferenceContext, context } = agent.getOperationOptions();

			const isAgentic = agent.getBehavior() === 'agentic';

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

			await agent.setBlueprint(blueprint);

			logger.info('Blueprint generated via tool', {
				behavior: isAgentic ? 'agentic' : 'phasic',
				title: blueprint.title,
			});

			return { message: 'Blueprint generated successfully', blueprint };
		},
	});
}
