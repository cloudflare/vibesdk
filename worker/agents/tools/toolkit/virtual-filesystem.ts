import { ToolDefinition, ErrorResult } from '../types';
import { StructuredLogger } from '../../../logger';
import { ICodingAgent } from 'worker/agents/services/interfaces/ICodingAgent';

export type VirtualFilesystemArgs = {
    command: 'list' | 'read';
    paths?: string[];
};

export type VirtualFilesystemResult =
    | { files: Array<{ path: string; purpose?: string; size: number }> }
    | { files: Array<{ path: string; content: string }> }
    | ErrorResult;

export function createVirtualFilesystemTool(
    agent: ICodingAgent,
    logger: StructuredLogger
): ToolDefinition<VirtualFilesystemArgs, VirtualFilesystemResult> {
    return {
        type: 'function' as const,
        function: {
            name: 'virtual_filesystem',
            description: `Interact with the virtual persistent workspace.
IMPORTANT: This reads from the VIRTUAL filesystem, NOT the sandbox. Files appear here immediately after generation and may not be deployed to sandbox yet.`,
            parameters: {
                type: 'object',
                properties: {
                    command: {
                        type: 'string',
                        enum: ['list', 'read'],
                        description: 'Action to perform: "list" shows all files, "read" returns file contents',
                    },
                    paths: {
                        type: 'array',
                        items: { type: 'string' },
                        description: 'File paths to read (required when command="read"). Use relative paths from project root.',
                    },
                },
                required: ['command'],
            },
        },
        implementation: async ({ command, paths }: VirtualFilesystemArgs) => {
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
                } else {
                    return {
                        error: `Invalid command: ${command}. Must be "list" or "read"`
                    };
                }
            } catch (error) {
                logger.error('Error in virtual_filesystem', error);
                return {
                    error: `Error accessing virtual filesystem: ${error instanceof Error ? error.message : 'Unknown error'}`
                };
            }
        },
    };
}
