import Assistant from './assistant';
import {
    createSystemMessage,
    createUserMessage,
    Message,
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

export type BuildSession = {
    filesIndex: FileState[];
    agent: ICodingAgent;
    projectType: ProjectType;
};

export type BuildInputs = {
    query: string;
    projectName: string;
    blueprint?: Blueprint;
};

/**
 * Build a rich, dynamic system prompt similar in rigor to DeepCodeDebugger,
 * but oriented for autonomous building. Avoids leaking internal taxonomy.
 */
const getSystemPrompt = (dynamicHints: string): string => {
  const persona = `You are an elite autonomous project builder with deep expertise in Cloudflare Workers (and Durable Objects as needed), TypeScript, Vite, and modern web application and content generation. You operate with extremely high reasoning capability. Think internally, act decisively, and report concisely.`;

  const comms = `CRITICAL: Communication Mode
- Perform all analysis, planning, and reasoning INTERNALLY
- Output should be CONCISE: brief status updates and tool calls only
- No verbose explanations or step-by-step narrations in output
- Think deeply internally → Act externally with tools → Report briefly`;

  const environment = `Project Environment
- Runtime: Cloudflare Workers (no Node.js fs/path/process)
- Fetch API standard (Request/Response), Web streams
- Frontend when applicable: React + Vite + TypeScript
- Deployments: wrangler → preview sandbox (live URL)`;

  const constraints = `Platform Constraints
- Prefer minimal dependencies; do not edit wrangler.jsonc or package.json unless necessary
- Logs and runtime errors are user-driven
- Paths are relative to project root; commands execute at project root; never use cd`;

  const toolsCatalog = `Available Tools & Usage Notes
- generate_blueprint: Produce initial PRD from the backend generator (plan for autonomous builds). Use FIRST if blueprint/plan is missing.
- alter_blueprint: Patch PRD fields (title, projectName, description, colorPalette, frameworks, plan). Use to refine after generation.
- generate_files: Create or rewrite multiple files for milestones. Be precise and include explicit file lists with purposes.
- regenerate_file: Apply targeted fixes to a single file. Prefer this for surgical changes before resorting to generate_files.
- read_files: Batch read code for analysis or confirmation.
- deploy_preview: Deploy only when a runtime exists (interactive UI, slide deck, or backend endpoints). Not for documents-only work.
- run_analysis: Lint + typecheck for verification. Use after deployment when a runtime is required; otherwise run locally for static code.
- get_runtime_errors / get_logs: Runtime diagnostics. Logs are cumulative; verify recency and avoid double-fixing.
- exec_commands: Execute commands sparingly; persist commands only when necessary.
- git: Commit, log, show; use clear conventional commit messages.
- initialize_slides: Import Spectacle and scaffold a deck when appropriate before deploying preview.
- generate_images: Stub for future image generation. Do not rely on it for critical paths.`;

  const protocol = `Execution Protocol
1) If blueprint or plan is missing → generate_blueprint. Then refine with alter_blueprint as needed.
2) Implement milestones via generate_files (or regenerate_file for targeted fixes).
3) When a runtime exists (UI/slides/backend endpoints), deploy_preview before verification.
   - Documents-only: do NOT deploy; focus on content quality and structure.
4) Verify: run_analysis; then use runtime diagnostics (get_runtime_errors, get_logs) if needed.
5) Iterate: fix → commit → test until complete.
6) Finish with BUILD_COMPLETE: <brief summary>. If blocked, BUILD_STUCK: <reason>. Stop tool calls immediately after either.`;

  const quality = `Quality Bar
- Type-safe, minimal, and maintainable code
- Thoughtful architecture; avoid unnecessary config churn
- Professional visual polish for UI when applicable (spacing, hierarchy, interaction states, responsiveness)`;

  const reactSafety = `${PROMPT_UTILS.REACT_RENDER_LOOP_PREVENTION_LITE}\n${PROMPT_UTILS.COMMON_PITFALLS}`;

  const completion = `Completion Discipline
- BUILD_COMPLETE: <brief summary> → stop
- BUILD_STUCK: <reason> → stop`;

  return [
    persona,
    comms,
    environment,
    constraints,
    toolsCatalog,
    protocol,
    quality,
    'Dynamic Guidance',
    dynamicHints,
    'React/General Safety Notes',
    reactSafety,
    completion,
  ].join('\n\n');
};

/**
 * Build user prompt with all context
 */
const getUserPrompt = (
    inputs: BuildInputs,
    fileSummaries: string,
    templateInfo?: string
): string => {
    const { query, projectName, blueprint } = inputs;
    return `## Build Task
**Project Name**: ${projectName}
**User Request**: ${query}

${blueprint ? `## Project Blueprint

The following blueprint defines the structure, features, and requirements for this project:

\`\`\`json
${JSON.stringify(blueprint, null, 2)}
\`\`\`

**Use this blueprint to guide your implementation.** It outlines what needs to be built.` : `## Note

No blueprint provided. Design the project structure based on the user request above.`}

${templateInfo ? `## Template Context

This project uses a preconfigured template:

${templateInfo}

**IMPORTANT:** Leverage existing components, utilities, and APIs from the template. Do not recreate what already exists.` : ''}

${fileSummaries ? `## Current Codebase

${fileSummaries}` : `## Starting Fresh

This is a new project. Start from the template or scratch.`}

## Your Mission

Build a complete, production-ready solution that best fulfills the request. If it needs a full web experience, build it. If it’s a backend workflow, implement it. If it’s narrative content, write documents; if slides are appropriate, build a deck and verify via preview.

**Approach (internal planning):**
1. Understand requirements and decide representation (UI, backend, slides, documents)
2. Generate PRD (if missing) and refine
3. Scaffold with generate_files, preferring regenerate_file for targeted edits
4. When a runtime exists: deploy_preview, then verify with run_analysis
5. Iterate and polish; commit meaningful checkpoints

**Remember:**
- Write clean, type-safe, maintainable code
- Test thoroughly with deploy_preview and run_analysis
- Fix all issues before claiming completion
- Commit regularly with descriptive messages

## Execution Reminder
- If no blueprint or plan is present: generate_blueprint FIRST, then alter_blueprint if needed. Do not implement until a plan exists.
- Deploy only when a runtime exists; do not deploy for documents-only work.

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

/**
 * AgenticProjectBuilder
 * 
 * Similar to DeepCodeDebugger but for building entire projects.
 * Uses tool-calling approach to scaffold, deploy, verify, and iterate.
 */
export class AgenticProjectBuilder extends Assistant<Env> {
    logger = createObjectLogger(this, 'AgenticProjectBuilder');
    modelConfigOverride?: ModelConfig;

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
        const dynamicHints = [
            !hasPlan ? '- No plan detected: Start with generate_blueprint to establish PRD (title, projectName, description, colorPalette, frameworks, plan).' : '- Plan detected: proceed to implement milestones using generate_files/regenerate_file.',
            hasTSX ? '- UI/slides detected: Use deploy_preview to verify runtime; then run_analysis for quick feedback.' : '',
            hasMD && !hasTSX ? '- Documents detected without UI: Do NOT deploy; focus on Markdown/MDX quality and structure.' : '',
            !hasFiles ? '- No files yet: After PRD, scaffold initial structure with generate_files. If a deck is appropriate, call initialize_slides before deploying preview.' : '',
        ].filter(Boolean).join('\n');

        // Build prompts
        const systemPrompt = getSystemPrompt(dynamicHints);
        const userPrompt = getUserPrompt(inputs, fileSummaries, templateInfo);
        
        const system = createSystemMessage(systemPrompt);
        const user = createUserMessage(userPrompt);
        const messages: Message[] = this.save([system, user]);

        // Prepare tools (same as debugger)
        const tools = buildAgenticBuilderTools(session, this.logger, toolRenderer);

        let output = '';

        try {
            const result = await executeInference({
                env: this.env,
                context: this.inferenceContext,
                agentActionName: 'agenticProjectBuilder',
                modelConfig: this.modelConfigOverride || AGENT_CONFIG.agenticProjectBuilder,
                messages,
                tools,
                stream: streamCb
                    ? { chunk_size: 64, onChunk: (c) => streamCb(c) }
                    : undefined,
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
