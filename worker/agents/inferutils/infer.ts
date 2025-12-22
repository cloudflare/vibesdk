import { infer, InferError, InferResponseString, InferResponseObject, AbortError, CompletionConfig } from './core';
import { createAssistantMessage, createUserMessage, Message } from './common';
import z from 'zod';
// import { CodeEnhancementOutput, CodeEnhancementOutputType } from '../codegen/phasewiseGenerator';
import { SchemaFormat } from './schemaFormatters';
import type { ReasoningEffort } from './config.types';
import { AgentActionKey, AIModels, InferenceContext, ModelConfig } from './config.types';
import { AGENT_CONFIG } from './config';
import { createLogger } from '../../logger';
import { RateLimitExceededError, SecurityError } from 'shared/types/errors';
import { ToolDefinition } from '../tools/types';
import { validateAgentConstraints } from 'worker/api/controllers/modelConfig/constraintHelper';
import { isValidAIModel } from './config.types';

const logger = createLogger('InferenceUtils');

const responseRegenerationPrompts = `
The response you provided was either in an incorrect/unparsable format or was incomplete.
Please provide a valid response that matches the expected output format exactly.
`;

/**
 * Resolves model configuration with field-by-field merge
 *
 * Precedence: userConfig > AGENT_CONFIG defaults
 * Each field is resolved independently (first defined value wins)
 */
function resolveModelConfig(
    agentActionName: AgentActionKey,
    userConfig?: ModelConfig,
): ModelConfig {
    const defaultConfig = AGENT_CONFIG[agentActionName];

    const merged: ModelConfig = {
        name: userConfig?.name ?? defaultConfig.name,
        reasoning_effort: userConfig?.reasoning_effort ?? defaultConfig.reasoning_effort,
        max_tokens: userConfig?.max_tokens ?? defaultConfig.max_tokens,
        temperature: userConfig?.temperature ?? defaultConfig.temperature,
        fallbackModel: userConfig?.fallbackModel ?? defaultConfig.fallbackModel,
    };

    // Validate model name - try userConfig first, then default
    const modelCandidates = [userConfig?.name, defaultConfig.name]
        .filter((n): n is AIModels | string => n !== undefined);

    let validModelName: AIModels | string | undefined;
    for (const candidate of modelCandidates) {
        if (!isValidAIModel(candidate)) {
            logger.warn(`Model ${candidate} not valid, trying next`);
            continue;
        }
        const check = validateAgentConstraints(agentActionName, candidate);
        if (check.constraintEnabled && !check.valid) {
            logger.warn(`Model ${candidate} violates constraints for ${agentActionName}`);
            continue;
        }
        validModelName = candidate;
        break;
    }

    if (!validModelName) {
        logger.warn(`No valid model found for ${agentActionName}, using default`);
        validModelName = defaultConfig.name;
    }
    merged.name = validModelName;

    // Validate fallback model
    if (merged.fallbackModel) {
        const fallbackCheck = validateAgentConstraints(agentActionName, merged.fallbackModel);
        if (fallbackCheck.constraintEnabled && !fallbackCheck.valid) {
            logger.warn(`Fallback ${merged.fallbackModel} violates constraints, using default`);
            merged.fallbackModel = defaultConfig.fallbackModel;
        }
    }

    logger.info(`Resolved config for ${agentActionName}: model=${merged.name}, fallback=${merged.fallbackModel}`);
    return merged;
}

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
    context: InferenceContext;
    onAssistantMessage?: (message: Message) => Promise<void>;
    completionConfig?: CompletionConfig;
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
    retryLimit = 5,
    stream,
    tools,
    reasoning_effort,
    schema,
    agentActionName,
    format,
    modelName,
    context,
    onAssistantMessage,
    completionConfig,
}: InferenceParamsBase &    {
    schema?: T;
    format?: SchemaFormat;
}): Promise<InferResponseString | InferResponseObject<T> | null> {
    // Resolve config with clear precedence: userConfig > defaults
    const resolvedConfig = resolveModelConfig(
        agentActionName,
        context?.userModelConfigs?.[agentActionName],
    );

    modelName = modelName || resolvedConfig.name;
    temperature = temperature ?? resolvedConfig.temperature ?? 0.2;
    maxTokens = maxTokens || resolvedConfig.max_tokens || 16000;
    reasoning_effort = reasoning_effort || resolvedConfig.reasoning_effort;

    // Exponential backoff for retries
    const backoffMs = (attempt: number) => Math.min(500 * Math.pow(2, attempt), 10000);

    let useCheaperModel = false;

    for (let attempt = 0; attempt < retryLimit; attempt++) {
        try {
            logger.info(`Starting ${agentActionName} operation with model ${modelName} (attempt ${attempt + 1}/${retryLimit})`);

            const result = schema ? await infer<T>({
                env,
                metadata: context.metadata,
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
                abortSignal: context.abortSignal,
                onAssistantMessage,
                completionConfig,
                runtimeOverrides: context.runtimeOverrides,
            }) : await infer({
                env,
                metadata: context.metadata,
                messages,
                maxTokens,
                modelName: useCheaperModel ? AIModels.GEMINI_2_5_FLASH: modelName,
                tools,
                stream,
                actionKey: agentActionName,
                reasoning_effort: useCheaperModel ? undefined : reasoning_effort,
                temperature,
                abortSignal: context.abortSignal,
                onAssistantMessage,
                completionConfig,
                runtimeOverrides: context.runtimeOverrides,
            });
            logger.info(`Successfully completed ${agentActionName} operation`);
            // console.log(result);
            return result;
        } catch (error) {
            if (error instanceof RateLimitExceededError || error instanceof SecurityError) {
                throw error;
            }
            
            // Check if cancellation - don't retry, propagate immediately
            if (error instanceof InferError && error.message.includes('cancelled')) {
                logger.info(`${agentActionName} operation cancelled by user, not retrying`);
                throw error;
            }
            
            const isLastAttempt = attempt === retryLimit - 1;
            logger.error(
                `Error during ${agentActionName} operation (attempt ${attempt + 1}/${retryLimit}):`,
                error
            );

            if (error instanceof InferError && !(error instanceof AbortError)) {
                // If its an infer error and not an abort error, we can append the partial response to the list of messages and ask a cheaper model to retry the generation
                if (error.response && error.response.length > 1000) {
                    messages.push(createAssistantMessage(error.response));
                    messages.push(createUserMessage(responseRegenerationPrompts));
                    useCheaperModel = true;
                }
            } else {
                // Switch to fallback model if available
                if (resolvedConfig.fallbackModel && resolvedConfig.fallbackModel !== modelName) {
                    logger.info(`Switching to fallback model: ${resolvedConfig.fallbackModel}`);
                    modelName = resolvedConfig.fallbackModel;
                }
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
