import { tool, t } from '../types';
import { StructuredLogger } from '../../../logger';
import { ICodingAgent } from 'worker/agents/services/interfaces/ICodingAgent';

export type ReadFilesResult =
	| { files: { path: string; content: string }[] }
	| { error: string };

export function createReadFilesTool(
	agent: ICodingAgent,
	logger: StructuredLogger
) {
	return tool({
		name: 'read_files',
		description: 'Read file contents by exact RELATIVE paths (sandbox pwd = project root). Prefer batching multiple paths in a single call to reduce overhead. Target all relevant files useful for understanding current context',
		args: {
			paths: t.files.read().describe('Array of relative file paths to read'),
			timeout: t.number().default(30000).describe('Timeout in milliseconds'),
		},
		run: async ({ paths, timeout }) => {
			try {
				logger.info('Reading files', { count: paths.length, timeout });

				const timeoutPromise = new Promise<{ error: string }>((_, reject) =>
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
	});
}
