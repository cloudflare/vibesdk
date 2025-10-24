import { ToolDefinition, ErrorResult } from '../types';
import { StructuredLogger } from '../../../logger';
import { CodingAgentInterface } from 'worker/agents/services/implementations/CodingAgent';
import { FileConceptType } from 'worker/agents/schemas';

export type GenerateFilesArgs = {
	phase_name: string;
	phase_description: string;
	requirements: string[];
	files: FileConceptType[];
};

export type GenerateFilesResult =
	| {
			files: Array<{ path: string; purpose: string; diff: string }>;
			summary: string;
	  }
	| ErrorResult;

export function createGenerateFilesTool(
	agent: CodingAgentInterface,
	logger: StructuredLogger,
): ToolDefinition<GenerateFilesArgs, GenerateFilesResult> {
	return {
		type: 'function' as const,
		function: {
			name: 'generate_files',
			description: `Generate new files or completely rewrite existing files using the full phase implementation system. 
            
Use this when:
- File(s) don't exist and need to be created
- regenerate_file failed (file too broken to patch)
- Need multiple coordinated files for a feature
- Scaffolding new components/utilities

The system will:
1. Automatically determine which files to create based on requirements
2. Generate properly typed, coordinated code
3. Deploy changes to sandbox
4. Return diffs for all generated files

Provide detailed, specific requirements. The more detail, the better the results.`,
			parameters: {
				type: 'object',
				properties: {
					phase_name: {
						type: 'string',
						description:
							'Short, descriptive name for what you\'re generating (e.g., "Add data export utilities")',
					},
					phase_description: {
						type: 'string',
						description: 'Brief description of what these files should accomplish',
					},
					requirements: {
						type: 'array',
						items: { type: 'string' },
						description:
							'Array of specific, detailed requirements. Be explicit about function signatures, types, implementation details.',
					},
					files: {
						type: 'array',
						items: {
							type: 'object',
							properties: {
								path: { type: 'string', description: 'File path relative to project root' },
								purpose: { type: 'string', description: 'Brief description of file purpose' },
								changes: { type: ['string', 'null'], description: 'Specific changes for existing files, or null for new files' }
							},
							required: ['path', 'purpose', 'changes']
						},
						description: 'Array of files to generate with their paths and purposes'
					},
				},
				required: ['phase_name', 'phase_description', 'requirements', 'files'],
			},
		},
		implementation: async ({ phase_name, phase_description, requirements, files }) => {
			try {
				logger.info('Generating files via phase implementation', {
					phase_name,
					requirementsCount: requirements.length,
					filesCount: files.length,
				});

				const result = await agent.generateFiles(phase_name, phase_description, requirements, files);

				return {
					files: result.files.map((f) => ({
						path: f.path,
						purpose: f.purpose || '',
						diff: f.diff,
					})),
					summary: `Generated ${result.files.length} file(s) for: ${phase_name}`,
				};
			} catch (error) {
				return {
					error:
						error instanceof Error
							? `Failed to generate files: ${error.message}`
							: 'Unknown error occurred while generating files',
				};
			}
		},
	};
}
