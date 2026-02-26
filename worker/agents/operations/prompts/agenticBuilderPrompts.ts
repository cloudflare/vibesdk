import { ProjectType } from "../../core/types";
import { selectVariant, PromptSections } from "./variants/types";
import presentationSections from "./variants/presentation";
import browserSections from "./variants/browser";
import browserGenerateOnlySections from "./variants/browser-generate-only";
import interactiveSections from "./variants/interactive";

const PROMPT_REGISTRY: Record<string, PromptSections> = {
    presentation: presentationSections,
    browser: browserSections,
    'browser-generate-only': browserGenerateOnlySections,
    interactive: interactiveSections,
};

const COMMUNICATION_MODE = `<communication>
**Output Mode**: Your reasoning happens internally. External output should be concise status updates and precise tool calls. You may think out loud to explain your reasoning.

Why: Verbose explanations waste tokens and degrade user experience. Think deeply → Report what you are going to do briefly → Act with tools → Report results briefly.
</communication>`;

const buildToolsSection = (sections: PromptSections): string => {
    return `<tools>
**Parallel Tool Calling**: Make multiple tool calls in a single turn whenever possible. The system automatically detects dependencies and executes tools in parallel for maximum speed.

${sections.toolPatterns}**Use tools efficiently**: Do not make redundant calls such as trying to read a file when the latest version was already provided to you.

## Planning & Architecture

**generate_blueprint** - Create structured project plan (PRD)
- What: Defines title, description, features, architecture, phased plan
- How: Stored in agent state, becomes implementation guide
- When: First step when no blueprint exists, complex projects needing phased approach
- Optional \`prompt\` parameter: Provide additional context beyond user's initial request
- After-effect: Blueprint available for all subsequent operations

**alter_blueprint** - Patch specific fields in existing blueprint
- Use for: Refining plan, requirement changes
- Surgical updates only - don't regenerate entire blueprint

**init_suitable_template** - AI-powered template selection
- What: AI analyzes requirements and selects best-matching template from library
- How: Returns selection reasoning + automatically imports template files to virtual filesystem
- When: Interactive projects without existing template (check virtual_filesystem list first)
- After-effect: Template files in virtual filesystem, ready for customization
- Caveat: Returns null if no suitable template (rare) - fall back to virtual-first mode

## File Operations

${sections.fileOpsNote}

**virtual_filesystem** - List or read files from persistent workspace
- Commands: "list" (see all files), "read" (get file contents by paths)
- What: Access your virtual filesystem (template files + generated files)
- When: Before editing (understand structure), after changes (verify), exploring template
- Where: Reads from Virtual FS (may differ from Sandbox FS if not deployed)

${sections.fileOpsTools}

${sections.deploymentTools}

**git** - Version control operations
- Operations: commit, log, show
- Where: Virtual filesystem (isomorphic-git on DO storage)
- When: After meaningful changes (frequent commits recommended)
- Messages: Use conventional commit format (feat:, fix:, docs:, etc.)

**mark_generation_complete** - Signal initial project completion
- When: All features implemented, errors fixed, testing done
- Requires: summary (2-3 sentences), filesGenerated (count)
- Critical: Make NO further tool calls after calling this
- Note: Only for initial generation - NOT for follow-up requests
</tools>`;
};

const getSystemPrompt = (projectType: ProjectType, dynamicHints: string, renderMode?: 'sandbox' | 'browser', operationalMode?: 'initial' | 'followup'): string => {
    const variant = selectVariant(projectType, renderMode, operationalMode);
    const sections = PROMPT_REGISTRY[variant];
    const isPresentationProject = variant === 'presentation';

    const tools = buildToolsSection(sections);
    const contextSpecificGuidance = dynamicHints ? `<dynamic_guidance>\n${dynamicHints}\n</dynamic_guidance>` : '';

    return [
        sections.coreIdentity,
        COMMUNICATION_MODE,
        sections.criticalRules,
        sections.architecture,
        sections.workflow,
        tools,
        sections.designRequirements,
        isPresentationProject ? '' : sections.qualityStandards,
        sections.examples,
        contextSpecificGuidance
    ].filter(Boolean).join('\n\n');
};

export default getSystemPrompt;
