import { OpenAI } from 'openai';
import { Stream } from 'openai/streaming';
import { z } from 'zod';
import {
    type SchemaFormat,
    type FormatterOptions,
    generateTemplateForSchema,
    parseContentForSchema,
} from './schemaFormatters';
import { zodResponseFormat } from 'openai/helpers/zod.mjs';
import {
    ChatCompletionMessageFunctionToolCall,
    type ReasoningEffort,
    type ChatCompletionChunk,
} from 'openai/resources.mjs';
import { Message, MessageContent, MessageRole } from './common';
import { ToolCallResult, ToolDefinition } from '../tools/types';
import { AgentActionKey, AIModels, InferenceMetadata } from './config.types';
// import { SecretsService } from '../../database';
import { RateLimitService } from '../../services/rate-limit/rateLimits';
import { getUserConfigurableSettings } from '../../config';
import { SecurityError, RateLimitExceededError } from 'shared/types/errors';
import { executeToolWithDefinition } from '../tools/customTools';
import { RateLimitType } from 'worker/services/rate-limit/config';
import { MAX_LLM_MESSAGES, MAX_TOOL_CALLING_DEPTH } from '../constants';

function optimizeInputs(messages: Message[]): Message[] {
    return messages.map((message) => ({
        ...message,
        content: optimizeMessageContent(message.content),
    }));
}

// Streaming tool-call accumulation helpers 
type ToolCallsArray = NonNullable<NonNullable<ChatCompletionChunk['choices'][number]['delta']>['tool_calls']>;
type ToolCallDelta = ToolCallsArray[number];
type ToolAccumulatorEntry = ChatCompletionMessageFunctionToolCall & { index?: number; __order: number };

function synthIdForIndex(i: number): string {
    return `tool_${Date.now()}_${i}_${Math.random().toString(36).slice(2)}`;
}

function accumulateToolCallDelta(
    byIndex: Map<number, ToolAccumulatorEntry>,
    byId: Map<string, ToolAccumulatorEntry>,
    deltaToolCall: ToolCallDelta,
    orderCounterRef: { value: number }
): void {
    const idx = deltaToolCall.index;
    const idFromDelta = deltaToolCall.id;

    let entry: ToolAccumulatorEntry | undefined;

    // Look up existing entry by id or index
    if (idFromDelta && byId.has(idFromDelta)) {
        entry = byId.get(idFromDelta)!;
        console.log(`[TOOL_CALL_DEBUG] Found existing entry by id: ${idFromDelta}`);
    } else if (idx !== undefined && byIndex.has(idx)) {
        entry = byIndex.get(idx)!;
        console.log(`[TOOL_CALL_DEBUG] Found existing entry by index: ${idx}`);
    } else {
        console.log(`[TOOL_CALL_DEBUG] Creating new entry - id: ${idFromDelta}, index: ${idx}`);
        // Create new entry
        const provisionalId = idFromDelta || synthIdForIndex(idx ?? byId.size);
        entry = {
            id: provisionalId,
            type: 'function',
            function: {
                name: '',
                arguments: '',
            },
            __order: orderCounterRef.value++,
            ...(idx !== undefined ? { index: idx } : {}),
        };
        if (idx !== undefined) byIndex.set(idx, entry);
        byId.set(provisionalId, entry);
    }

    // Update id if provided and different
    if (idFromDelta && entry.id !== idFromDelta) {
        byId.delete(entry.id);
        entry.id = idFromDelta;
        byId.set(entry.id, entry);
    }

    // Register index if provided and not yet registered
    if (idx !== undefined && entry.index === undefined) {
        entry.index = idx;
        byIndex.set(idx, entry);
    }

    // Update function name - replace if provided
    if (deltaToolCall.function?.name) {
        entry.function.name = deltaToolCall.function.name;
    }

    // Append arguments - accumulate string chunks
    if (deltaToolCall.function?.arguments !== undefined) {
        const before = entry.function.arguments;
        const chunk = deltaToolCall.function.arguments;

        // Check if we already have complete JSON and this is extra data
        let isComplete = false;
        if (before.length > 0) {
            try {
                JSON.parse(before);
                isComplete = true;
                console.warn(`[TOOL_CALL_WARNING] Already have complete JSON, ignoring additional chunk for ${entry.function.name}:`, {
                    existing_json: before,
                    ignored_chunk: chunk
                });
            } catch {
                // Not complete yet, continue accumulating
            }
        }

        if (!isComplete) {
            entry.function.arguments += chunk;

            // Debug logging for tool call argument accumulation
            console.log(`[TOOL_CALL_DEBUG] Accumulating arguments for ${entry.function.name || 'unknown'}:`, {
                id: entry.id,
                index: entry.index,
                before_length: before.length,
                chunk_length: chunk.length,
                chunk_content: chunk,
                after_length: entry.function.arguments.length,
                after_content: entry.function.arguments
            });
        }
    }
}

function assembleToolCalls(
    byIndex: Map<number, ToolAccumulatorEntry>,
    byId: Map<string, ToolAccumulatorEntry>
): ChatCompletionMessageFunctionToolCall[] {
    if (byIndex.size > 0) {
        return Array.from(byIndex.values())
            .sort((a, b) => (a.index! - b.index!))
            .map((e) => ({ id: e.id, type: 'function' as const, function: { name: e.function.name, arguments: e.function.arguments } }));
    }
    return Array.from(byId.values())
        .sort((a, b) => a.__order - b.__order)
        .map((e) => ({ id: e.id, type: 'function' as const, function: { name: e.function.name, arguments: e.function.arguments } }));
}

function optimizeMessageContent(content: MessageContent): MessageContent {
    if (!content) return content;
    // If content is an array (TextContent | ImageContent), only optimize text content
    if (Array.isArray(content)) {
        return content.map((item) =>
            item.type === 'text'
                ? { ...item, text: optimizeTextContent(item.text) }
                : item,
        );
    }

    // If content is a string, optimize it directly
    return optimizeTextContent(content);
}

function optimizeTextContent(content: string): string {
    // CONSERVATIVE OPTIMIZATION - Only safe changes that preserve readability

    // 1. Remove trailing whitespace from lines (always safe)
    content = content.replace(/[ \t]+$/gm, '');

    // 2. Reduce excessive empty lines (more than 3 consecutive) to 2 max
    // This preserves intentional spacing while removing truly excessive gaps
    content = content.replace(/\n\s*\n\s*\n\s*\n+/g, '\n\n\n');

    // // Convert 4-space indentation to 2-space for non-Python/YAML content
    // content = content.replace(/^( {4})+/gm, (match) =>
    // 	'  '.repeat(match.length / 4),
    // );

    // // Convert 8-space indentation to 2-space
    // content = content.replace(/^( {8})+/gm, (match) =>
    // 	'  '.repeat(match.length / 8),
    // );
    // 4. Remove leading/trailing whitespace from the entire content
    // (but preserve internal structure)
    content = content.trim();

    return content;
}

export async function buildGatewayUrl(env: Env, providerOverride?: AIGatewayProviders): Promise<string> {
    // If CLOUDFLARE_AI_GATEWAY_URL is set and is a valid URL, use it directly
    if (env.CLOUDFLARE_AI_GATEWAY_URL && 
        env.CLOUDFLARE_AI_GATEWAY_URL !== 'none' && 
        env.CLOUDFLARE_AI_GATEWAY_URL.trim() !== '') {
        
        try {
            const url = new URL(env.CLOUDFLARE_AI_GATEWAY_URL);
            // Validate it's actually an HTTP/HTTPS URL
            if (url.protocol === 'http:' || url.protocol === 'https:') {
                // Add 'providerOverride' as a segment to the URL
                const cleanPathname = url.pathname.replace(/\/$/, ''); // Remove trailing slash
                url.pathname = providerOverride ? `${cleanPathname}/${providerOverride}` : `${cleanPathname}/compat`;
                return url.toString();
            }
        } catch (error) {
            // Invalid URL, fall through to use bindings
            console.warn(`Invalid CLOUDFLARE_AI_GATEWAY_URL provided: ${env.CLOUDFLARE_AI_GATEWAY_URL}. Falling back to AI bindings.`);
        }
    }
    
    // Build the url via bindings
    const gateway = env.AI.gateway(env.CLOUDFLARE_AI_GATEWAY);
    const baseUrl = providerOverride ? await gateway.getUrl(providerOverride) : `${await gateway.getUrl()}compat`;
    return baseUrl;
}

function isValidApiKey(apiKey: string): boolean {
    if (!apiKey || apiKey.trim() === '') {
        return false;
    }
    // Check if value is not 'default' or 'none' and is more than 10 characters long
    if (apiKey.trim().toLowerCase() === 'default' || apiKey.trim().toLowerCase() === 'none' || apiKey.trim().length < 10) {
        return false;
    }
    return true;
}

async function getApiKey(provider: string, env: Env, _userId: string): Promise<string> {
    console.log("Getting API key for provider: ", provider);
    // try {
    //     const secretsService = new SecretsService(env);
    //     const userProviderKeys = await secretsService.getUserBYOKKeysMap(userId);
    //     // First check if user has a custom API key for this provider
    //     if (userProviderKeys && provider in userProviderKeys) {
    //         const userKey = userProviderKeys.get(provider);
    //         if (userKey && isValidApiKey(userKey)) {
    //             console.log("Found user API key for provider: ", provider, userKey);
    //             return userKey;
    //         }
    //     }
    // } catch (error) {
    //     console.error("Error getting API key for provider: ", provider, error);
    // }
    // Fallback to environment variables
    const providerKeyString = provider.toUpperCase().replaceAll('-', '_');
    const envKey = `${providerKeyString}_API_KEY` as keyof Env;
    let apiKey: string = env[envKey] as string;
    
    // Check if apiKey is empty or undefined and is valid
    if (!isValidApiKey(apiKey)) {
        apiKey = env.CLOUDFLARE_AI_GATEWAY_TOKEN;
    }
    return apiKey;
}

export async function getConfigurationForModel(
    model: AIModels | string, 
    env: Env, 
    userId: string,
): Promise<{
    baseURL: string,
    apiKey: string,
    defaultHeaders?: Record<string, string>,
}> {
    let providerForcedOverride: AIGatewayProviders | undefined;
    // Check if provider forceful-override is set
    const match = model.match(/\[(.*?)\]/);
    if (match) {
        const provider = match[1];
        if (provider === 'openrouter') {
            return {
                baseURL: 'https://openrouter.ai/api/v1',
                apiKey: env.OPENROUTER_API_KEY,
            };
        } else if (provider === 'gemini') {
            return {
                baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
                apiKey: env.GOOGLE_AI_STUDIO_API_KEY,
            };
        } else if (provider === 'claude') {
            return {
                baseURL: 'https://api.anthropic.com/v1/',
                apiKey: env.ANTHROPIC_API_KEY,
            };
        }
        providerForcedOverride = provider as AIGatewayProviders;
    }

    const baseURL = await buildGatewayUrl(env, providerForcedOverride);

    // Extract the provider name from model name. Model name is of type `provider/model_name`
    const provider = providerForcedOverride || model.split('/')[0];
    // Try to find API key of type <PROVIDER>_API_KEY else default to CLOUDFLARE_AI_GATEWAY_TOKEN
    // `env` is an interface of type `Env`
    const apiKey = await getApiKey(provider, env, userId);
    // AI Gateway Wholesaling checks
    const defaultHeaders = env.CLOUDFLARE_AI_GATEWAY_TOKEN && apiKey !== env.CLOUDFLARE_AI_GATEWAY_TOKEN ? {
        'cf-aig-authorization': `Bearer ${env.CLOUDFLARE_AI_GATEWAY_TOKEN}`,
    } : undefined;
    return {
        baseURL,
        apiKey,
        defaultHeaders
    };
}

type InferArgsBase = {
    env: Env;
    metadata: InferenceMetadata;
    actionKey: AgentActionKey  | 'testModelConfig';
    messages: Message[];
    maxTokens?: number;
    modelName: AIModels | string;
    reasoning_effort?: ReasoningEffort;
    temperature?: number;
    stream?: {
        chunk_size: number;
        onChunk: (chunk: string) => void;
    };
    tools?: ToolDefinition<any, any>[];
    providerOverride?: 'cloudflare' | 'direct';
    userApiKeys?: Record<string, string>;
};

type InferArgsStructured = InferArgsBase & {
    schema: z.AnyZodObject;
    schemaName: string;
};

type InferWithCustomFormatArgs = InferArgsStructured & {
    format?: SchemaFormat;
    formatOptions?: FormatterOptions;
};
export class InferError extends Error {
    constructor(
        message: string,
        public partialResponse?: string,
    ) {
        super(message);
        this.name = 'InferError';
    }
}

const claude_thinking_budget_tokens = {
    medium: 8000,
    high: 16000,
    low: 4000,
    minimal: 1000,
};

export type InferResponseObject<OutputSchema extends z.AnyZodObject> = {
    object: z.infer<OutputSchema>;
    toolCallContext?: ToolCallContext;
};

export type InferResponseString = {
    string: string;
    toolCallContext?: ToolCallContext;
};

/**
 * Execute all tool calls from OpenAI response
 */
async function executeToolCalls(openAiToolCalls: ChatCompletionMessageFunctionToolCall[], originalDefinitions: ToolDefinition[]): Promise<ToolCallResult[]> {
    const toolDefinitions = new Map(originalDefinitions.map(td => [td.function.name, td]));
    return Promise.all(
        openAiToolCalls.map(async (tc) => {
            try {
                const args = tc.function.arguments ? JSON.parse(tc.function.arguments) : {};
                const td = toolDefinitions.get(tc.function.name);
                if (!td) {
                    throw new Error(`Tool ${tc.function.name} not found`);
                }
                const result = await executeToolWithDefinition(td, args);
                console.log(`Tool execution result for ${tc.function.name}:`, result);
                return {
                    id: tc.id,
                    name: tc.function.name,
                    arguments: args,
                    result
                };
            } catch (error) {
                console.error(`Tool execution failed for ${tc.function.name}:`, error);
                return {
                    id: tc.id,
                    name: tc.function.name,
                    arguments: {},
                    result: { error: `Failed to execute ${tc.function.name}: ${error instanceof Error ? error.message : 'Unknown error'}` }
            };
            }
        })
    );
}

export interface ToolCallContext {
    messages: Message[];
    depth: number;
}

export function infer<OutputSchema extends z.AnyZodObject>(
    args: InferArgsStructured,
    toolCallContext?: ToolCallContext,
): Promise<InferResponseObject<OutputSchema>>;

export function infer(args: InferArgsBase, toolCallContext?: ToolCallContext): Promise<InferResponseString>;

export function infer<OutputSchema extends z.AnyZodObject>(
    args: InferWithCustomFormatArgs,
    toolCallContext?: ToolCallContext,
): Promise<InferResponseObject<OutputSchema>>;

/**
 * Perform an inference using OpenAI's structured output with JSON schema
 * This uses the response_format.schema parameter to ensure the model returns
 * a response that matches the provided schema.
 */
export async function infer<OutputSchema extends z.AnyZodObject>({
    env,
    metadata,
    messages,
    schema,
    schemaName,
    actionKey,
    format,
    formatOptions,
    maxTokens,
    modelName,
    stream,
    tools,
    reasoning_effort,
    temperature,
}: InferArgsBase & {
    schema?: OutputSchema;
    schemaName?: string;
    format?: SchemaFormat;
    formatOptions?: FormatterOptions;
}, toolCallContext?: ToolCallContext): Promise<InferResponseObject<OutputSchema> | InferResponseString> {
    if (messages.length > MAX_LLM_MESSAGES) {
        throw new RateLimitExceededError(`Message limit exceeded: ${messages.length} messages (max: ${MAX_LLM_MESSAGES}). Please use context compactification.`, RateLimitType.LLM_CALLS);
    }
    
    // Check tool calling depth to prevent infinite recursion
    const currentDepth = toolCallContext?.depth ?? 0;
    if (currentDepth >= MAX_TOOL_CALLING_DEPTH) {
        console.warn(`Tool calling depth limit reached (${currentDepth}/${MAX_TOOL_CALLING_DEPTH}). Stopping recursion.`);
        // Return a response indicating max depth reached
        if (schema) {
            throw new Error(`Maximum tool calling depth (${MAX_TOOL_CALLING_DEPTH}) exceeded. Tools may be calling each other recursively.`);
        }
        return { 
            string: `[System: Maximum tool calling depth reached.]`,
            toolCallContext 
        };
    }
    
    try {
        const userConfig = await getUserConfigurableSettings(env, metadata.userId)
        // Maybe in the future can expand using config object for other stuff like global model configs?
        await RateLimitService.enforceLLMCallsRateLimit(env, userConfig.security.rateLimit, metadata.userId, modelName)

        const { apiKey, baseURL, defaultHeaders } = await getConfigurationForModel(modelName, env, metadata.userId);
        console.log(`baseUrl: ${baseURL}, modelName: ${modelName}`);

        // Remove [*.] from model name
        modelName = modelName.replace(/\[.*?\]/, '');

        const client = new OpenAI({ apiKey, baseURL: baseURL, defaultHeaders });
        const schemaObj =
            schema && schemaName && !format
                ? { response_format: zodResponseFormat(schema, schemaName) }
                : {};
        const extraBody = modelName.includes('claude')? {
                    extra_body: {
                        thinking: {
                            type: 'enabled',
                            budget_tokens: claude_thinking_budget_tokens[reasoning_effort ?? 'medium'],
                        },
                    },
                }
            : {};

        // Optimize messages to reduce token count
        const optimizedMessages = optimizeInputs(messages);
        console.log(`Token optimization: Original messages size ~${JSON.stringify(messages).length} chars, optimized size ~${JSON.stringify(optimizedMessages).length} chars`);

        let messagesToPass = [...optimizedMessages];
        if (toolCallContext && toolCallContext.messages) {
            // Minimal core fix with logging: exclude prior tool messages that have empty name
            const ctxMessages = toolCallContext.messages;
            const droppedToolMsgs = ctxMessages.filter(m => m.role === 'tool' && (!m.name || m.name.trim() === ''));
            if (droppedToolMsgs.length) {
                console.warn(`[TOOL_CALL_WARNING] Dropping ${droppedToolMsgs.length} prior tool message(s) with empty name to avoid provider error`, droppedToolMsgs);
            }
            const filteredCtx = ctxMessages.filter(m => m.role !== 'tool' || (m.name && m.name.trim() !== ''));
            messagesToPass.push(...filteredCtx);
        }

        if (format) {
            if (!schema || !schemaName) {
                throw new Error('Schema and schemaName are required when using a custom format');
            }
            const formatInstructions = generateTemplateForSchema(
                schema,
                format,
                formatOptions,
            );
            const lastMessage = messagesToPass[messagesToPass.length - 1];

            // Handle multi-modal content properly
            if (typeof lastMessage.content === 'string') {
                // Simple string content - append format instructions
                messagesToPass = [
                    ...messagesToPass.slice(0, -1),
                    {
                        role: lastMessage.role,
                        content: `${lastMessage.content}\n\n${formatInstructions}`,
                    },
                ];
            } else if (Array.isArray(lastMessage.content)) {
                // Multi-modal content - append format instructions to the text part
                const updatedContent = lastMessage.content.map((item) => {
                    if (item.type === 'text') {
                        return {
                            ...item,
                            text: `${item.text}\n\n${formatInstructions}`,
                        };
                    }
                    return item;
                });
                messagesToPass = [
                    ...messagesToPass.slice(0, -1),
                    {
                        role: lastMessage.role,
                        content: updatedContent,
                    },
                ];
            }
        }

        console.log(`Running inference with ${modelName} using structured output with ${format} format, reasoning effort: ${reasoning_effort}, max tokens: ${maxTokens}, temperature: ${temperature}, baseURL: ${baseURL}`);

        const toolsOpts = tools ? { tools, tool_choice: 'auto' as const } : {};
        let response: OpenAI.ChatCompletion | OpenAI.ChatCompletionChunk | Stream<OpenAI.ChatCompletionChunk>;
        try {
            // Call OpenAI API with proper structured output format
            response = await client.chat.completions.create({
                ...schemaObj,
                ...extraBody,
                ...toolsOpts,
                model: modelName,
                messages: messagesToPass as OpenAI.ChatCompletionMessageParam[],
                max_completion_tokens: maxTokens || 150000,
                stream: stream ? true : false,
                reasoning_effort,
                temperature,
            }, {
                headers: {
                    "cf-aig-metadata": JSON.stringify({
                        chatId: metadata.agentId,
                        userId: metadata.userId,
                        schemaName,
                        actionKey,
                    })
                }
            });
            console.log(`Inference response received`);
        } catch (error) {
            console.error(`Failed to get inference response from OpenAI: ${error}`);
            if ((error instanceof Error && error.message.includes('429')) || (typeof error === 'string' && error.includes('429'))) {
                throw new RateLimitExceededError('Rate limit exceeded in LLM calls, Please try again later', RateLimitType.LLM_CALLS);
            }
            throw error;
        }
        let toolCalls: ChatCompletionMessageFunctionToolCall[] = [];

        let content = '';
        if (stream) {
            // If streaming is enabled, handle the stream response
            if (response instanceof Stream) {
                let streamIndex = 0;
                // Accumulators for tool calls: by index (preferred) and by id (fallback when index is missing)
                const byIndex = new Map<number, ToolAccumulatorEntry>();
                const byId = new Map<string, ToolAccumulatorEntry>();
                const orderCounterRef = { value: 0 };
                
                for await (const event of response) {
                    const delta = (event as ChatCompletionChunk).choices[0]?.delta;
                    
                    // Provider-specific logging
                    const provider = modelName.split('/')[0];
                    if (delta?.tool_calls && (provider === 'google-ai-studio' || provider === 'gemini')) {
                        console.log(`[PROVIDER_DEBUG] ${provider} tool_calls delta:`, JSON.stringify(delta.tool_calls, null, 2));
                    }
                    
                    if (delta?.tool_calls) {
                        try {
                            for (const deltaToolCall of delta.tool_calls as ToolCallsArray) {
                                accumulateToolCallDelta(byIndex, byId, deltaToolCall, orderCounterRef);
                            }
                        } catch (error) {
                            console.error('Error processing tool calls in streaming:', error);
                        }
                    }
                    
                    // Process content
                    content += delta?.content || '';
                    const slice = content.slice(streamIndex);
                    const finishReason = (event as ChatCompletionChunk).choices[0]?.finish_reason;
                    if (slice.length >= stream.chunk_size || finishReason != null) {
                        stream.onChunk(slice);
                        streamIndex += slice.length;
                    }
                }
                
                // Assemble toolCalls with preference for index ordering, else first-seen order
                const assembled = assembleToolCalls(byIndex, byId);
                const dropped = assembled.filter(tc => !tc.function.name || tc.function.name.trim() === '');
                if (dropped.length) {
                    console.warn(`[TOOL_CALL_WARNING] Dropping ${dropped.length} streamed tool_call(s) without function name`, dropped);
                }
                toolCalls = assembled.filter(tc => tc.function.name && tc.function.name.trim() !== '');
                
                // Validate accumulated tool calls (do not mutate arguments)
                for (const toolCall of toolCalls) {
                    if (!toolCall.function.name) {
                        console.warn('Tool call missing function name:', toolCall);
                    }
                    if (toolCall.function.arguments) {
                        try {
                            // Validate JSON arguments early for visibility
                            const parsed = JSON.parse(toolCall.function.arguments);
                            console.log(`[TOOL_CALL_VALIDATION] Successfully parsed arguments for ${toolCall.function.name}:`, parsed);
                        } catch (error) {
                            console.error(`[TOOL_CALL_VALIDATION] Invalid JSON in tool call arguments for ${toolCall.function.name}:`, {
                                error: error instanceof Error ? error.message : String(error),
                                arguments_length: toolCall.function.arguments.length,
                                arguments_content: toolCall.function.arguments,
                                arguments_hex: Buffer.from(toolCall.function.arguments).toString('hex')
                            });
                        }
                    }
                }
                // Do not drop tool calls without id; we used a synthetic id and will update if a real id arrives in later deltas
            } else {
                // Handle the case where stream was requested but a non-stream response was received
                console.error('Expected a stream response but received a ChatCompletion object.');
                // Properly extract both content and tool calls from non-stream response
                const completion = response as OpenAI.ChatCompletion;
                const message = completion.choices[0]?.message;
                if (message) {
                    content = message.content || '';
                    toolCalls = (message.tool_calls as ChatCompletionMessageFunctionToolCall[]) || [];
                }
            }
        } else {
            // If not streaming, get the full response content (response is ChatCompletion)
            content = (response as OpenAI.ChatCompletion).choices[0]?.message?.content || '';
            const allToolCalls = ((response as OpenAI.ChatCompletion).choices[0]?.message?.tool_calls as ChatCompletionMessageFunctionToolCall[] || []);
            const droppedNonStream = allToolCalls.filter(tc => !tc.function.name || tc.function.name.trim() === '');
            if (droppedNonStream.length) {
                console.warn(`[TOOL_CALL_WARNING] Dropping ${droppedNonStream.length} non-stream tool_call(s) without function name`, droppedNonStream);
            }
            toolCalls = allToolCalls.filter(tc => tc.function.name && tc.function.name.trim() !== '');
            // Also print the total number of tokens used in the prompt
            const totalTokens = (response as OpenAI.ChatCompletion).usage?.total_tokens;
            console.log(`Total tokens used in prompt: ${totalTokens}`);
        }

        if (!content && !stream && !toolCalls.length) {
            // // Only error if not streaming and no content
            // console.error('No content received from OpenAI', JSON.stringify(response, null, 2));
            // throw new Error('No content received from OpenAI');
            console.warn('No content received from OpenAI', JSON.stringify(response, null, 2));
            return { string: "", toolCallContext };
        }
        let executedToolCalls: ToolCallResult[] = [];
        if (tools) {
            // console.log(`Tool calls:`, JSON.stringify(toolCalls, null, 2), 'definition:', JSON.stringify(tools, null, 2));
            executedToolCalls = await executeToolCalls(toolCalls, tools);
        }

        if (executedToolCalls.length) {
            console.log(`Tool calls executed:`, JSON.stringify(executedToolCalls, null, 2));
            // Generate a new response with the tool calls executed
            const newMessages = [
                ...(toolCallContext?.messages || []),
                { role: "assistant" as MessageRole, content, tool_calls: toolCalls },
                ...executedToolCalls
                    .filter(result => result.name && result.name.trim() !== '')
                    .map((result, _) => ({
                        role: "tool" as MessageRole,
                        content: result.result ? JSON.stringify(result.result) : 'done',
                        name: result.name,
                        tool_call_id: result.id,
                    })),
            ];

            const newDepth = (toolCallContext?.depth ?? 0) + 1;
            const newToolCallContext = {
                messages: newMessages,
                depth: newDepth
            };
            
            const executedCallsWithResults = executedToolCalls.filter(result => result.result);
            console.log(`Tool calling depth: ${newDepth}/${MAX_TOOL_CALLING_DEPTH}`);
            
            if (executedCallsWithResults.length) {
                if (schema && schemaName) {
                    const output = await infer<OutputSchema>({
                        env,
                        metadata,
                        messages,
                        schema,
                        schemaName,
                        format,
                        formatOptions,
                        actionKey,
                        modelName,
                        maxTokens,
                        stream,
                        tools,
                        reasoning_effort,
                        temperature,
                    }, newToolCallContext);
                    return output;
                } else {
                    const output = await infer({
                        env,
                        metadata,
                        messages,
                        modelName,
                        maxTokens,
                        actionKey,
                        stream,
                        tools,
                        reasoning_effort,
                        temperature,
                    }, newToolCallContext);
                    return output;
                }
            } else {
                console.log('No tool calls with results');
                return { string: content, toolCallContext: newToolCallContext };
            }
        }

        if (!schema) {
            return { string: content, toolCallContext };
        }

        try {
            // Parse the response
            const parsedContent = format
                ? parseContentForSchema(content, format, schema, formatOptions)
                : JSON.parse(content);

            // Use Zod's safeParse for proper error handling
            const result = schema.safeParse(parsedContent);

            if (!result.success) {
                console.log('Raw content:', content);
                console.log('Parsed data:', parsedContent);
                console.error('Schema validation errors:', result.error.format());
                throw new Error(`Failed to validate AI response against schema: ${result.error.message}`);
            }

            return { object: result.data, toolCallContext };
        } catch (parseError) {
            console.error('Error parsing response:', parseError);
            throw new InferError('Failed to parse response', content);
        }
    } catch (error) {
        if (error instanceof RateLimitExceededError || error instanceof SecurityError) {
            throw error;
        }
        console.error('Error in inferWithSchemaOutput:', error);
        throw error;
    }
}
