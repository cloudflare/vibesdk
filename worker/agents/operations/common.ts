import { StructuredLogger } from "../../logger";
import { GenerationContext } from "../domain/values/GenerationContext";
import { Message } from "../inferutils/common";
import { InferenceContext, AgentActionKey } from "../inferutils/config.types";
import { createUserMessage, createSystemMessage, createAssistantMessage } from "../inferutils/common";
import { generalSystemPromptBuilder, USER_PROMPT_FORMATTER } from "../prompts";
import { CodeSerializerType } from "../utils/codeSerializers";
import { ICodingAgent } from "../services/interfaces/ICodingAgent";
import { executeInference } from "../inferutils/infer";
import { ToolDefinition } from "../tools/types";
import { LoopDetector } from "../inferutils/loopDetection";
import { wrapToolsWithLoopDetection } from "../assistants/utils";
import { CompletionConfig, InferResponseString, InferError } from "../inferutils/core";
import { CompletionDetector } from "../inferutils/completionDetection";
import { RenderToolCall } from "./UserConversationProcessor";

export function getSystemPromptWithProjectContext(
    systemPrompt: string,
    context: GenerationContext,
    serializerType: CodeSerializerType = CodeSerializerType.SIMPLE,
    sharePhases: boolean = true
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
                sharePhases ? GenerationContext.getCompletedPhases(context) : [],
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

        // Create a local controller to allow aborting this specific request
        const controller = new AbortController();
        
        // Chain with the parent signal if it exists
        if (inferenceContext.abortSignal) {
            if (inferenceContext.abortSignal.aborted) {
                controller.abort();
            } else {
                inferenceContext.abortSignal.addEventListener('abort', () => controller.abort());
            }
        }

        // Wrap stream callback to detect text repetition
        let accumulatedContent = '';
        let lastCheckLength = 0;
        const CHECK_INTERVAL = 50; // Check every 50 characters to avoid overhead on every chunk

        const wrappedStreamCb = streamCb
            ? (chunk: string) => {
                  streamCb(chunk);
                  accumulatedContent += chunk;
                  
                  // Throttle the check
                  if (accumulatedContent.length - lastCheckLength > CHECK_INTERVAL) {
                      lastCheckLength = accumulatedContent.length;
                      
                      const recentContent = accumulatedContent.slice(-1000);

                      // Check for repetition
                      if (this.loopDetector.detectTextRepetition(recentContent)) {
                          logger.warn('Text repetition detected during streaming');
                          const warning = this.loopDetector.generateTextWarning();
                          
                          // CRITICAL: Abort the request to stop the LLM from generating more tokens
                          // This saves money and resources.
                          controller.abort();
                          
                          // Throw InferError to trigger retry logic in executeInference
                          // We include the accumulated content so it can be added to history
                          throw new InferError(
                              'Text repetition detected',
                              accumulatedContent + '\n\n' + warning
                          );
                      }
                  }
              }
            : undefined;

        const result = await executeInference({
            env,
            context: {
                ...inferenceContext,
                abortSignal: controller.signal
            },
            agentActionName,
            messages,
            tools: wrappedTools,
            stream: wrappedStreamCb
                ? {
                      chunk_size: 64,
                      onChunk: wrappedStreamCb,
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
            streamCb: callbacks.streamCb,
            onAssistantMessage: callbacks.onAssistantMessage,
            completionConfig,
        });

        return this.mapResultToOutput(inputs, options, session, result);
    }
}