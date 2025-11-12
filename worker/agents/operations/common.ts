import { StructuredLogger } from "../../logger";
import { GenerationContext } from "../domain/values/GenerationContext";
import { Message } from "../inferutils/common";
import { InferenceContext } from "../inferutils/config.types";
import { createUserMessage, createSystemMessage, createAssistantMessage } from "../inferutils/common";
import { generalSystemPromptBuilder, USER_PROMPT_FORMATTER } from "../prompts";
import { CodeSerializerType } from "../utils/codeSerializers";
import { ICodingAgent } from "../services/interfaces/ICodingAgent";

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