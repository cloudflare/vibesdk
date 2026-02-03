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
import { CompletionSignal, Message, MessageContent, MessageRole } from './common';
import { ToolCallResult, ToolDefinition, toOpenAITool } from '../tools/types';
import { AgentActionKey, AI_MODEL_CONFIG, AIModelConfig, AIModels, InferenceMetadata, type InferenceRuntimeOverrides } from './config.types';
import { RateLimitService } from '../../services/rate-limit/rateLimits';
import { getUserConfigurableSettings } from '../../config';
import { SecurityError, RateLimitExceededError } from 'shared/types/errors';
import { RateLimitType } from 'worker/services/rate-limit/config';
import { getMaxToolCallingDepth, MAX_LLM_MESSAGES } from '../constants';
import { executeToolCallsWithDependencies } from './toolExecution';
import { CompletionDetector } from './completionDetection';

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

        // Check if we already have complete JSON and this is extra data. Question: Do we want this?
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

function buildGatewayPathname(cleanPathname: string, providerOverride?: AIGatewayProviders): string {
    return providerOverride ? `${cleanPathname}/${providerOverride}` : `${cleanPathname}/compat`;
}

function constructGatewayUrl(url: URL, providerOverride?: AIGatewayProviders): string {
    const cleanPathname = url.pathname.replace(/\/$/, '');
    url.pathname = buildGatewayPathname(cleanPathname, providerOverride);
    return url.toString();
}

export async function buildGatewayUrl(
	env: Env,
	providerOverride?: AIGatewayProviders,
	gatewayOverride?: { baseUrl: string; token: string },
): Promise<string> {
    // Runtime override (SDK): explicit AI Gateway base URL
    if (gatewayOverride?.baseUrl) {
        const url = new URL(gatewayOverride.baseUrl);
        return constructGatewayUrl(url, providerOverride);
    }

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
                url.pathname = buildGatewayPathname(cleanPathname, providerOverride);
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

async function getApiKey(
	provider: string,
	env: Env,
	_userId: string,
	runtimeOverrides?: InferenceRuntimeOverrides,
): Promise<string> {
    console.log("Getting API key for provider: ", provider);

    const runtimeKey = runtimeOverrides?.userApiKeys?.[provider];
    if (runtimeKey && isValidApiKey(runtimeKey)) {
        return runtimeKey;
    }
    // Fallback to environment variables
    const providerKeyString = provider.toUpperCase().replaceAll('-', '_');
    const envKey = `${providerKeyString}_API_KEY` as keyof Env;
    let apiKey: string = env[envKey] as string;
    
    // Check if apiKey is empty or undefined and is valid
    if (!isValidApiKey(apiKey)) {
        // only use platform token if NOT using a custom gateway URL
        // User's gateway = user's credentials only
        if (runtimeOverrides?.aiGatewayOverride?.baseUrl) {
            // User provided custom gateway
            apiKey = runtimeOverrides.aiGatewayOverride.token ?? '';
        } else {
            apiKey = runtimeOverrides?.aiGatewayOverride?.token ?? env.CLOUDFLARE_AI_GATEWAY_TOKEN;
        }
    }
    return apiKey;
}

export async function getConfigurationForModel(
    modelConfig: AIModelConfig,
    env: Env, 
    userId: string,
    runtimeOverrides?: InferenceRuntimeOverrides,
): Promise<{
    baseURL: string,
    apiKey: string,
    defaultHeaders?: Record<string, string>,
}> {
    let providerForcedOverride: AIGatewayProviders | undefined;
    if (modelConfig.directOverride) {
        switch(modelConfig.provider) {
            case 'openrouter':
                return {
                    baseURL: 'https://openrouter.ai/api/v1',
                    apiKey: env.OPENROUTER_API_KEY,
                };
            case 'google-ai-studio':
                return {
                    baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
                    apiKey: env.GOOGLE_AI_STUDIO_API_KEY,
                };
            case 'anthropic':
                return {
                    baseURL: 'https://api.anthropic.com/v1/',
                    apiKey: env.ANTHROPIC_API_KEY,
                };
            default:
                providerForcedOverride = modelConfig.provider as AIGatewayProviders;
                break;
        }
    }

    const gatewayOverride = runtimeOverrides?.aiGatewayOverride;
    const isUsingCustomGateway = !!gatewayOverride?.baseUrl;
    const baseURL = await buildGatewayUrl(env, providerForcedOverride, gatewayOverride);

    const gatewayToken = isUsingCustomGateway
        ? gatewayOverride?.token
        : (gatewayOverride?.token ?? env.CLOUDFLARE_AI_GATEWAY_TOKEN);  // Platform gateway

    // Try to find API key of type <PROVIDER>_API_KEY else default to gateway token
    const apiKey = await getApiKey(modelConfig.provider, env, userId, runtimeOverrides);

    // AI Gateway wholesaling: when using BYOK provider key + platform gateway token
    const defaultHeaders = gatewayToken && apiKey !== gatewayToken ? {
        'cf-aig-authorization': `Bearer ${gatewayToken}`,
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
    frequency_penalty?: number;
    stream?: {
        chunk_size: number;
        onChunk: (chunk: string) => void;
    };
    tools?: ToolDefinition<any, any>[];
    providerOverride?: 'cloudflare' | 'direct';
    runtimeOverrides?: InferenceRuntimeOverrides;
    abortSignal?: AbortSignal;
    onAssistantMessage?: (message: Message) => Promise<void>;
    completionConfig?: CompletionConfig;
};

type InferArgsStructured = InferArgsBase & {
    schema: z.AnyZodObject;
    schemaName: string;
};

type InferWithCustomFormatArgs = InferArgsStructured & {
    format?: SchemaFormat;
    formatOptions?: FormatterOptions;
};

export interface ToolCallContext {
    messages: Message[];
    depth: number;
    completionSignal?: CompletionSignal;
    warningInjected?: boolean;
}

/**
 * Configuration for completion signal detection and auto-warning injection.
 */
export interface CompletionConfig {
    detector?: CompletionDetector;
    operationalMode?: 'initial' | 'followup';
    allowWarningInjection?: boolean;
}

export function serializeCallChain(context: ToolCallContext, finalResponse: string): string {
    // Build a transcript of the tool call messages, and append the final response
    let transcript = '**Request terminated by user, partial response transcript (last 5 messages):**\n\n<call_chain_transcript>';
    for (const message of context.messages.slice(-5)) {
        let content = message.content;
        
        // Truncate tool messages to 100 chars
        if (message.role === 'tool' || message.role === 'function') {
            content = (content || '').slice(0, 100);
        }
        
        transcript += `<message role="${message.role}">${content}</message>`;
    }
    transcript += `<final_response>${finalResponse || '**cancelled**'}</final_response>`;
    transcript += '</call_chain_transcript>';
    return transcript;
}

export class InferError extends Error {
    constructor(
        message: string,
        public response: string,
        public toolCallContext?: ToolCallContext
    ) {
        super(message);
        this.name = 'InferError';
    }

    partialResponseTranscript(): string {
        if (!this.toolCallContext) {
            return this.response;
        }
        return serializeCallChain(this.toolCallContext, this.response);
    }

    partialResponse(): InferResponseString {
        return {
            string: this.response,
            toolCallContext: this.toolCallContext
        };
    }
}

export class AbortError extends InferError {
    constructor(response: string, toolCallContext?: ToolCallContext) {
        super(response, response, toolCallContext);
        this.name = 'AbortError';
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
    // Use dependency-aware execution engine
    return executeToolCallsWithDependencies(openAiToolCalls, originalDefinitions);
}

function updateToolCallContext(
    toolCallContext: ToolCallContext | undefined,
    assistantMessage: Message,
    executedToolCalls: ToolCallResult[],
    completionDetector?: CompletionDetector
) {
    const newMessages = [
        ...(toolCallContext?.messages || []),
        assistantMessage,
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

    // Detect completion signal from executed tool calls
    let completionSignal = toolCallContext?.completionSignal;
    if (completionDetector && !completionSignal) {
        completionSignal = completionDetector.detectCompletion(executedToolCalls);
    }

    const newToolCallContext: ToolCallContext = {
        messages: newMessages,
        depth: newDepth,
        completionSignal,
        warningInjected: toolCallContext?.warningInjected || false
    };
    return newToolCallContext;
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
    modelName,
    reasoning_effort,
    temperature,
    frequency_penalty,
    maxTokens,
    stream,
    tools,
    runtimeOverrides,
    abortSignal,
    onAssistantMessage,
    completionConfig,
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
    if (currentDepth >= getMaxToolCallingDepth(actionKey)) {
        console.warn(`Tool calling depth limit reached (${currentDepth}/${getMaxToolCallingDepth(actionKey)}). Stopping recursion.`);
        // Return a response indicating max depth reached
        if (schema) {
            throw new AbortError(`Maximum tool calling depth (${getMaxToolCallingDepth(actionKey)}) exceeded. Tools may be calling each other recursively.`, toolCallContext);
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
        const modelConfig = AI_MODEL_CONFIG[modelName as AIModels];

        const { apiKey, baseURL, defaultHeaders } = await getConfigurationForModel(
            modelConfig,
            env,
            metadata.userId,
            runtimeOverrides,
        );
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
            const ctxMessages = toolCallContext.messages;
            let validToolCallIds = new Set<string>();

            let filtered = ctxMessages.filter(msg => {
                // Update valid IDs when we see assistant with tool_calls
                if (msg.role === 'assistant' && msg.tool_calls) {
                    validToolCallIds = new Set(msg.tool_calls.map(tc => tc.id));
                    return true;
                }

                // Filter tool messages
                if (msg.role === 'tool') {
                    if (!msg.name?.trim()) {
                        console.warn('[TOOL_ORPHAN] Dropping tool message with empty name:', msg.tool_call_id);
                        return false;
                    }
                    if (!msg.tool_call_id || !validToolCallIds.has(msg.tool_call_id)) {
                        console.warn('[TOOL_ORPHAN] Dropping orphaned tool message:', msg.name, msg.tool_call_id);
                        return false;
                    }
                }

                return true;
            });

            // Remove empty tool call arrays from assistant messages
            filtered = filtered.map(msg => {
                if (msg.role === 'assistant' && msg.tool_calls) {
                    msg.tool_calls = msg.tool_calls.filter(tc => tc.id);
                    if (msg.tool_calls.length === 0) {
                        msg.tool_calls = undefined;
                    }
                }
                return msg;
            });

            messagesToPass.push(...filtered);
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

        console.log(`Running inference with ${modelName} using structured output with ${format} format, reasoning effort: ${reasoning_effort}, max tokens: ${maxTokens}, temperature: ${temperature}, frequency_penalty: ${frequency_penalty}, baseURL: ${baseURL}`);

        const toolsOpts = tools ? {
            tools: tools.map(t => {
                return toOpenAITool(t);
            }),
            tool_choice: 'auto' as const
        } : {};
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
                reasoning_effort: modelConfig.nonReasoning ? undefined : reasoning_effort,
                temperature,
                frequency_penalty,
            }, {
                signal: abortSignal,
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
            // Check if error is due to abort
            if (error instanceof Error && (error.name === 'AbortError' || error.message?.includes('aborted') || error.message?.includes('abort'))) {
                console.log('Inference cancelled by user');
                throw new AbortError('**User cancelled inference**', toolCallContext);
            }
            
            console.error(`Failed to get inference response from OpenAI: ${error}`);
            // if ((error instanceof Error && error.message.includes('429')) || (typeof error === 'string' && error.includes('429'))) {

            //     throw new RateLimitExceededError('Rate limit exceeded in LLM calls, Please try again later', RateLimitType.LLM_CALLS);
            // }
            throw error;
        }
        let toolCalls: ChatCompletionMessageFunctionToolCall[] = [];

        /*
        * Handle LLM response
        */

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

        const assistantMessage = { role: "assistant" as MessageRole, content, tool_calls: toolCalls };

        if (onAssistantMessage) {
            await onAssistantMessage(assistantMessage);
        }

        /*
        * Handle tool calls
        */

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
            try {
                executedToolCalls = await executeToolCalls(toolCalls, tools);
            } catch (error) {
                console.error(`Tool execution failed${toolCalls.length > 0 ? ` for ${toolCalls[0].function.name}` : ''}:`, error);
                // Check if error is an abort error
                if (error instanceof AbortError) {
                    console.warn(`Tool call was aborted, ending tool call chain with the latest tool call result`);

                    const newToolCallContext = updateToolCallContext(toolCallContext, assistantMessage, executedToolCalls, completionConfig?.detector);
                    return { string: content, toolCallContext: newToolCallContext };
                }
                // Otherwise, continue
            }
        }

        /*
        * Handle tool call results
        */

        if (executedToolCalls.length) {
            console.log(`Tool calls executed:`, JSON.stringify(executedToolCalls, null, 2));

            const newToolCallContext = updateToolCallContext(toolCallContext, assistantMessage, executedToolCalls, completionConfig?.detector);

            // Stop recursion if completion signal detected
            if (newToolCallContext.completionSignal?.signaled) {
                console.log(`[COMPLETION] ${newToolCallContext.completionSignal.toolName} called, stopping recursion`);

                if (schema && schemaName) {
                    throw new AbortError(
                        `Completion signaled: ${newToolCallContext.completionSignal.summary || 'Task complete'}`,
                        newToolCallContext
                    );
                }
                return {
                    string: content || newToolCallContext.completionSignal.summary || 'Task complete',
                    toolCallContext: newToolCallContext
                };
            }

            // Filter completion tools from recursion trigger
            const executedCallsWithResults = executedToolCalls.filter(result =>
                result.result !== undefined &&
                !(completionConfig?.detector?.isCompletionTool(result.name))
            );
            console.log(`${actionKey}: Tool depth ${newToolCallContext.depth}/${getMaxToolCallingDepth(actionKey)}`);
            
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
                        frequency_penalty,
                        abortSignal,
                        onAssistantMessage,
                        completionConfig,
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
                        frequency_penalty,
                        abortSignal,
                        onAssistantMessage,
                        completionConfig,
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
            throw new InferError('Failed to parse response', content, toolCallContext);
        }
    } catch (error) {
        if (error instanceof RateLimitExceededError || error instanceof SecurityError) {
            throw error;
        }
        console.error('Error in inferWithSchemaOutput:', error);
        throw error;
    }
}
