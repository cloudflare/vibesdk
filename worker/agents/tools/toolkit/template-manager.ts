import { ToolDefinition, ErrorResult } from '../types';
import { StructuredLogger } from '../../../logger';
import { ICodingAgent } from 'worker/agents/services/interfaces/ICodingAgent';
import { BaseSandboxService } from 'worker/services/sandbox/BaseSandboxService';

export type TemplateManagerArgs = {
    command: 'list' | 'select';
    templateName?: string;
};

export type TemplateManagerResult =
    | { summary: string }
    | { message: string; templateName: string; files: Array<{ path: string; content: string }> }
    | ErrorResult;

/**
 * Manages project templates - list available templates or select one for the project.
 * Use 'list' to see all available templates with descriptions.
 * Use 'select' with templateName to choose and import a template.
 */
export function createTemplateManagerTool(
    agent: ICodingAgent,
    logger: StructuredLogger
): ToolDefinition<TemplateManagerArgs, TemplateManagerResult> {
    return {
        type: 'function' as const,
        function: {
            name: 'template_manager',
            description: 'Manage project templates. Use command="list" to see available templates with their descriptions, frameworks, and use cases. Use command="select" with templateName to select and import a template. Default to "minimal-vite" for 99% of cases unless you have specific requirements.',
            parameters: {
                type: 'object',
                properties: {
                    command: {
                        type: 'string',
                        enum: ['list', 'select'],
                        description: 'Action to perform: "list" shows all templates, "select" imports a template',
                    },
                    templateName: {
                        type: 'string',
                        description: 'Name of template to select (required when command="select"). Examples: "minimal-vite", "c-code-react-runner"',
                    },
                },
                required: ['command'],
            },
        },
        implementation: async ({ command, templateName }: TemplateManagerArgs) => {
            try {
                if (command === 'list') {
                    logger.info('Listing available templates');

                    const response = await BaseSandboxService.listTemplates();

                    if (!response.success || !response.templates) {
                        return {
                            error: `Failed to fetch templates: ${response.error || 'Unknown error'}`
                        };
                    }

                    const templates = response.templates;

                    // Format template catalog for LLM
                    const formattedOutput = templates.map((template, index) => {
                        const frameworks = template.frameworks?.join(', ') || 'None specified';
                        const selectionDesc = template.description?.selection || 'No description';
                        const usageDesc = template.description?.usage || 'No usage notes';

                        return `
${index + 1}. **${template.name}**
   - Language: ${template.language}
   - Frameworks: ${frameworks}
   - Selection Guide:
${selectionDesc}
   - Usage Notes:
${usageDesc}
`.trim();
                    }).join('\n\n');

                    const summaryText = `# Available Templates (${templates.length} total)
${formattedOutput}`;

                    return { summary: summaryText };
                } else if (command === 'select') {
                    if (!templateName) {
                        return {
                            error: 'templateName is required when command is "select"'
                        };
                    }

                    logger.info('Selecting template', { templateName });

                    // Validate template exists
                    const templatesResponse = await BaseSandboxService.listTemplates();

                    if (!templatesResponse.success || !templatesResponse.templates) {
                        return {
                            error: `Failed to validate template: ${templatesResponse.error || 'Could not fetch template list'}`
                        };
                    }

                    const templateExists = templatesResponse.templates.some(t => t.name === templateName);
                    if (!templateExists) {
                        const availableNames = templatesResponse.templates.map(t => t.name).join(', ');
                        return {
                            error: `Template "${templateName}" not found. Available templates: ${availableNames}`
                        };
                    }

                    // Import template into the agent's virtual filesystem
                    // This returns important template files
                    const result = await agent.importTemplate(templateName, `Selected template: ${templateName}`);

                    return {
                        message: `Template "${templateName}" selected and imported successfully. ${result.files.length} important files available. You can now use deploy_preview to create the sandbox.`,
                        templateName: result.templateName,
                        files: result.files
                    };
                } else {
                    return {
                        error: `Invalid command: ${command}. Must be "list" or "select"`
                    };
                }
            } catch (error) {
                logger.error('Error in template_manager', error);
                return {
                    error: `Error managing templates: ${error instanceof Error ? error.message : 'Unknown error'}`
                };
            }
        },
    };
}
