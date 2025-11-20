import { tool, t } from '../types';
import { StructuredLogger } from '../../../logger';
import { ICodingAgent } from 'worker/agents/services/interfaces/ICodingAgent';

export type VirtualFilesystemResult =
	| { files: Array<{ path: string; purpose?: string; size: number }>; error?: never }
	| { files: Array<{ path: string; content: string }>; error?: never }
	| { error: string; files?: never };

export function createVirtualFilesystemTool(
	agent: ICodingAgent,
	logger: StructuredLogger
) {
	return tool({
		name: 'virtual_filesystem',
		description: `Interact with the virtual persistent workspace.
IMPORTANT: This reads from the VIRTUAL filesystem, NOT the sandbox. Files appear here immediately after generation and may not be deployed to sandbox yet.`,
		args: {
			command: t.enum(['list', 'read', 'delete']).describe('Action to perform: "list" shows all files, "read" returns file contents, "delete" deletes files'),
			paths: t.files.read().optional().describe('File paths to read/delete (required when command="read" or "delete"). Use relative paths from project root.'),
		},
		run: async ({ command, paths }) => {
			try {
				if (command === 'list') {
					logger.info('Listing virtual filesystem files');

					const files = agent.listFiles();

					const fileList = files.map(file => ({
						path: file.filePath,
						purpose: file.filePurpose,
						size: file.fileContents.length
					}));

					return {
						files: fileList
					};
				} else if (command === 'read') {
					if (!paths || paths.length === 0) {
						return {
							error: 'paths array is required when command is "read"'
						};
					}

					logger.info('Reading files from virtual filesystem', { count: paths.length });

					return await agent.readFiles(paths);
				} else if (command === 'delete') {
					if (!paths || paths.length === 0) {
						return {
							error: 'paths array is required when command is "delete"'
						};
					}

					logger.info('Deleting files from virtual filesystem', { count: paths.length });

					return await agent.deleteFiles(paths);
				} else {
					return {
						error: `Invalid command: ${command}. Must be "list", "read", or "delete"`
					};
				}
			} catch (error) {
				logger.error('Error in virtual_filesystem', error);
				return {
					error: `Error accessing virtual filesystem: ${error instanceof Error ? error.message : 'Unknown error'}`
				};
			}
		},
	});
}
