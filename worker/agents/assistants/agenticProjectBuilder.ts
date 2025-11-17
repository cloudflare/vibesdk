import Assistant from './assistant';
import {
    createSystemMessage,
    createUserMessage,
    Message,
    ConversationMessage,
} from '../inferutils/common';
import { executeInference } from '../inferutils/infer';
import { InferenceContext, ModelConfig } from '../inferutils/config.types';
import { createObjectLogger } from '../../logger';
import { AGENT_CONFIG } from '../inferutils/config';
import { buildAgenticBuilderTools } from '../tools/customTools';
import { RenderToolCall } from '../operations/UserConversationProcessor';
import { PROMPT_UTILS } from '../prompts';
import { FileState } from '../core/state';
import { ICodingAgent } from '../services/interfaces/ICodingAgent';
import { ProjectType } from '../core/types';
import { Blueprint, AgenticBlueprint } from '../schemas';
import { prepareMessagesForInference } from '../utils/common';
import { createMarkGenerationCompleteTool } from '../tools/toolkit/completion-signals';
import { CompletionDetector } from '../inferutils/completionDetection';
import { LoopDetector } from '../inferutils/loopDetection';
import { wrapToolsWithLoopDetection } from './utils';
import getSystemPrompt from './agenticBuilderPrompts';

export type BuildSession = {
    filesIndex: FileState[];
    agent: ICodingAgent;
    projectType: ProjectType;
    selectedTemplate?: string;  // Template chosen by agent (e.g. spectacle-runner, react-game-starter, etc.)
};

export type BuildInputs = {
    query: string;
    projectName: string;
    blueprint?: Blueprint;
};

/**
 * Build user prompt with all context
 */
const getUserPrompt = (
    inputs: BuildInputs,
    fileSummaries: string,
    templateInfo?: string
): string => {
    const { query, projectName } = inputs;
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

/**
 * Summarize files for context
 */
function summarizeFiles(filesIndex: FileState[]): string {
    if (!filesIndex || filesIndex.length === 0) {
        return 'No files generated yet.';
    }

    const summary = filesIndex.map(f => {
        const relativePath = f.filePath.startsWith('/') ? f.filePath.substring(1) : f.filePath;
        const sizeKB = (f.fileContents.length / 1024).toFixed(1);
        return `- ${relativePath} (${sizeKB} KB) - ${f.filePurpose}`;
    }).join('\n');

    return `Generated Files (${filesIndex.length} total):\n${summary}`;
}

export class AgenticProjectBuilder extends Assistant<Env> {
    logger = createObjectLogger(this, 'AgenticProjectBuilder');
    modelConfigOverride?: ModelConfig;
    private loopDetector = new LoopDetector();

    constructor(
        env: Env,
        inferenceContext: InferenceContext,
        modelConfigOverride?: ModelConfig,
    ) {
        super(env, inferenceContext);
        this.modelConfigOverride = modelConfigOverride;
    }

    async run(
        inputs: BuildInputs,
        session: BuildSession,
        streamCb?: (chunk: string) => void,
        toolRenderer?: RenderToolCall,
        onToolComplete?: (message: Message) => Promise<void>,
        onAssistantMessage?: (message: Message) => Promise<void>,
        conversationHistory?: ConversationMessage[]
    ): Promise<string> {
        this.logger.info('Starting project build', {
            projectName: inputs.projectName,
            projectType: session.projectType,
            hasBlueprint: !!inputs.blueprint,
        });

        // Get file summaries
        const fileSummaries = summarizeFiles(session.filesIndex);
        
        // Get template details from agent
        const operationOptions = session.agent.getOperationOptions();
        const templateInfo = operationOptions.context.templateDetails 
            ? PROMPT_UTILS.serializeTemplate(operationOptions.context.templateDetails)
            : undefined;
        
        // Build dynamic hints from current context
        const hasFiles = (session.filesIndex || []).length > 0;
        const isAgenticBlueprint = (bp?: Blueprint): bp is AgenticBlueprint => {
            return !!bp && Array.isArray((bp as any).plan);
        };
        const hasTSX = session.filesIndex?.some(f => /\.(t|j)sx$/i.test(f.filePath)) || false;
        const hasMD = session.filesIndex?.some(f => /\.(md|mdx)$/i.test(f.filePath)) || false;
        const hasPlan = isAgenticBlueprint(inputs.blueprint) && inputs.blueprint.plan.length > 0;
        const hasTemplate = !!session.selectedTemplate;
        const isPresentationProject = session.projectType === 'presentation';
        // Presentations don't need sandbox (run in browser), only apps with TSX need sandbox
        const needsSandbox = !isPresentationProject && (hasTSX || session.projectType === 'app');

        const dynamicHints = [
            !hasPlan ? '- No plan detected: Start with generate_blueprint (optionally with prompt parameter) to establish PRD (title, projectName, description, colorPalette, frameworks, plan).' : '- Plan detected: proceed to implement milestones using generate_files/regenerate_file.',
            needsSandbox && !hasTemplate ? '- Interactive project without template: Use init_suitable_template() to let AI select and import best matching template before first deploy.' : '',
            isPresentationProject && !hasTemplate ? '- Presentation project detected: Use init_suitable_template() to select presentation template, then create stunning slides with unique design.' : '',
            hasTSX && !isPresentationProject ? '- UI detected: Use deploy_preview to verify runtime; then run_analysis for quick feedback.' : '',
            isPresentationProject ? '- Presentation mode: NO deploy_preview/run_analysis needed. Focus on beautiful JSX slides, ask user for feedback.' : '',
            hasMD && !hasTSX ? '- Documents detected without UI: This is STATIC content - generate files in docs/, NO deploy_preview needed.' : '',
            !hasFiles && hasPlan ? '- Plan ready, no files yet: Scaffold initial structure with generate_files.' : '',
        ].filter(Boolean).join('\n');

        let historyMessages: Message[] = [];
        if (conversationHistory && conversationHistory.length > 0) {
            const prepared = await prepareMessagesForInference(this.env, conversationHistory);
            historyMessages = prepared as Message[];

            this.logger.info('Loaded conversation history', {
                messageCount: historyMessages.length
            });
        }

        let systemPrompt = getSystemPrompt(session.projectType, dynamicHints);

        if (historyMessages.length > 0) {
            systemPrompt += `\n\n# Conversation History\nYou are being provided with the full conversation history from your previous interactions. Review it to understand context and avoid repeating work.`;
        }

        let userPrompt = getUserPrompt(inputs, fileSummaries, templateInfo);

        const system = createSystemMessage(systemPrompt);
        const user = createUserMessage(userPrompt);
        const messages: Message[] = this.save([system, user, ...historyMessages]);

        // Build tools with renderer and conversation sync callback
        const rawTools = buildAgenticBuilderTools(session, this.logger, toolRenderer, onToolComplete);
        rawTools.push(createMarkGenerationCompleteTool(this.logger));

        // Wrap tools with loop detection
        const tools = wrapToolsWithLoopDetection(rawTools, this.loopDetector);

        // Configure completion detection
        const completionConfig = {
            detector: new CompletionDetector(['mark_generation_complete']),
            operationalMode: (!hasFiles && !hasPlan) ? 'initial' as const : 'followup' as const,
            allowWarningInjection: !hasFiles && !hasPlan,
        };

        this.logger.info('Agentic builder mode', { mode: completionConfig.operationalMode, hasFiles, hasPlan });

        let output = '';

        try {
            const result = await executeInference({
                env: this.env,
                context: this.inferenceContext,
                agentActionName: 'agenticProjectBuilder',
                modelConfig: this.modelConfigOverride || AGENT_CONFIG.agenticProjectBuilder,
                messages,
                tools,
                stream: streamCb ? { chunk_size: 64, onChunk: (c) => streamCb(c) } : undefined,
                onAssistantMessage,
                completionConfig,
            });

            output = result?.string || '';

            this.logger.info('Project build completed', {
                outputLength: output.length
            });

        } catch (error) {
            this.logger.error('Project build failed', error);
            throw error;
        }

        return output;
    }
}
