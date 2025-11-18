import { ToolDefinition, ErrorResult } from '../types';
import { StructuredLogger } from '../../../logger';
import { CodingAgentInterface } from 'worker/agents/services/implementations/CodingAgent';

export type ReadFilesArgs = {
	paths: string[];
	timeout?: number;
};

export type ReadFilesResult =
	| { files: { path: string; content: string }[] }
	| ErrorResult;

export function createReadFilesTool(
	agent: CodingAgentInterface,
	logger: StructuredLogger,
): ToolDefinition<ReadFilesArgs, ReadFilesResult> {
	return {
		type: 'function' as const,
		function: {
			name: 'read_files',
			description:
				'Read file contents by exact RELATIVE paths (sandbox pwd = project root). Prefer batching multiple paths in a single call to reduce overhead. Target all relevant files useful for understanding current context',
			parameters: {
				type: 'object',
				properties: {
					paths: { type: 'array', items: { type: 'string' } },
					timeout: { type: 'number', default: 30000 },
				},
				required: ['paths'],
			},
		},
		implementation: async ({ paths, timeout = 30000 }) => {
			try {
				logger.info('Reading files', { count: paths.length, timeout });
				
				const timeoutPromise = new Promise<ErrorResult>((_, reject) => 
					setTimeout(() => reject(new Error(`Read files operation timed out after ${timeout}ms`)), timeout)
				);
				
				return await Promise.race([
					agent.readFiles(paths),
					timeoutPromise
				]);
			} catch (error) {
				return {
					error:
						error instanceof Error
							? `Failed to read files: ${error.message}`
							: 'Unknown error occurred while reading files',
				};
			}
		},
	};
}
