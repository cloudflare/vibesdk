import { tool, t } from '../types';
import { StructuredLogger } from '../../../logger';
import { ICodingAgent } from 'worker/agents/services/interfaces/ICodingAgent';

export function createGenerateImagesTool(
	_agent: ICodingAgent,
	_logger: StructuredLogger
) {
	return tool({
		name: 'generate_images',
		description: 'Generate images for the project (stub). Use later when the image generation pipeline is available.',
		args: {
			prompts: t.array(t.string()).describe('Array of image generation prompts'),
			style: t.string().optional().describe('Optional style parameter for image generation'),
		},
		run: async ({ prompts, style }) => {
			return { message: `Image generation not implemented yet. Requested ${prompts.length} prompt(s)${style ? ` with style ${style}` : ''}.` };
		},
	});
}

