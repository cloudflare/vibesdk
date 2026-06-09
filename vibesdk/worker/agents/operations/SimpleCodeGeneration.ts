import { FileConceptType, FileOutputType } from '../schemas';
import { createUserMessage, createSystemMessage } from '../inferutils/common';
import { executeInference } from '../inferutils/infer';
import { PROMPT_UTILS } from '../prompts';
import { AgentOperation, getSystemPromptWithProjectContext, OperationOptions } from './common';
import { SCOFFormat, SCOFParsingState } from '../output-formats/streaming-formats/scof';
import { CodeGenerationStreamingState } from '../output-formats/streaming-formats/base';
import { FileProcessing } from '../domain/pure/FileProcessing';
import { CodeSerializerType } from '../utils/codeSerializers';
import { GenerationContext } from '../domain/values/GenerationContext';
import { FileState } from '../core/state';

export interface SimpleCodeGenerationInputs {
    phaseName: string;
    phaseDescription: string;
    requirements: string[];
    files: FileConceptType[];
    fileGeneratingCallback?: (filePath: string, filePurpose: string) => void;
    fileChunkGeneratedCallback?: (filePath: string, chunk: string, format: 'full_content' | 'unified_diff') => void;
    fileClosedCallback?: (file: FileOutputType, message: string) => void;
}

export interface SimpleCodeGenerationOutputs {
    files: FileOutputType[];
}

const SYSTEM_PROMPT = `You are an expert Cloudflare developer specializing in Cloudflare Workers and Workflows.

Your task is to generate production-ready code files specifically based on the provided specifications.

{{userQuery}}

## Critical Guidelines
- Write clean, type-safe TypeScript code
- Follow best practices for the specific project type
- Ensure all imports are correct
- Add proper error handling
- Include JSDoc comments where helpful
- Consider the context of existing files when generating new code
- Ensure new code integrates well with previously generated files`;

const USER_PROMPT = `
<PROJECT_CONTEXT>
Project Context:

## Template Information
{{template}}

<RELEVANT_FILES>
{{relevantFiles}}
</RELEVANT_FILES>

<TASK>
Generate code for the following phase:

**Phase Name:** {{phaseName}}
**Description:** {{phaseDescription}}

**Requirements:**
{{requirements}}

**Files to Write/Modify:**
{{files}}

Generate complete, production-ready code for all specified files.
</TASK>
`;

const README_GENERATION_PROMPT = `<TASK>
Generate a comprehensive README.md file for this project based on the provided blueprint and template information.
The README should be professional, well-structured, and provide clear instructions for users and developers.
</TASK>

<INSTRUCTIONS>
- Create a professional README with proper markdown formatting
- Do not add any images or screenshots
- Include project title, description, and key features from the blueprint
- Add technology stack section based on the template dependencies
- Include setup/installation instructions using bun (not npm/yarn)
- Add usage examples and development instructions
- Include a deployment section with Cloudflare-specific instructions
- **IMPORTANT**: Add a \`[cloudflarebutton]\` placeholder near the top and another in the deployment section for the Cloudflare deploy button. Write the **EXACT** string except the backticks and DON'T enclose it in any other button or anything. We will replace it with https://deploy.workers.cloudflare.com/?url=\${repositoryUrl} when the repository is created.
- Structure the content clearly with appropriate headers and sections
- Be concise but comprehensive - focus on essential information
- Use professional tone suitable for open source projects
</INSTRUCTIONS>

Generate the complete README.md content in markdown format. 
Do not provide any additional text or explanation. 
All your output will be directly saved in the README.md file. 
Do not provide and markdown fence \`\`\` \`\`\` around the content either! Just pure raw markdown content!`;

const formatRequirements = (requirements: string[]): string => {
    return requirements.map((req, index) => `${index + 1}. ${req}`).join('\n');
};

const formatFiles = (files: FileConceptType[]): string => {
    return files.map((file, index) => {
        return `${index + 1}. **${file.path}**
   Purpose: ${file.purpose}
   ${file.changes ? `Changes needed: ${file.changes}` : 'Create new file'}`;
    }).join('\n\n');
};

const formatExistingFiles = (allFiles: FileState[]): string => {
    if (!allFiles || allFiles.length === 0) {
        return 'No files generated yet. This is the first generation phase.';
    }
    
    // Convert FileState[] to FileOutputType[] format for serializer
    const filesForSerializer: FileOutputType[] = allFiles.map(file => ({
        filePath: file.filePath,
        fileContents: file.fileContents,
        filePurpose: file.filePurpose || 'Previously generated file'
    }));
    
    return PROMPT_UTILS.serializeFiles(filesForSerializer, CodeSerializerType.SIMPLE);
};

export class SimpleCodeGenerationOperation extends AgentOperation<
    GenerationContext,
    SimpleCodeGenerationInputs,
    SimpleCodeGenerationOutputs
> {
    async execute(
        inputs: SimpleCodeGenerationInputs,
        options: OperationOptions<GenerationContext>
    ): Promise<SimpleCodeGenerationOutputs> {
        const { phaseName, phaseDescription, requirements, files } = inputs;
        const { env, logger, context, inferenceContext } = options;

        logger.info('Generating code via simple code generation', {
            phaseName,
            phaseDescription,
            fileCount: files.length,
            requirementCount: requirements.length,
            existingFilesCount: context.allFiles.length,
            hasUserQuery: !!context.query,
            hasTemplateDetails: !!context.templateDetails
        });

        // Format existing files for context
        const existingFilesContext = formatExistingFiles(context.allFiles);

        // Build system message with full context
        const systemPrompt = PROMPT_UTILS.replaceTemplateVariables(SYSTEM_PROMPT, {
            userQuery: context.query ? `## Requirements:\n${context.query}` : '',
        });

        // Build user message with requirements
        const userPrompt = PROMPT_UTILS.replaceTemplateVariables(USER_PROMPT, {
            phaseName,
            phaseDescription,
            requirements: formatRequirements(requirements),
            files: formatFiles(files),
            template: context.templateDetails ? PROMPT_UTILS.serializeTemplate(context.templateDetails) : 'No template information',
            relevantFiles: existingFilesContext
        });

        const codeGenerationFormat = new SCOFFormat();
        const messages = [
            createSystemMessage(systemPrompt),
            createUserMessage(userPrompt + codeGenerationFormat.formatInstructions())
        ];

        // Initialize streaming state
        const streamingState: CodeGenerationStreamingState = {
            accumulator: '',
            completedFiles: new Map(),
            parsingState: {} as SCOFParsingState
        };

        const generatedFiles: FileOutputType[] = [];

        // Execute inference with streaming
        await executeInference({
            env,
            context: inferenceContext,
            agentActionName: 'fileRegeneration',
            messages,
            stream: {
                chunk_size: 256,
                onChunk: (chunk: string) => {
                    codeGenerationFormat.parseStreamingChunks(
                        chunk,
                        streamingState,
                        // File generation started
                        (filePath: string) => {
                            logger.info(`Starting generation of file: ${filePath}`);
                            if (inputs.fileGeneratingCallback) {
                                const purpose = files.find(f => f.path === filePath)?.purpose || 'Generated file';
                                inputs.fileGeneratingCallback(filePath, purpose);
                            }
                        },
                        // Stream file content chunks
                        (filePath: string, fileChunk: string, format: 'full_content' | 'unified_diff') => {
                            if (inputs.fileChunkGeneratedCallback) {
                                inputs.fileChunkGeneratedCallback(filePath, fileChunk, format);
                            }
                        },
                        // onFileClose callback
                        (filePath: string) => {
                            logger.info(`Completed generation of file: ${filePath}`);
                            const completedFile = streamingState.completedFiles.get(filePath);
                            if (!completedFile) {
                                logger.error(`Completed file not found: ${filePath}`);
                                return;
                            }

                            // Process the file contents
                            const originalContents = context.allFiles.find(f => f.filePath === filePath)?.fileContents || '';
                            completedFile.fileContents = FileProcessing.processGeneratedFileContents(
                                completedFile,
                                originalContents,
                                logger
                            );

                            const generatedFile: FileOutputType = {
                                ...completedFile,
                                filePurpose: files.find(f => f.path === filePath)?.purpose || 'Generated file'
                            };

                            generatedFiles.push(generatedFile);

                            if (inputs.fileClosedCallback) {
                                inputs.fileClosedCallback(generatedFile, `Completed generation of ${filePath}`);
                            }
                        }
                    );
                }
            }
        });

        logger.info('Code generation completed', {
            fileCount: generatedFiles.length
        });

        return {
            files: generatedFiles
        };
    }

    async generateReadme(options: OperationOptions): Promise<FileOutputType> {
        const { env, logger, context } = options;
        logger.info("Generating README.md for the project");

        try {
            const readmePrompt = README_GENERATION_PROMPT;
            const messages = [...getSystemPromptWithProjectContext(SYSTEM_PROMPT, context, CodeSerializerType.SCOF), createUserMessage(readmePrompt)];

            const results = await executeInference({
                env: env,
                messages,
                agentActionName: "projectSetup",
                context: options.inferenceContext,
            });

            if (!results || !results.string) {
                logger.error('Failed to generate README.md content');
                throw new Error('Failed to generate README.md content');
            }

            logger.info('Generated README.md content successfully');

            return {
                filePath: 'README.md',
                fileContents: results.string,
                filePurpose: 'Project documentation and setup instructions'
            };
        } catch (error) {
            logger.error("Error generating README:", error);
            throw error;
        }
    }
}
