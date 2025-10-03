import { PhaseConceptGenerationSchema, PhaseConceptGenerationSchemaType } from '../schemas';
import { IssueReport } from '../domain/values/IssueReport';
import { createUserMessage, createMultiModalUserMessage } from '../inferutils/common';
import { executeInference } from '../inferutils/infer';
import { issuesPromptFormatter, PROMPT_UTILS, STRATEGIES } from '../prompts';
import { Message } from '../inferutils/common';
import { AgentOperation, getSystemPromptWithProjectContext, OperationOptions } from '../operations/common';
import { AGENT_CONFIG } from '../inferutils/config';
import type { UserContext } from '../core/types';

export interface PhaseGenerationInputs {
    issues: IssueReport;
    userContext?: UserContext;
    isUserSuggestedPhase?: boolean;
}

const SYSTEM_PROMPT = `<ROLE>
    You are a meticulous and seasoned senior software architect at Cloudflare with expertise in modern UI/UX design. You are working on our development team to build high performance, visually stunning, user-friendly and maintainable web applications for our clients.
    You are responsible for planning and managing the core development process, laying out the development strategy and phases that prioritize exceptional user experience and beautiful, modern design.
</ROLE>

<TASK>
    You are given the blueprint (PRD) and the client query. You will be provided with all previously implemented project phases, the current latest snapshot of the codebase, and any current runtime issues or static analysis reports.
    
    **Your primary task:** Design the next phase of the project as a deployable milestone leading to project completion or to address any user feedbacks or reported bugs.
    
    **Phase Planning Process:**
    1. **ANALYZE** current codebase state and identify what's implemented vs. what remains
    2. **PRIORITIZE** critical runtime errors that block deployment or user reported issues (render loops, undefined errors, import issues)
    3. **DESIGN** next logical development milestone following our phase strategy with emphasis on:
       - **Visual Excellence**: Modern, professional UI using Tailwind CSS best practices
       - **User Experience**: Intuitive navigation, clear information hierarchy, responsive design
       - **Interactive Elements**: Smooth animations, proper loading states, engaging micro-interactions
       - **Accessibility**: Proper semantic HTML, ARIA labels, keyboard navigation
       - **Supreme software development practices**: Follow the best coding principles and practices, and lay out the codebase in a way that is easy to maintain, extend and debug.
    4. **VALIDATE** that the phase will be deployable with all views/pages working beautifully across devices
    
    The project needs to be fully ready to ship in a reasonable amount of time. Plan accordingly.
    If no more phases are needed, conclude by putting blank fields in the response.
    Follow the <PHASES GENERATION STRATEGY> as your reference policy for building and delivering projects.
    You cannot suggest changes to core configuration files (package.json, tsconfig.json, wrangler.jsonc etc.) except specific exceptions like tailwind.config.js.
    **Never write image files! Never write jpeg, png, svg, etc files yourself! Always use some image url from the web.**
</TASK>

<STARTING TEMPLATE>
{{template}}
</STARTING TEMPLATE>

<CLIENT REQUEST>
"{{query}}"
</CLIENT REQUEST>

<BLUEPRINT>
{{blueprint}}
</BLUEPRINT>

<DEPENDENCIES>
**Available Dependencies:** You can ONLY import and use dependencies from the following==>

template dependencies:
{{dependencies}}

additional dependencies/frameworks provided:
{{blueprintDependencies}}

These are the only dependencies, components and plugins available for the project. No other plugin or component or dependency is available.
</DEPENDENCIES>`;

const NEXT_PHASE_USER_PROMPT = `**GENERATE THE PHASE**
{{generateInstructions}}
Adhere to the following guidelines: 

<SUGGESTING NEXT PHASE>
•   Suggest the next phase based on the current progress, the overall application architecture, suggested phases in the blueprint, current runtime errors/bugs and any user suggestions.
•   Please ignore non functional or non critical issues. Your primary task is to suggest project development phases. Linting and non-critical issues can be fixed later in code review cycles.
•   **CRITICAL RUNTIME ERROR PRIORITY**: If any runtime errors are present, they MUST be the primary focus of this phase. Runtime errors prevent deployment and user testing.
    
    **Priority Order for Critical Errors:**
    1. **React Render Loops** - "Maximum update depth exceeded", "Too many re-renders", useEffect infinite loops
    2. **Undefined Property Access** - "Cannot read properties of undefined", missing null checks
    3. **Import/Export Errors** - Wrong import syntax (@xyflow/react named vs default, @/lib/utils)
    4. **Tailwind Class Errors** - Invalid classes (border-border vs border)
    5. **Component Definition Errors** - Missing exports, undefined components
    
    **Error Handling Protocol:**
    - Name phase to reflect fixes: "Fix Critical Runtime Errors and [Feature]"
    - Cross-reference any code line or file name with current code structure
    - Validate reported issues exist before planning fixes
    - Focus on deployment-blocking issues over linting warnings
    - You would be provided with the diff of the last phase. If the runtime error occured due to the previous phase, you may get some clues from the diff.
•   Thoroughly review all the previous phases and the current implementation snapshot. Verify the frontend elements, UI, and backend components.
    - **Understand what has been implemented and what remains** We want a fully finished product eventually! No feature should be left unimplemented if its possible to implement it in the current project environment with purely open source tools and free tier services (i.e, without requiring any third party paid/API key service).
    - Each phase should work towards achieving the final product. **ONLY** mark as last phase if you are sure the project is at least 90-95% finished.
    - If a certain feature can't be implemented due to constraints, use mock data or best possible alternative that's still possible.
    - Thoroughly review the current codebase and identify and fix any bugs, incomplete features or unimplemented stuff.
•   **BEAUTIFUL UI PRIORITY**: Next phase should cover fixes (if any), development, AND significant focus on creating visually stunning, professional-grade UI/UX with:
    - Modern design patterns and visual hierarchy
    - Smooth animations and micro-interactions  
    - Beautiful color schemes and typography
    - Proper spacing, shadows, and visual polish
    - Engaging user interface elements
•   Use the <PHASES GENERATION STRATEGY> section to guide your phase generation.
•   Ensure the next phase logically and iteratively builds on the previous one.
•   Provide a clear, concise, to the point description of the next phase and the purpose and contents of each file in it.
•   Keep all the description fields very short and concise.
•   If there are any files that were supposed to be generated in the previous phase, but were not, please mention them in the phase description and suggest them in the phase.
•   Always suggest phases in sequential ordering - Phase 1 comes after Phase 0, Phase 2 comes after Phase 1 and so on.
•   **Every phase needs to be deployable with all the views/pages working properly AND looking absolutely beautiful!**
•   **VISUAL EXCELLENCE STANDARD**: Each phase should elevate the app's visual appeal with modern design principles, ensuring users are impressed by both functionality and aesthetics.
•   IF you need to get any file to be deleted or cleaned, please set the \`changes\` field to \`delete\` for that file.
•   **NEVER WRITE IMAGE FILES! NEVER WRITE JPEG, PNG, SVG, ETC FILES YOURSELF! ALWAYS USE SOME IMAGE URL FROM THE WEB.**
</SUGGESTING NEXT PHASE>

Always remember our strategy for phase generation: 
${STRATEGIES.FRONTEND_FIRST_PLANNING}

<DONT_TOUCH_FILES>
**STRICTLY DO NOT TOUCH THESE FILES**
- "wrangler.jsonc"
- "wrangler.toml"
- "donttouch_files.json"
- ".important_files.json"
- "worker/index.ts"
- "worker/core-utils.ts"

These files are very critical and redacted for security reasons. Don't modify the worker bindings the core-utils or the worker index file.
</DONT_TOUCH_FILES>

${PROMPT_UTILS.COMMON_DEP_DOCUMENTATION}

{{issues}}

{{userSuggestions}}`;

const formatUserSuggestions = (suggestions?: string[] | null): string => {
    if (!suggestions || suggestions.length === 0) {
        return '';
    }
    
    return `
<USER SUGGESTIONS>
The following client suggestions and feedback have been provided, relayed by our client conversation agent.
Explicitly state user's needs and suggestions in relevant files and components. For example, if user provides an image url, explicitly state it as-in in changes required for that file.
Please attend to these **on priority**:

**Client Feedback & Suggestions**:
\`\`\`
${suggestions.map((suggestion, index) => `${index + 1}. ${suggestion}`).join('\n')}
\`\`\`

**IMPORTANT**: Make sure the above feedbacks are resolved and executed properly, elegantly and in a non-hacky way. Only work towards resolving the above feedbacks.
And add this information detailedly in the phase description as well as in the relevant files. You may implement these suggestions across multiple phases as needed.
</USER SUGGESTIONS>`;
};

const userPromptFormatter = (issues: IssueReport, userSuggestions?: string[], isUserSuggestedPhase?: boolean) => {
    let prompt = NEXT_PHASE_USER_PROMPT
        .replaceAll('{{issues}}', issuesPromptFormatter(issues))
        .replaceAll('{{userSuggestions}}', formatUserSuggestions(userSuggestions));
    
    if (isUserSuggestedPhase) {
        prompt = prompt.replaceAll('{{generateInstructions}}', 'User requested some changes/modifications. Please thoroughly review the user suggestions and generate the next phase of the application accordingly');
    } else {
        prompt = prompt.replaceAll('{{generateInstructions}}', 'Generate the next phase of the application.');
    }
    
    return PROMPT_UTILS.verifyPrompt(prompt);
}
export class PhaseGenerationOperation extends AgentOperation<PhaseGenerationInputs, PhaseConceptGenerationSchemaType> {
    async execute(
        inputs: PhaseGenerationInputs,
        options: OperationOptions
    ): Promise<PhaseConceptGenerationSchemaType> {
        const { issues, userContext, isUserSuggestedPhase } = inputs;
        const { env, logger, context } = options;
        try {
            const suggestionsInfo = userContext?.suggestions && userContext.suggestions.length > 0
                ? `with ${userContext.suggestions.length} user suggestions`
                : "without user suggestions";
            const imagesInfo = userContext?.images && userContext.images.length > 0
                ? ` and ${userContext.images.length} image(s)`
                : "";
            
            logger.info(`Generating next phase ${suggestionsInfo}${imagesInfo}`);
    
            // Create user message with optional images
            const userPrompt = userPromptFormatter(issues, userContext?.suggestions, isUserSuggestedPhase);
            const userMessage = userContext?.images && userContext.images.length > 0
                ? createMultiModalUserMessage(
                    userPrompt,
                    userContext.images.map(img => `data:${img.mimeType};base64,${img.base64Data}`),
                    'high'
                )
                : createUserMessage(userPrompt);
            
            const messages: Message[] = [
                ...getSystemPromptWithProjectContext(SYSTEM_PROMPT, context),
                userMessage
            ];
    
            const { object: results } = await executeInference({
                env: env,
                messages,
                agentActionName: "phaseGeneration",
                schema: PhaseConceptGenerationSchema,
                context: options.inferenceContext,
                reasoning_effort: (userContext?.suggestions || issues.runtimeErrors.length > 0) ? AGENT_CONFIG.phaseGeneration.reasoning_effort == 'low' ? 'medium' : 'high' : undefined,
                format: 'markdown',
            });
    
            logger.info(`Generated next phase: ${results.name}, ${results.description}`);
    
            return results;
        } catch (error) {
            logger.error("Error generating next phase:", error);
            throw error;
        }
    }
}