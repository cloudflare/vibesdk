import {
    createSystemMessage,
    createUserMessage,
    Message,
    ConversationMessage,
} from '../inferutils/common';
import { AgentActionKey, ModelConfig } from '../inferutils/config.types';
import { AGENT_CONFIG } from '../inferutils/config';
import { buildAgenticBuilderTools } from '../tools/customTools';
import { RenderToolCall } from './UserConversationProcessor';
import { PROMPT_UTILS } from '../prompts';
import { FileState } from '../core/state';
import { ProjectType } from '../core/types';
import { Blueprint, AgenticBlueprint } from '../schemas';
import { prepareMessagesForInference } from '../utils/common';
import { createMarkGenerationCompleteTool } from '../tools/toolkit/completion-signals';
import { AgentOperationWithTools, OperationOptions, ToolSession, ToolCallbacks } from './common';
import { GenerationContext } from '../domain/values/GenerationContext';
import getSystemPrompt from './prompts/agenticBuilderPrompts';
import { ToolDefinition } from '../tools/types';
import { InferResponseString } from '../inferutils/core';

export interface AgenticProjectBuilderInputs {
    query: string;
    projectName: string;
    blueprint?: Blueprint;
    filesIndex: FileState[];
    projectType: ProjectType;
    selectedTemplate?: string;
    operationalMode: 'initial' | 'followup';
    conversationHistory?: ConversationMessage[];
    streamCb?: (chunk: string) => void;
    toolRenderer: RenderToolCall;
    onToolComplete?: (message: Message) => Promise<void>;
    onAssistantMessage?: (message: Message) => Promise<void>;
    modelConfigOverride?: ModelConfig;
}

export interface AgenticProjectBuilderOutputs {
    output: string;
}

export interface AgenticBuilderSession extends ToolSession {
    filesIndex: FileState[];
    projectType: ProjectType;
    operationalMode: 'initial' | 'followup';
    templateInfo?: string;
    dynamicHints: string;
    fileSummaries: string;
    conversationHistory: ConversationMessage[];
    hasFiles: boolean;
    hasPlan: boolean;
}

/**
 * Build user prompt with all context
 */
const getUserPrompt = (
    query: string,
    projectName: string,
    fileSummaries: string,
    templateInfo?: string
): string => {
    return `## Build Task
**Project Name**: ${projectName}
**User Request**: ${query}

${
//     blueprint ? `## Project Blueprint

// The following blueprint defines the structure, features, and requirements for this project:

// \`\`\`json
// ${JSON.stringify(blueprint, null, 2)}
// \`\`\`

// **Use this blueprint to guide your implementation.** It outlines what needs to be built.` : `## Note

// No blueprint provided. Design the project structure based on the user request above.`
''
}

${templateInfo ? `## Template Context

This project uses a preconfigured template:

${templateInfo}

**IMPORTANT:** Leverage existing components, utilities, and APIs from the template. Do not recreate what already exists.` : ''}

${fileSummaries ? `## Current Codebase

${fileSummaries}` : `## Starting Fresh

This is a new project. Start from the template or scratch.`}
Begin building.`;
};

export class AgenticProjectBuilderOperation extends AgentOperationWithTools<
    GenerationContext,
    AgenticProjectBuilderInputs,
    AgenticProjectBuilderOutputs,
    AgenticBuilderSession
> {
    protected getCallbacks(
        inputs: AgenticProjectBuilderInputs,
        _options: OperationOptions<GenerationContext>
    ): ToolCallbacks {
        const { streamCb, toolRenderer, onToolComplete, onAssistantMessage } = inputs;
        return {
            streamCb,
            toolRenderer,
            onToolComplete,
            onAssistantMessage,
        };
    }

    protected buildSession(
        inputs: AgenticProjectBuilderInputs,
        options: OperationOptions<GenerationContext>
    ): AgenticBuilderSession {
        const { logger, agent, context } = options;
        const {
            projectName,
            projectType,
            blueprint,
            filesIndex,
            selectedTemplate,
            operationalMode,
            conversationHistory,
        } = inputs;

        logger.info('Starting project build', {
            projectName,
            projectType,
            hasBlueprint: !!blueprint,
        });

        const fileSummaries = PROMPT_UTILS.summarizeFiles(filesIndex);

        const templateInfo = context.templateDetails
            ? PROMPT_UTILS.serializeTemplate(context.templateDetails)
            : undefined;

        const hasFiles = (filesIndex || []).length > 0;
        const isAgenticBlueprint = (bp?: Blueprint): bp is AgenticBlueprint => {
            return !!bp && Array.isArray((bp as any).plan);
        };
        const hasTSX = filesIndex?.some(f => /\.(t|j)sx$/i.test(f.filePath)) || false;
        const hasMD = filesIndex?.some(f => /\.(md|mdx)$/i.test(f.filePath)) || false;
        const hasPlan = isAgenticBlueprint(blueprint) && blueprint.plan.length > 0;
        const hasTemplate = !!selectedTemplate;
        const isPresentationProject = projectType === 'presentation';
        const needsSandbox = !isPresentationProject && (hasTSX || projectType === 'app');

        const dynamicHints = [
            !hasPlan
                ? '- No plan detected: Start with generate_blueprint (optionally with prompt parameter) to establish PRD (title, projectName, description, colorPalette, frameworks, plan).'
                : '- Plan detected: proceed to implement milestones using generate_files/regenerate_file.',
            needsSandbox && !hasTemplate
                ? '- Interactive project without template: Use init_suitable_template() to let AI select and import best matching template before first deploy.'
                : '',
            isPresentationProject && !hasTemplate
                ? '- Presentation project detected: Use init_suitable_template() to select presentation template, then create stunning slides with unique design.'
                : '',
            hasTSX && !isPresentationProject
                ? '- UI detected: Use deploy_preview to verify runtime; then run_analysis for quick feedback.'
                : '',
            isPresentationProject
                ? '- Presentation mode: NO deploy_preview/run_analysis needed. Focus on beautiful JSX slides, ask user for feedback.'
                : '',
            hasMD && !hasTSX
                ? '- Documents detected without UI: This is STATIC content - generate files in docs/, NO deploy_preview needed.'
                : '',
            !hasFiles && hasPlan
                ? '- Plan ready, no files yet: Scaffold initial structure with generate_files.'
                : '',
        ]
            .filter(Boolean)
            .join('\n');

        return {
            agent,
            filesIndex,
            projectType,
            operationalMode,
            templateInfo,
            dynamicHints,
            fileSummaries,
            conversationHistory: conversationHistory ?? [],
            hasFiles,
            hasPlan,
        };
    }

    protected async buildMessages(
        inputs: AgenticProjectBuilderInputs,
        options: OperationOptions<GenerationContext>,
        session: AgenticBuilderSession
    ): Promise<Message[]> {
        const { env, logger } = options;

        let historyMessages: Message[] = [];
        if (session.conversationHistory.length > 0) {
            const prepared = await prepareMessagesForInference(env, session.conversationHistory);
            historyMessages = prepared as Message[];

            logger.info('Loaded conversation history', {
                messageCount: historyMessages.length,
            });
        }

        let systemPrompt = getSystemPrompt(session.projectType, session.dynamicHints);

        if (historyMessages.length > 0) {
            systemPrompt += `\n\n# Conversation History\nYou are being provided with the full conversation history from your previous interactions. Review it to understand context and avoid repeating work.`;
        }

        const userPrompt = getUserPrompt(
            inputs.query,
            inputs.projectName,
            session.fileSummaries,
            session.templateInfo,
        );

        const system = createSystemMessage(systemPrompt);
        const user = createUserMessage(userPrompt);

        return [system, user, ...historyMessages];
    }

    protected buildTools(
        _inputs: AgenticProjectBuilderInputs,
        options: OperationOptions<GenerationContext>,
        session: AgenticBuilderSession,
        callbacks: ToolCallbacks
    ): ToolDefinition<unknown, unknown>[] {
        const { logger } = options;
        const toolRenderer = callbacks.toolRenderer;
        const onToolComplete = callbacks.onToolComplete;

        const rawTools = buildAgenticBuilderTools(
            session,
            logger,
            toolRenderer,
            onToolComplete,
        );
        rawTools.push(createMarkGenerationCompleteTool(session.agent, logger));

        return rawTools;
    }

    protected getAgentConfig(
        inputs: AgenticProjectBuilderInputs,
        options: OperationOptions<GenerationContext>,
        session: AgenticBuilderSession
    ) {
        const { logger } = options;
        const { hasFiles, hasPlan, operationalMode } = session;

        logger.info('Agentic builder mode', {
            mode: operationalMode,
            hasFiles,
            hasPlan,
        });

        return {
            agentActionName: 'agenticProjectBuilder' as AgentActionKey,
            modelConfig: inputs.modelConfigOverride || AGENT_CONFIG.agenticProjectBuilder,
            completionSignalName: 'mark_generation_complete',
            operationalMode: inputs.operationalMode,
            allowWarningInjection: inputs.operationalMode === 'initial',
        };
    }

    protected mapResultToOutput(
        _inputs: AgenticProjectBuilderInputs,
        options: OperationOptions<GenerationContext>,
        _session: AgenticBuilderSession,
        result: InferResponseString
    ): AgenticProjectBuilderOutputs {
        const output = result?.string || '';

        options.logger.info('Project build completed', {
            outputLength: output.length,
        });

        return { output };
    }
}
