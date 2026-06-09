import { createSystemMessage, createUserMessage, Message } from '../inferutils/common';
import { AgentActionKey } from '../inferutils/config.types';
import { CompletionConfig, InferError, InferResponseString } from '../inferutils/core';
import { buildDebugTools } from '../tools/customTools';
import { RenderToolCall } from './UserConversationProcessor';
import { PROMPT_UTILS } from '../prompts';
import { RuntimeError } from 'worker/services/sandbox/sandboxTypes';
import { FileState } from '../core/state';
import { ToolDefinition } from '../tools/types';
import { AgentOperationWithTools, OperationOptions, ToolSession, ToolCallbacks } from './common';
import { GenerationContext } from '../domain/values/GenerationContext';
import { createMarkDebuggingCompleteTool } from '../tools/toolkit/completion-signals';
import { SYSTEM_PROMPT } from './prompts/deepDebuggerPrompts';

const USER_PROMPT = (
    issue: string, 
    fileSummaries: string, 
    templateInfo?: string, 
    runtimeErrors?: string,
    previousTranscript?: string
) => `## Debugging Task
**Issue to resolve:** ${issue}

${previousTranscript ? `## Previous Debug Session Context
A previous debug session was completed. Here's what was done:

${previousTranscript}

**IMPORTANT:** Use this context to:
- Avoid redoing work already completed
- Build on previous fixes
- Reference previous findings if relevant
- Continue from where the last session left off if this is a related issue
` : ''}

## Project Context
Below is metadata about the codebase. Use this to orient yourself, but read actual file contents when you need details.

${fileSummaries}

${templateInfo ? `## Template/Boilerplate Information
This project was built from a template with preconfigured components and utilities:

${templateInfo}

**IMPORTANT:** These are the available components, utilities, and APIs in the project. Always verify imports against this list.` : ''}

${runtimeErrors ? `## Initial Runtime Errors (MAY BE STALE - VERIFY BEFORE FIXING)
These runtime errors were captured earlier. **CRITICAL: Verify each error still exists before attempting to fix.**

**Before fixing any error below:**
1. Read the actual code to confirm the bug is present
2. Cross-reference with fresh get_runtime_errors and get_logs
3. Check if previous fixes already resolved it
4. Don't fix the same issue twice

${runtimeErrors}

**To get fresh errors after your fixes:**
1. deploy_preview
2. wait(20-30, "Waiting for user interaction")
3. get_runtime_errors + get_logs (cross-reference both)` : ''}

## Your Mission
Diagnose and fix all user issues.

**Approach:**
- Think deeply internally (you have high reasoning capability)
- Execute decisively with minimal commentary
- Verify fixes before concluding
- Report concisely

**Remember:** Use internal reasoning for analysis. Output only concise status updates and tool calls. Save explanations for the final report.

Begin.`;

export interface DeepDebuggerInputs {
    issue: string;
    previousTranscript?: string;
    filesIndex: FileState[];
    runtimeErrors?: RuntimeError[];
    streamCb?: (chunk: string) => void;
    toolRenderer?: RenderToolCall;
}

export interface DeepDebuggerOutputs {
    transcript: string;
}

export interface DeepDebuggerSession extends ToolSession {
    templateInfo?: string;
    fileSummaries: string;
}

export class DeepDebuggerOperation extends AgentOperationWithTools<
    GenerationContext,
    DeepDebuggerInputs,
    DeepDebuggerOutputs,
    DeepDebuggerSession
> {
    protected getCallbacks(
        inputs: DeepDebuggerInputs,
        _options: OperationOptions<GenerationContext>
    ): ToolCallbacks {
        const { streamCb, toolRenderer } = inputs;
        return {
            streamCb,
            toolRenderer,
        };
    }

    protected buildSession(
        inputs: DeepDebuggerInputs,
        options: OperationOptions<GenerationContext>
    ): DeepDebuggerSession {
        const { agent, context, logger } = options;
        const { filesIndex, runtimeErrors } = inputs;

        logger.info('Starting deep debug session', {
            issue: inputs.issue,
            fileCount: filesIndex.length,
            hasRuntimeErrors: !!runtimeErrors && runtimeErrors.length > 0,
        });

        const templateInfo = context.templateDetails
            ? PROMPT_UTILS.serializeTemplate(context.templateDetails)
            : undefined;

        const fileSummaries = PROMPT_UTILS.summarizeFiles(filesIndex);

        return {
            agent,
            templateInfo,
            fileSummaries,
        };
    }

    protected async buildMessages(
        inputs: DeepDebuggerInputs,
        _options: OperationOptions<GenerationContext>,
        session: DeepDebuggerSession
    ): Promise<Message[]> {
        const system = createSystemMessage(SYSTEM_PROMPT);

        const runtimeErrorsText = inputs.runtimeErrors
            ? PROMPT_UTILS.serializeErrors(inputs.runtimeErrors)
            : undefined;

        const userPrompt = USER_PROMPT(
            inputs.issue,
            session.fileSummaries,
            session.templateInfo,
            runtimeErrorsText,
            inputs.previousTranscript,
        );

        const user = createUserMessage(userPrompt);

        return [system, user];
    }

    protected buildTools(
        _inputs: DeepDebuggerInputs,
        options: OperationOptions<GenerationContext>,
        session: DeepDebuggerSession,
        callbacks: ToolCallbacks
    ): ToolDefinition<unknown, unknown>[] {
        const { logger } = options;

        const tools = buildDebugTools(
            session,
            logger,
            callbacks.toolRenderer,
        );

        tools.push(createMarkDebuggingCompleteTool(logger));

        return tools;
    }

    protected getAgentConfig(
        inputs: DeepDebuggerInputs,
        options: OperationOptions<GenerationContext>,
        _session: DeepDebuggerSession
    ) {
        const { logger } = options;

        logger.info('Configuring deep debugger', {
            issue: inputs.issue,
        });

        return {
            agentActionName: 'deepDebugger' as AgentActionKey,
            completionSignalName: 'mark_debugging_complete',
            operationalMode: 'initial' as const,
            allowWarningInjection: true,
        };
    }

    protected mapResultToOutput(
        _inputs: DeepDebuggerInputs,
        options: OperationOptions<GenerationContext>,
        _session: DeepDebuggerSession,
        result: InferResponseString
    ): DeepDebuggerOutputs {
        const transcript = result?.string || '';

        options.logger.info('Deep debug session completed', {
            transcriptLength: transcript.length,
        });

        return { transcript };
    }

    protected async runToolInference(
        options: OperationOptions<GenerationContext>,
        params: {
            messages: Message[];
            tools: ToolDefinition<unknown, unknown>[];
            agentActionName: AgentActionKey;
            streamCb?: (chunk: string) => void;
            onAssistantMessage?: (message: Message) => Promise<void>;
            completionConfig?: CompletionConfig;
        },
    ): Promise<InferResponseString> {
        try {
            return await super.runToolInference(options, params);
        } catch (error) {
            if (error instanceof InferError) {
                const transcript = error.partialResponseTranscript();
                options.logger.info('Partial deep debug transcript', { transcript });
                return error.partialResponse();
            }

            throw error;
        }
    }
}
