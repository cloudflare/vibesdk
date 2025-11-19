import { StructuredLogger } from "../../logger";
import { GenerationContext } from "../domain/values/GenerationContext";
import { Message } from "../inferutils/common";
import { InferenceContext, AgentActionKey, ModelConfig } from "../inferutils/config.types";
import { createUserMessage, createSystemMessage, createAssistantMessage } from "../inferutils/common";
import { generalSystemPromptBuilder, USER_PROMPT_FORMATTER } from "../prompts";
import { CodeSerializerType } from "../utils/codeSerializers";
import { ICodingAgent } from "../services/interfaces/ICodingAgent";
import { executeInference } from "../inferutils/infer";
import { ToolDefinition } from "../tools/types";
import { LoopDetector } from "../inferutils/loopDetection";
import { wrapToolsWithLoopDetection } from "../assistants/utils";
import { CompletionConfig, InferResponseString } from "../inferutils/core";
import { CompletionDetector } from "../inferutils/completionDetection";
import { RenderToolCall } from "./UserConversationProcessor";

export function getSystemPromptWithProjectContext(
    systemPrompt: string,
    context: GenerationContext,
    serializerType: CodeSerializerType = CodeSerializerType.SIMPLE
): Message[] {
    const { query, blueprint, templateDetails, dependencies, allFiles, commandsHistory } = context;

    const messages = [
        createSystemMessage(generalSystemPromptBuilder(systemPrompt, {
            query,
            blueprint,
            templateDetails,
            dependencies,
        })), 
        createUserMessage(
            USER_PROMPT_FORMATTER.PROJECT_CONTEXT(
                GenerationContext.getCompletedPhases(context),
                allFiles, 
                GenerationContext.getFileTree(context),
                commandsHistory,
                serializerType  
            )
        ),
        createAssistantMessage(`I have thoroughly gone through the whole codebase and understood the current implementation and project requirements. We can continue.`)
    ];
    return messages;
}

/**
 * Operation options with context type constraint
 * @template TContext - Context type (defaults to GenerationContext for universal operations)
 */
export interface OperationOptions<TContext extends GenerationContext = GenerationContext> {
    env: Env;
    agentId: string;
    context: TContext;
    logger: StructuredLogger;
    inferenceContext: InferenceContext;
    agent: ICodingAgent;
}

/**
 * Base class for agent operations with type-safe context enforcement
 * @template TContext - Required context type (defaults to GenerationContext)
 * @template TInput - Operation input type
 * @template TOutput - Operation output type
 */
export abstract class AgentOperation<
    TContext extends GenerationContext = GenerationContext,
    TInput = unknown,
    TOutput = unknown
> {
    abstract execute(
        inputs: TInput,
        options: OperationOptions<TContext>
    ): Promise<TOutput>;
}

export interface ToolSession {
    agent: ICodingAgent;
}

export interface ToolCallbacks {
    streamCb?: (chunk: string) => void;
    onAssistantMessage?: (message: Message) => Promise<void>;
    toolRenderer?: RenderToolCall;
    onToolComplete?: (message: Message) => Promise<void>;
}

export abstract class AgentOperationWithTools<
    TContext extends GenerationContext = GenerationContext,
    TInput = unknown,
    TOutput = unknown,
    TSession extends ToolSession = ToolSession
> extends AgentOperation<TContext, TInput, TOutput> {
    protected readonly loopDetector: LoopDetector = new LoopDetector();

    protected abstract getCallbacks(
        inputs: TInput,
        options: OperationOptions<TContext>
    ): ToolCallbacks;

    protected abstract buildSession(
        inputs: TInput,
        options: OperationOptions<TContext>
    ): TSession;

    protected abstract buildMessages(
        inputs: TInput,
        options: OperationOptions<TContext>,
        session: TSession
    ): Promise<Message[]>;

    protected abstract buildTools(
        inputs: TInput,
        options: OperationOptions<TContext>,
        session: TSession,
        callbacks: ToolCallbacks
    ): ToolDefinition<unknown, unknown>[];

    protected abstract getAgentConfig(
        inputs: TInput,
        options: OperationOptions<TContext>,
        session: TSession
    ): {
        agentActionName: AgentActionKey;
        modelConfig: ModelConfig;
        completionSignalName?: string;
        operationalMode?: "initial" | "followup";
        allowWarningInjection?: boolean;
    };

    protected abstract mapResultToOutput(
        inputs: TInput,
        options: OperationOptions<TContext>,
        session: TSession,
        result: InferResponseString
    ): TOutput;

    protected createCompletionConfig(
        completionSignalName: string,
        operationalMode: "initial" | "followup",
        allowWarningInjection: boolean,
    ): CompletionConfig {
        return {
            detector: completionSignalName
                ? new CompletionDetector([completionSignalName])
                : undefined,
            operationalMode,
            allowWarningInjection,
        };
    }

    protected async runToolInference(
        options: OperationOptions<TContext>,
        params: {
            messages: Message[];
            tools: ToolDefinition<unknown, unknown>[];
            agentActionName: AgentActionKey;
            modelConfig: ModelConfig;
            streamCb?: (chunk: string) => void;
            onAssistantMessage?: (message: Message) => Promise<void>;
            completionConfig?: CompletionConfig;
        },
    ): Promise<InferResponseString> {
        const { env, inferenceContext, logger } = options;
        const {
            messages,
            tools,
            agentActionName,
            modelConfig,
            streamCb,
            onAssistantMessage,
            completionConfig,
        } = params;

        const wrappedTools = wrapToolsWithLoopDetection(tools, this.loopDetector);

        logger.info(`Executing ${agentActionName} with tools`, {
            messageCount: messages.length,
            toolCount: wrappedTools.length,
            hasStream: !!streamCb,
            hasCompletionConfig: !!completionConfig,
        });

        const result = await executeInference({
            env,
            context: inferenceContext,
            agentActionName,
            modelConfig,
            messages,
            tools: wrappedTools,
            stream: streamCb
                ? {
                      chunk_size: 64,
                      onChunk: (chunk: string) => {
                          streamCb(chunk);
                      },
                  }
                : undefined,
            onAssistantMessage,
            completionConfig,
        });

        return result;
    }

    async execute(
        inputs: TInput,
        options: OperationOptions<TContext>
    ): Promise<TOutput> {
        const callbacks = this.getCallbacks(inputs, options);
        const session = this.buildSession(inputs, options);
        const messages = await this.buildMessages(inputs, options, session);
        const rawTools = this.buildTools(inputs, options, session, callbacks);

        const {
            agentActionName,
            modelConfig,
            completionSignalName,
            operationalMode,
            allowWarningInjection,
        } = this.getAgentConfig(inputs, options, session);

        const completionConfig = completionSignalName
            ? this.createCompletionConfig(
                  completionSignalName,
                  operationalMode ?? "initial",
                  allowWarningInjection ?? false,
              )
            : undefined;

        const result = await this.runToolInference(options, {
            messages,
            tools: rawTools,
            agentActionName,
            modelConfig,
            streamCb: callbacks.streamCb,
            onAssistantMessage: callbacks.onAssistantMessage,
            completionConfig,
        });

        return this.mapResultToOutput(inputs, options, session, result);
    }
}