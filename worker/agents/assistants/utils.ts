import { ToolDefinition } from '../tools/types';
import { LoopDetector } from '../inferutils/loopDetection';
import { createLogger } from '../../logger';

const logger = createLogger('LoopDetection');

/**
 * Wraps tool definitions with loop detection capability.
 * 
 * When a loop is detected (same tool with same args called repeatedly),
 * the warning is injected into the tool's result so it flows naturally
 * into the inference chain and the LLM sees it in the next iteration.
 */
export function wrapToolsWithLoopDetection(
	tools: ToolDefinition[],
	loopDetector: LoopDetector
): ToolDefinition[] {
	return tools.map((tool) => {
		const originalImplementation = tool.implementation;
		
		return {
			...tool,
			implementation: async (args: unknown) => {
				// Check for repetition before executing
				let loopWarning: string | null = null;
				if (args && typeof args === 'object' && !Array.isArray(args)) {
					const argsRecord = args as Record<string, unknown>;
					if (loopDetector.detectRepetition(tool.name, argsRecord)) {
						logger.warn(`Loop detected: ${tool.name}`);
						const warningMessage = loopDetector.generateWarning(tool.name);
						loopWarning = '\n\n' + warningMessage.content;
					}
				}
				
				// Execute original implementation
				const result = await originalImplementation(args);
				
				// If loop detected, prepend warning to result
				if (loopWarning) {
					// Handle different result types
					if (typeof result === 'string') {
                        logger.warn(`Injecting Loop Warning in string result`);
						return loopWarning + '\n\n' + result;
					} else if (result && typeof result === 'object') {
                        logger.warn(`Injecting Loop Warning in object result`);
						return { loopWarning, ...result };
					} else {
                        logger.warn(`Injecting Loop Warning in unknown result`);
                        return {loopWarning, result};
                    }
				}
				
				return result;
			},
		};
	});
}
