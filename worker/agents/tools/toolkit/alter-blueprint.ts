import { tool, type } from '../types';
import { StructuredLogger } from '../../../logger';
import { ICodingAgent } from 'worker/agents/services/interfaces/ICodingAgent';
import { Blueprint } from 'worker/agents/schemas';
import { z } from 'zod';

export function createAlterBlueprintTool(
	agent: ICodingAgent,
	logger: StructuredLogger
) {
	const isAgentic = agent.getBehavior() === 'agentic';

	const agenticPatchSchema = z.object({
		title: z.string().optional(),
		projectName: z.string().min(3).max(50).regex(/^[a-z0-9-_]+$/).optional(),
		description: z.string().optional(),
		detailedDescription: z.string().optional(),
		colorPalette: z.array(z.string()).optional(),
		frameworks: z.array(z.string()).optional(),
		plan: z.array(z.string()).optional(),
	});

	const phasicPatchSchema = z.object({
		title: z.string().optional(),
		projectName: z.string().min(3).max(50).regex(/^[a-z0-9-_]+$/).optional(),
		description: z.string().optional(),
		detailedDescription: z.string().optional(),
		colorPalette: z.array(z.string()).optional(),
		frameworks: z.array(z.string()).optional(),
		views: z.array(z.object({ name: z.string(), description: z.string() })).optional(),
		userFlow: z.object({ uiLayout: z.string().optional(), uiDesign: z.string().optional(), userJourney: z.string().optional() }).optional(),
		dataFlow: z.string().optional(),
		architecture: z.object({ dataFlow: z.string().optional() }).optional(),
		pitfalls: z.array(z.string()).optional(),
		implementationRoadmap: z.array(z.object({ phase: z.string(), description: z.string() })).optional(),
	});

	const patchSchema = isAgentic ? agenticPatchSchema : phasicPatchSchema;

	const patchType = type(
		patchSchema,
		() => ({ blueprint: true })
	);

	return tool({
		name: 'alter_blueprint',
		description: isAgentic
			? 'Apply a patch to the agentic blueprint (title, description, colorPalette, frameworks, plan, projectName).'
			: 'Apply a patch to the phasic blueprint (title, description, colorPalette, frameworks, views, userFlow, architecture, dataFlow, pitfalls, implementationRoadmap, projectName).',
		args: {
			patch: patchType,
		},
		run: async ({ patch }) => {
			logger.info('Altering blueprint', { keys: Object.keys(patch || {}) });
			const updated = await agent.updateBlueprint(patch as Partial<Blueprint>);
			return updated;
		},
	});
}
