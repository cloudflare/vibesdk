import { ToolDefinition } from '../types';
import { StructuredLogger } from '../../../logger';
import { ICodingAgent } from 'worker/agents/services/interfaces/ICodingAgent';
import { Blueprint } from 'worker/agents/schemas';

type AlterBlueprintArgs = {
    patch: Record<string, unknown>;
};

export function createAlterBlueprintTool(
    agent: ICodingAgent,
    logger: StructuredLogger
): ToolDefinition<AlterBlueprintArgs, Blueprint> {
    // Build behavior-aware schema at tool creation time (tools are created per-agent)
    const isAgentic = agent.getBehavior() === 'agentic';

    const agenticProperties = {
        title: { type: 'string' },
        projectName: { type: 'string', minLength: 3, maxLength: 50, pattern: '^[a-z0-9-_]+$' },
        description: { type: 'string' },
        detailedDescription: { type: 'string' },
        colorPalette: { type: 'array', items: { type: 'string' } },
        frameworks: { type: 'array', items: { type: 'string' } },
        // Agentic-only: plan
        plan: { type: 'array', items: { type: 'string' } },
    } as const;

    const phasicProperties = {
        title: { type: 'string' },
        projectName: { type: 'string', minLength: 3, maxLength: 50, pattern: '^[a-z0-9-_]+$' },
        description: { type: 'string' },
        detailedDescription: { type: 'string' },
        colorPalette: { type: 'array', items: { type: 'string' } },
        frameworks: { type: 'array', items: { type: 'string' } },
        views: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { name: { type: 'string' }, description: { type: 'string' } }, required: ['name', 'description'] } },
        userFlow: { type: 'object', additionalProperties: false, properties: { uiLayout: { type: 'string' }, uiDesign: { type: 'string' }, userJourney: { type: 'string' } } },
        dataFlow: { type: 'string' },
        architecture: { type: 'object', additionalProperties: false, properties: { dataFlow: { type: 'string' } } },
        pitfalls: { type: 'array', items: { type: 'string' } },
        implementationRoadmap: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { phase: { type: 'string' }, description: { type: 'string' } }, required: ['phase', 'description'] } },
        // No plan here; phasic handles phases separately
    } as const;

    const dynamicPatchSchema = isAgentic ? agenticProperties : phasicProperties;

    return {
        type: 'function' as const,
        function: {
            name: 'alter_blueprint',
            description: isAgentic
                ? 'Apply a patch to the agentic blueprint (title, description, colorPalette, frameworks, plan, projectName).'
                : 'Apply a patch to the phasic blueprint (title, description, colorPalette, frameworks, views, userFlow, architecture, dataFlow, pitfalls, implementationRoadmap, projectName).',
            parameters: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    patch: {
                        type: 'object',
                        additionalProperties: false,
                        properties: dynamicPatchSchema as Record<string, unknown>,
                    },
                },
                required: ['patch'],
            },
        },
        implementation: async ({ patch }) => {
            logger.info('Altering blueprint', { keys: Object.keys(patch || {}) });
            const updated = await agent.updateBlueprint(patch as Partial<Blueprint>);
            return updated;
        },
    };
}
