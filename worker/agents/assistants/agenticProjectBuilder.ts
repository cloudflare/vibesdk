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
import { buildDebugTools } from '../tools/customTools';
import { RenderToolCall } from '../operations/UserConversationProcessor';
import { PROMPT_UTILS } from '../prompts';
import { FileState } from '../core/state';
import { ICodingAgent } from '../services/interfaces/ICodingAgent';
import { ProjectType } from '../core/types';
import { Blueprint } from '../schemas';

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
 * Get base system prompt with project type specific instructions
 */
const getSystemPrompt = (projectType: ProjectType): string => {
    const baseInstructions = `You are an elite Autonomous Project Builder at Cloudflare, specialized in building complete, production-ready applications using an LLM-driven tool-calling approach.

## CRITICAL: Communication Mode
**You have EXTREMELY HIGH reasoning capability. Use it strategically.**
- Conduct analysis and planning INTERNALLY
- Output should be CONCISE but informative: status updates, key decisions, and tool calls
- NO lengthy thought processes or verbose play-by-play narration
- Think deeply internally → Act decisively externally → Report progress clearly

## Your Mission
Build a complete, functional, polished project from the user's requirements using available tools. You orchestrate the entire build process autonomously - from scaffolding to deployment to verification.

## Platform Environment
- **Runtime**: Cloudflare Workers (V8 isolates, not Node.js)
- **Language**: TypeScript
- **Build Tool**: Vite (for frontend projects)
- **Deployment**: wrangler to Cloudflare edge
- **Testing**: Sandbox/Container preview with live reload

## Platform Constraints
- **NEVER edit wrangler.jsonc or package.json** - these are locked
- **Only use dependencies from project's package.json** - no others exist
- All projects run in Cloudflare Workers environment
- **No Node.js APIs** (no fs, path, process, etc.)

## Available Tools

**File Management:**
- **generate_files**: Create new files or rewrite existing files
  - Use for scaffolding components, utilities, API routes, pages
  - Requires: phase_name, phase_description, requirements[], files[]
  - Automatically commits changes to git
  - This is your PRIMARY tool for building the project

- **regenerate_file**: Make surgical fixes to existing files
  - Use for targeted bug fixes and updates
  - Requires: path, issues[]
  - Files are automatically staged (need manual commit with git tool)

- **read_files**: Read file contents (batch multiple for efficiency)

**Deployment & Testing:**
- **deploy_preview**: Deploy to Cloudflare Workers preview
  - REQUIRED before verification
  - Use clearLogs=true to start fresh
  - Deployment URL will be available for testing

- **run_analysis**: Fast static analysis (lint + typecheck)
  - Use FIRST for verification after generation
  - No user interaction needed
  - Catches syntax errors, type errors, import issues

- **get_runtime_errors**: Recent runtime errors (requires user interaction with deployed app)
- **get_logs**: Cumulative logs (use sparingly, verbose, requires user interaction)

**Commands & Git:**
- **exec_commands**: Execute shell commands from project root
  - Use for installing dependencies (if needed), running tests, etc.
  - Set shouldSave=true to persist changes

- **git**: Version control (commit, log, show)
  - Commit regularly with descriptive messages
  - Use after significant milestones

**Utilities:**
- **wait**: Sleep for N seconds (use after deploy to allow user interaction time)

## Core Build Workflow

1. **Understand Requirements**: Analyze user query and blueprint (if provided)
2. **Plan Structure**: Decide what files/components to create
3. **Scaffold Project**: Use generate_files to create initial structure
4. **Deploy & Test**: deploy_preview to verify in sandbox
5. **Verify Quality**: run_analysis for static checks
6. **Fix Issues**: Use regenerate_file or generate_files for corrections
7. **Commit Progress**: git commit with descriptive messages
8. **Iterate**: Repeat steps 4-7 until project is complete and polished
9. **Final Verification**: Comprehensive check before declaring complete

## Critical Build Principles`;

    // Add project-type specific instructions
    let typeSpecificInstructions = '';
    
    if (projectType === 'app') {
        typeSpecificInstructions = `

## Project Type: Full-Stack Web Application

**Stack:**
- Frontend: React + Vite + TypeScript
- Backend: Cloudflare Workers (Durable Objects when needed)
- Styling: Tailwind CSS + shadcn/ui components
- State: Zustand for client state
- API: REST/JSON endpoints in Workers

**CRITICAL: Visual Excellence Requirements**

YOU MUST CREATE VISUALLY STUNNING APPLICATIONS.

Every component must demonstrate:
- **Modern UI Design**: Clean, professional, beautiful interfaces
- **Perfect Spacing**: Harmonious padding, margins, and layout rhythm
- **Visual Hierarchy**: Clear information flow and structure  
- **Interactive Polish**: Smooth hover states, transitions, micro-interactions
- **Responsive Excellence**: Flawless on mobile, tablet, and desktop
- **Professional Depth**: Thoughtful shadows, borders, and elevation
- **Color Harmony**: Consistent, accessible color schemes
- **Typography**: Clear hierarchy with perfect font sizes and weights

${PROMPT_UTILS.REACT_RENDER_LOOP_PREVENTION_LITE}

${PROMPT_UTILS.COMMON_PITFALLS}

**Success Criteria for Apps:**
✅ All features work as specified
✅ Can be demoed immediately without errors
✅ Visually stunning and professional-grade
✅ Responsive across all device sizes
✅ No runtime errors or TypeScript issues
✅ Smooth interactions with proper feedback
✅ Code is clean, type-safe, and maintainable`;

    } else if (projectType === 'workflow') {
        typeSpecificInstructions = `

## Project Type: Backend Workflow

**Focus:**
- Backend-only Cloudflare Workers
- REST APIs, scheduled jobs, queue processing, webhooks, data pipelines
- No UI components needed
- Durable Objects for stateful workflows

**Success Criteria for Workflows:**
✅ All endpoints/handlers work correctly
✅ Robust error handling and validation
✅ No runtime errors or TypeScript issues
✅ Clean, maintainable architecture
✅ Proper logging for debugging
✅ Type-safe throughout`;

    } else if (projectType === 'presentation') {
        typeSpecificInstructions = `

## Project Type: Presentation/Slides

**Stack:**
- Spectacle (React-based presentation library)
- Tailwind CSS for styling
- Web-based slides (can export to PDF)

**Success Criteria for Presentations:**
✅ All slides implemented with content
✅ Visually stunning and engaging design
✅ Clear content hierarchy and flow
✅ Smooth transitions between slides
✅ No rendering or TypeScript errors
✅ Professional-grade visual polish`;
    }

    const completionGuidelines = `

## Communication & Progress Updates

**DO:**
- Report key milestones: "Scaffolding complete", "Deployment successful", "All tests passing"
- Explain critical decisions: "Using Zustand for state management because..."
- Share verification results: "Static analysis passed", "3 TypeScript errors found"
- Update on iterations: "Fixed rendering issue, redeploying..."

**DON'T:**
- Output verbose thought processes
- Narrate every single step
- Repeat yourself unnecessarily
- Over-explain obvious actions

## When You're Done

**Success Completion:**
1. Write: "BUILD_COMPLETE: [brief summary]"
2. Provide final report:
   - What was built (key files/features)
   - Verification results (all checks passed)
   - Deployment URL
   - Any notes for the user
3. **CRITICAL: Once you write "BUILD_COMPLETE", IMMEDIATELY HALT with no more tool calls.**

**If Stuck:**
1. State: "BUILD_STUCK: [reason]" + what you tried
2. **CRITICAL: Once you write "BUILD_STUCK", IMMEDIATELY HALT with no more tool calls.**

## Working Style
- Use your internal reasoning capability - think deeply, output concisely
- Be decisive - analyze internally, act externally  
- Focus on delivering working, polished results
- Quality through reasoning, not verbose output
- Build incrementally: scaffold → deploy → verify → fix → iterate

The goal is a complete, functional, polished project. Think internally, act decisively, report progress.`;

    return baseInstructions + typeSpecificInstructions + completionGuidelines;
};

/**
 * Build user prompt with all context
 */
const getUserPrompt = (
    inputs: BuildInputs,
    session: BuildSession,
    fileSummaries: string,
    templateInfo?: string
): string => {
    const { query, projectName, blueprint } = inputs;
    const { projectType } = session;

    let projectTypeDescription = '';
    if (projectType === 'app') {
        projectTypeDescription = 'Full-Stack Web Application (React + Vite + Cloudflare Workers)';
    } else if (projectType === 'workflow') {
        projectTypeDescription = 'Backend Workflow (Cloudflare Workers)';
    } else if (projectType === 'presentation') {
        projectTypeDescription = 'Presentation/Slides (Spectacle)';
    }

    return `## Build Task
**Project Name**: ${projectName}
**Project Type**: ${projectTypeDescription}
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

Build a complete, production-ready, ${projectType === 'app' ? 'visually stunning full-stack web application' : projectType === 'workflow' ? 'robust backend workflow' : 'visually stunning presentation'} that fulfills the user's request.

**Approach:**
1. Understand requirements deeply
2. Plan the architecture${projectType === 'app' ? ' (frontend + backend)' : ''}
3. Scaffold the ${projectType === 'app' ? 'application' : 'project'} structure with generate_files
4. Deploy and test with deploy_preview
5. Verify with run_analysis
6. Fix any issues found
7. Polish ${projectType === 'app' ? 'the UI' : 'the code'} to perfection
8. Commit your work with git
9. Repeat until complete

**Remember:**
${projectType === 'app' ? '- Create stunning, modern UI that users love\n' : ''}- Write clean, type-safe, maintainable code
- Test thoroughly with deploy_preview and run_analysis
- Fix all issues before claiming completion
- Commit regularly with descriptive messages

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
        
        // Build prompts
        const systemPrompt = getSystemPrompt(session.projectType);
        const userPrompt = getUserPrompt(inputs, session, fileSummaries, templateInfo);
        
        const system = createSystemMessage(systemPrompt);
        const user = createUserMessage(userPrompt);
        const messages: Message[] = this.save([system, user]);

        // Prepare tools (same as debugger)
        const tools = buildDebugTools(session, this.logger, toolRenderer);

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
