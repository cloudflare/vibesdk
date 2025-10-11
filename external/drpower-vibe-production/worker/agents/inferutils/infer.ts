import { infer, InferError, InferResponseString, InferResponseObject } from './core';
import { createAssistantMessage, createUserMessage, Message } from './common';
import z from 'zod';
// import { CodeEnhancementOutput, CodeEnhancementOutputType } from '../codegen/phasewiseGenerator';
import { SchemaFormat } from './schemaFormatters';
import { ReasoningEffort } from 'openai/resources.mjs';
import { AgentActionKey, AIModels, InferenceContext, ModelConfig } from './config.types';
import { AGENT_CONFIG } from './config';
import { createLogger } from '../../logger';
import { RateLimitExceededError, SecurityError } from 'shared/types/errors';
import { ToolDefinition } from '../tools/types';

const logger = createLogger('InferenceUtils');

const responseRegenerationPrompts = `
The response you provided was either in an incorrect/unparsable format or was incomplete.
Please provide a valid response that matches the expected output format exactly.
`;

/**
 * Helper function to execute AI inference with consistent error handling
 * @param params Parameters for the inference operation
 * @returns The inference result or null if error
 */

interface InferenceParamsBase {
    env: Env;
    messages: Message[];
    maxTokens?: number;
    temperature?: number;
    modelName?: AIModels | string;
    retryLimit?: number;
    agentActionName: AgentActionKey;
    tools?: ToolDefinition<any, any>[];
    stream?: {
        chunk_size: number;
        onChunk: (chunk: string) => void;
    };
    reasoning_effort?: ReasoningEffort;
    modelConfig?: ModelConfig;
    context: InferenceContext;
}

interface InferenceParamsStructured<T extends z.AnyZodObject> extends InferenceParamsBase {
    schema: T;
    format?: SchemaFormat;
}

export async function executeInference<T extends z.AnyZodObject>(
    params: InferenceParamsStructured<T>
): Promise<InferResponseObject<T>>;

export async function executeInference(
    params: InferenceParamsBase
): Promise<InferResponseString>;
    

export async function executeInference<T extends z.AnyZodObject>(   {
    env,
    messages,
    temperature,
    maxTokens,
    retryLimit = 5, // Increased retry limit for better reliability
    stream,
    tools,
    reasoning_effort,
    schema,
    agentActionName,
    format,
    modelName,
    modelConfig,
    context
}: InferenceParamsBase &    {
    schema?: T;
    format?: SchemaFormat;
}): Promise<InferResponseString | InferResponseObject<T> | null> {
    let conf: ModelConfig | undefined;
    
    if (modelConfig) {
        // Use explicitly provided model config
        conf = modelConfig;
    } else if (context?.userId && context?.userModelConfigs) {
        // Try to get user-specific configuration from context cache
        conf = context.userModelConfigs[agentActionName];
        if (conf) {
            logger.info(`Using user configuration for ${agentActionName}: ${JSON.stringify(conf)}`);
        } else {
            logger.info(`No user configuration for ${agentActionName}, using AGENT_CONFIG defaults`);
        }
    }

    // Use the final config or fall back to AGENT_CONFIG defaults
    const finalConf = conf || AGENT_CONFIG[agentActionName];

    modelName = modelName || finalConf.name;
    temperature = temperature || finalConf.temperature || 0.2;
    maxTokens = maxTokens || finalConf.max_tokens || 16000;
    reasoning_effort = reasoning_effort || finalConf.reasoning_effort;

    // Exponential backoff for retries
    const backoffMs = (attempt: number) => Math.min(500 * Math.pow(2, attempt), 10000);

    let useCheaperModel = false;

    for (let attempt = 0; attempt < retryLimit; attempt++) {
        try {
            logger.info(`Starting ${agentActionName} operation with model ${modelName} (attempt ${attempt + 1}/${retryLimit})`);

            const result = schema ? await infer<T>({
                env,
                metadata: context,
                messages,
                schema,
                schemaName: agentActionName,
                actionKey: agentActionName,
                format,
                maxTokens,
                modelName: useCheaperModel ? AIModels.GEMINI_2_5_FLASH : modelName,
                formatOptions: {
                    debug: false,
                },
                tools,
                stream,
                reasoning_effort: useCheaperModel ? undefined : reasoning_effort,
                temperature,
            }) : await infer({
                env,
                metadata: context,
                messages,
                maxTokens,
                modelName: useCheaperModel ? AIModels.GEMINI_2_5_FLASH: modelName,
                tools,
                stream,
                actionKey: agentActionName,
                reasoning_effort: useCheaperModel ? undefined : reasoning_effort,
                temperature,
            });
            logger.info(`Successfully completed ${agentActionName} operation`);
            // console.log(result);
            return result;
        } catch (error) {
            if (error instanceof RateLimitExceededError || error instanceof SecurityError) {
                throw error;
            }
            const isLastAttempt = attempt === retryLimit - 1;
            logger.error(
                `Error during ${agentActionName} operation (attempt ${attempt + 1}/${retryLimit}):`,
                error
            );

            if (error instanceof InferError) {
                // If its an infer error, we can append the partial response to the list of messages and ask a cheaper model to retry the generation
                if (error.partialResponse && error.partialResponse.length > 1000) {
                    messages.push(createAssistantMessage(error.partialResponse));
                    messages.push(createUserMessage(responseRegenerationPrompts));
                    useCheaperModel = true;
                }
            } else {
                // Try using fallback model if available
                modelName = conf?.fallbackModel || modelName;
            }

            if (!isLastAttempt) {
                // Wait with exponential backoff before retrying
                const delay = backoffMs(attempt);
                logger.info(`Retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
    return null;
}

/**
 * Creates a file enhancement request message
 * @param filePath Path to the file being enhanced
 * @param fileContents Contents of the file to enhance
 * @returns A message for the AI model to enhance the file
 */
export function createFileEnhancementRequestMessage(filePath: string, fileContents: string): Message {
    const fileExtension = filePath.split('.').pop() || '';
    const codeBlock = fileExtension ?
        `\`\`\`${fileExtension}\n${fileContents}\n\`\`\`` :
        `\`\`\`\n${fileContents}\n\`\`\``;

    return createUserMessage(`
<FILE_ENHANCEMENT_REQUEST>
Please review the following file and identify any potential issues:
- Syntax errors
- Missing variable declarations
- Incorrect imports
- Incorrect usage of libraries or APIs
- Unicode or special characters that shouldn't be there
- Inconsistent indentation or formatting
- Logic errors
- Any other issues that could cause runtime errors

If you find any issues:
1. Fix them directly in the code
2. Return the full enhanced code with all issues fixed
3. Provide a list of issues that were fixed with clear descriptions

If no issues are found, simply indicate this without modifying the code.

File Path: ${filePath}

${codeBlock}
</FILE_ENHANCEMENT_REQUEST>
`);
}

/**
 * Creates a response message about a generated file
 */
export function createFileGenerationResponseMessage(filePath: string, fileContents: string, explanation: string, nextFile?: { path: string, purpose: string }): Message {
    // Format the message in a focused way to reduce token usage
    const fileExtension = filePath.split('.').pop() || '';
    const codeBlock = fileExtension ?
        `\`\`\`${fileExtension}\n${fileContents}\n\`\`\`` :
        `\`\`\`\n${fileContents}\n\`\`\``;

    return {
        role: 'assistant',
        content: `
<GENERATED FILE: "${filePath}">
${codeBlock}

Explanation: ${explanation}
Next file to generate: ${nextFile ? `Path: ${nextFile.path} | Purpose: (${nextFile.purpose})` : "None"}
`};
}
