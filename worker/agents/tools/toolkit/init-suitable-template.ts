import { ToolDefinition, ErrorResult } from '../types';
import { StructuredLogger } from '../../../logger';
import { ICodingAgent } from 'worker/agents/services/interfaces/ICodingAgent';
import { BaseSandboxService } from 'worker/services/sandbox/BaseSandboxService';
import { selectTemplate } from '../../planning/templateSelector';
import { TemplateSelection } from '../../schemas';
import { TemplateFile } from 'worker/services/sandbox/sandboxTypes';

export type InitSuitableTemplateArgs = {
    query: string;
};

export type InitSuitableTemplateResult =
    | {
        selection: TemplateSelection;
        importedFiles: TemplateFile[];
        reasoning: string;
        message: string;
      }
    | ErrorResult;

/**
 * template selection and import.
 * Analyzes user requirements, selects best matching template from library,
 * and automatically imports it to the virtual filesystem.
 */
export function createInitSuitableTemplateTool(
    agent: ICodingAgent,
    logger: StructuredLogger
): ToolDefinition<InitSuitableTemplateArgs, InitSuitableTemplateResult> {
    return {
        type: 'function' as const,
        function: {
            name: 'init_suitable_template',
            description: 'Analyze user requirements and automatically select + import the most suitable template from library. Uses AI to match requirements against available templates. Returns selection with reasoning and imported files. For interactive projects (app/presentation/workflow) only. Call this BEFORE generate_blueprint.',
            parameters: {
                type: 'object',
                properties: {
                    query: {
                        type: 'string',
                        description: 'User requirements and project description. Provide clear description of what needs to be built.',
                    },
                },
                required: ['query'],
            },
        },
        implementation: async ({ query }: InitSuitableTemplateArgs) => {
            try {
                const projectType = agent.getProjectType();
                const operationOptions = agent.getOperationOptions();

                logger.info('Analyzing template suitability and importing', {
                    projectType,
                    queryLength: query.length
                });

                // Fetch available templates
                const templatesResponse = await BaseSandboxService.listTemplates();
                if (!templatesResponse.success || !templatesResponse.templates) {
                    return {
                        error: `Failed to fetch templates: ${templatesResponse.error || 'Unknown error'}`
                    };
                }

                logger.info('Templates fetched', { count: templatesResponse.templates.length });

                // Use AI selector to find best match
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

                // If no suitable template found, return error suggesting scratch mode
                if (!selection.selectedTemplateName) {
                    return {
                        error: `No suitable template found for this project. Reasoning: ${selection.reasoning}. Consider using virtual-first mode (generate all config files yourself) or refine requirements.`
                    };
                }

                // Import the selected template
                const importResult = await agent.importTemplate(
                    selection.selectedTemplateName,
                    `Selected template: ${selection.selectedTemplateName}`
                );

                logger.info('Template imported successfully', {
                    templateName: importResult.templateName,
                    filesCount: importResult.files.length
                });

                // Build detailed reasoning message
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
**Ready for**: Blueprint generation with template context

**Next Step**: Use generate_blueprint() to create project plan that leverages this template's features.
`.trim();

                return {
                    selection,
                    importedFiles: importResult.files,
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
    };
}
