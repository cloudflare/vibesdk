import { ToolDefinition } from '../types';
import { StructuredLogger } from '../../../logger';
import { CodingAgentInterface } from 'worker/agents/services/implementations/CodingAgent';
import { Blueprint } from 'worker/agents/schemas';

type AlterBlueprintArgs = {
  patch: Partial<Blueprint> & {
    projectName?: string;
  };
};

export function createAlterBlueprintTool(
  agent: CodingAgentInterface,
  logger: StructuredLogger
): ToolDefinition<AlterBlueprintArgs, Blueprint> {
  return {
    type: 'function' as const,
    function: {
      name: 'alter_blueprint',
      description: 'Apply a validated patch to the current blueprint. Only allowed keys are accepted.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          patch: {
            type: 'object',
            additionalProperties: false,
            properties: {
              title: { type: 'string' },
              projectName: { type: 'string', minLength: 3, maxLength: 50, pattern: '^[a-z0-9-_]+$' },
              detailedDescription: { type: 'string' },
              description: { type: 'string' },
              colorPalette: { type: 'array', items: { type: 'string' } },
              views: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { name: { type: 'string' }, description: { type: 'string' } }, required: ['name', 'description'] } },
              userFlow: { type: 'object', additionalProperties: false, properties: { uiLayout: { type: 'string' }, uiDesign: { type: 'string' }, userJourney: { type: 'string' } } },
              dataFlow: { type: 'string' },
              architecture: { type: 'object', additionalProperties: false, properties: { dataFlow: { type: 'string' } } },
              pitfalls: { type: 'array', items: { type: 'string' } },
              frameworks: { type: 'array', items: { type: 'string' } },
              implementationRoadmap: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { phase: { type: 'string' }, description: { type: 'string' } }, required: ['phase', 'description'] } },
            },
          },
        },
        required: ['patch'],
      },
    },
    implementation: async (args) => {
      logger.info('Altering blueprint', { keys: Object.keys(args.patch) });
      const updated = await agent.updateBlueprint(args.patch);
      return updated;
    },
  };
}
