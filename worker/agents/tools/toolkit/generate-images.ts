import { ToolDefinition } from '../types';
import { StructuredLogger } from '../../../logger';
import { ICodingAgent } from 'worker/agents/services/interfaces/ICodingAgent';

type GenerateImagesArgs = {
    prompts: string[];
    style?: string;
};

type GenerateImagesResult = { message: string };

export function createGenerateImagesTool(
    _agent: ICodingAgent,
    _logger: StructuredLogger,
): ToolDefinition<GenerateImagesArgs, GenerateImagesResult> {
    return {
        type: 'function' as const,
        function: {
            name: 'generate_images',
            description: 'Generate images for the project (stub). Use later when the image generation pipeline is available.',
            parameters: {
                type: 'object',
                properties: {
                    prompts: { type: 'array', items: { type: 'string' } },
                    style: { type: 'string' },
                },
                required: ['prompts'],
            },
        },
        implementation: async ({ prompts, style }: GenerateImagesArgs) => {
            return { message: `Image generation not implemented yet. Requested ${prompts.length} prompt(s)${style ? ` with style ${style}` : ''}.` };
        },
    };
}

