import { tool, type } from '../types';
import { StructuredLogger } from '../../../logger';
import { ICodingAgent } from 'worker/agents/services/interfaces/ICodingAgent';
import { BaseSandboxService } from 'worker/services/sandbox/BaseSandboxService';
import { selectTemplate } from '../../planning/templateSelector';
import { TemplateSelection } from '../../schemas';
import { TemplateFile } from 'worker/services/sandbox/sandboxTypes';
import { z } from 'zod';

export type InitSuitableTemplateResult =
	| {
		selection: TemplateSelection;
		importedFiles: TemplateFile[];
		reasoning: string;
		message: string;
	  }
	| { error: string };

export function createInitSuitableTemplateTool(
	agent: ICodingAgent,
	logger: StructuredLogger
) {
	return tool({
		name: 'init_suitable_template',
		description: 'Analyze user requirements and automatically select + import the most suitable template from library. Uses AI to match requirements against available templates. Returns selection with reasoning and imported files. For interactive projects (app/presentation/workflow) only. Call this BEFORE generate_blueprint.',
		args: {
			query: type(z.string(), () => ({
				files: { mode: 'write', paths: [] },
			})).describe('User requirements and project description. Provide clear description of what needs to be built.'),
		},
		run: async ({ query }) => {
			try {
				const projectType = agent.getProjectType();
				const operationOptions = agent.getOperationOptions();

				logger.info('Analyzing template suitability and importing', {
					projectType,
					queryLength: query.length
				});

				const templatesResponse = await BaseSandboxService.listTemplates();
				if (!templatesResponse.success || !templatesResponse.templates) {
					return {
						error: `Failed to fetch templates: ${templatesResponse.error || 'Unknown error'}`
					};
				}

				logger.info('Templates fetched', { count: templatesResponse.templates.length });

				const selection = await selectTemplate({
					env: operationOptions.env,
					query,
					projectType,
					availableTemplates: templatesResponse.templates,
					inferenceContext: operationOptions.inferenceContext,
				});

				logger.info('Template selection completed', {
					selected: selection.selectedTemplateName,
					projectType: selection.projectType
				});

				if (!selection.selectedTemplateName) {
					return {
						error: `No suitable template found for this project. Reasoning: ${selection.reasoning}. Consider using virtual-first mode (generate all config files yourself) or refine requirements.`
					};
				}

				const importResult = await agent.importTemplate(
					selection.selectedTemplateName
				);

				logger.info('Template imported successfully', {
					templateName: importResult.templateName,
					filesCount: importResult.files.length
				});

				const reasoningMessage = `
**AI Template Selection Complete**

**Selected Template**: ${selection.selectedTemplateName}
**Project Type**: ${selection.projectType}
**Complexity**: ${selection.complexity || 'N/A'}
**Style**: ${selection.styleSelection || 'N/A'}
**Use Case**: ${selection.useCase || 'N/A'}

**Why This Template**:
${selection.reasoning}

**Template Files Imported**: ${importResult.files.length} important files

**Next Step**: Use filesystem tools to read and understand relevant files
`.trim();

				return {
					selection,
					importedFiles: importResult.files.map(f => ({
						filePath: f.filePath,
					})),
					reasoning: reasoningMessage,
					message: `Template "${selection.selectedTemplateName}" selected and imported successfully.`
				};

			} catch (error) {
				logger.error('Error in init_suitable_template', error);
				return {
					error: `Error selecting/importing template: ${error instanceof Error ? error.message : 'Unknown error'}`
				};
			}
		},
	});
}
