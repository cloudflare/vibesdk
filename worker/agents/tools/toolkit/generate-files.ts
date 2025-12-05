import { tool, t } from '../types';
import { StructuredLogger } from '../../../logger';
import { ICodingAgent } from 'worker/agents/services/interfaces/ICodingAgent';
import { FileConceptType } from 'worker/agents/schemas';

export type GenerateFilesResult =
	| {
			files: Array<{ path: string; purpose: string; diff: string }>;
			summary: string;
	  }
	| { error: string };

export function createGenerateFilesTool(
	agent: ICodingAgent,
	logger: StructuredLogger
) {
	return tool({
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
		args: {
			phase_name: t.string().describe('Short, descriptive name for what you\'re generating (e.g., "Add data export utilities")'),
			phase_description: t.string().describe('Brief description of what these files should accomplish'),
			requirements: t.array(t.string()).describe('Array of specific, detailed requirements. Be explicit about function signatures, types, implementation details.'),
			files: t.generation().describe('Array of file specifications. Each object MUST have: path (string - relative file path), description (string - brief description of what the file does)'),
		},
		run: async ({ phase_name, phase_description, requirements, files }) => {
			try {
				logger.info('Generating files via phase implementation', {
					phase_name,
					requirementsCount: requirements.length,
					filesCount: files.length,
				});

				const fileConcepts: FileConceptType[] = files.map((file) => ({
					path: file.path,
					purpose: file.description,
					changes: null,
				}));

				const result = await agent.generateFiles(phase_name, phase_description, requirements, fileConcepts);

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
	});
}
