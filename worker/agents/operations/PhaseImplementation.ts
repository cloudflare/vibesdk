import { PhaseConceptType, FileOutputType, PhaseConceptSchema } from '../schemas';
import { IssueReport } from '../domain/values/IssueReport';
import { createUserMessage, createMultiModalUserMessage } from '../inferutils/common';
import { executeInference } from '../inferutils/infer';
import { issuesPromptFormatter, PROMPT_UTILS, STRATEGIES } from '../prompts';
import { CodeGenerationStreamingState } from '../output-formats/streaming-formats/base';
import { FileProcessing } from '../domain/pure/FileProcessing';
// import { RealtimeCodeFixer } from '../assistants/realtimeCodeFixer';
import { AgentOperation, getSystemPromptWithProjectContext, OperationOptions } from '../operations/common';
import { SCOFFormat, SCOFParsingState } from '../output-formats/streaming-formats/scof';
import { TemplateRegistry } from '../inferutils/schemaFormatters';
import { IsRealtimeCodeFixerEnabled, RealtimeCodeFixer } from '../assistants/realtimeCodeFixer';
import { AGENT_CONFIG } from '../inferutils/config';
import { CodeSerializerType } from '../utils/codeSerializers';
import type { UserContext } from '../core/types';

export interface PhaseImplementationInputs {
    phase: PhaseConceptType
    issues: IssueReport
    isFirstPhase: boolean
    shouldAutoFix: boolean
    userContext?: UserContext;
    fileGeneratingCallback: (filePath: string, filePurpose: string) => void
    fileChunkGeneratedCallback: (filePath: string, chunk: string, format: 'full_content' | 'unified_diff') => void
    fileClosedCallback: (file: FileOutputType, message: string) => void
}

export interface PhaseImplementationOutputs{
    // rawFiles: FileOutputType[]
    fixedFilePromises: Promise<FileOutputType>[]
    deploymentNeeded: boolean
    commands: string[]
}

export const SYSTEM_PROMPT = `<ROLE>
    You are an Expert Senior Full-Stack Engineer at Cloudflare, renowned for working on mission critical infrastructure and crafting high-performance, visually stunning, robust, and maintainable web applications.
    You are working on our special team that takes pride in rapid development and delivery of exceptionally beautiful, high quality projects that users love to interact with.
    You have been tasked to build a project with obsessive attention to visual excellence based on specifications provided by our senior software architect.
</ROLE>

<GOAL>
    **Primary Objective:** Build fully functional, production-ready web applications in phases following architect-designed specifications.
    
    **Implementation Process:**
    1. **ANALYZE** current codebase snapshot and identify what needs to be built
    2. **PRIORITIZE** critical runtime errors that must be fixed first (render loops, undefined errors)
    3. **IMPLEMENT** phase requirements following blueprint specifications exactly with exceptional focus on:
       - **Visual Excellence**: Beautiful, modern UI that impresses users
       - **Interactive Polish**: Smooth animations, hover states, micro-interactions
       - **Responsive Perfection**: Flawless layouts across all device sizes
       - **User Experience**: Intuitive navigation, clear feedback, delightful interactions
       - **Supreme software development practices**: Follow the best coding principles and practices, and lay out the codebase in a way that is easy to maintain, extend and debug.
    4. **VALIDATE** that implementation is deployable, error-free, AND visually stunning
    
    **Success Criteria:**
    - Application is demoable, deployable, AND visually impressive after this phase
    - Zero runtime errors or deployment-blocking issues. All issues from previous phases are also fixed.
    - All phase requirements from architect are fully implemented
    - Code meets Cloudflare's highest standards for robustness, performance, AND visual excellence
    - Users are delighted by the interface design and smooth interactions
    - Every UI element demonstrates professional-grade visual polish
    
    **One-Shot Implementation:** You have only one attempt to implement this phase successfully. Quality and reliability are paramount.
</GOAL>

<CONTEXT>
    •   You MUST adhere to the <BLUEPRINT> and the <CURRENT_PHASE> provided to implement the current phase. It is your primary specification.
    •   The project was started based on our standard boilerplate template. It comes preconfigured with certain components preinstalled. 
    •   You will be provided with all of the current project code. Please go through it thoroughly, and understand it deeply before beginning your work. Use the components, utilities and APIs provided in the project.
    •   Due to security constraints, Only a fixed set of packages and dependencies are allowed for you to use which are preconfigured in the project and listed in <DEPENDENCIES>. Verify every import statement against them before using them.
    •   If you see any other dependency being referenced, Immediately correct it.
</CONTEXT>

<CLIENT REQUEST>
"{{query}}"
</CLIENT REQUEST>

<BLUEPRINT>
{{blueprint}}
</BLUEPRINT>

<DEPENDENCIES>
**Available Dependencies:**

Installed packages in the project:
{{dependencies}}

additional dependencies/frameworks **may** be provided:
{{blueprintDependencies}}

These are the only dependencies, components and plugins available for the project
</DEPENDENCIES>

${PROMPT_UTILS.UI_GUIDELINES}

We follow the following strategy at our team for rapidly delivering projects:
${STRATEGIES.FRONTEND_FIRST_CODING}

{{template}}`;

const USER_PROMPT = `**Phase Implementation**

<INSTRUCTIONS & CODE QUALITY STANDARDS>
These are the instructions and quality standards that must be followed to implement this phase.
**CRITICAL ERROR PREVENTION (Fix These First):**
    
    1. **React Render Loop Prevention** - HIGHEST PRIORITY
        - Never call setState during render phase
        - Always use dependency arrays in useEffect
        - **Store actions are stable - exclude from dependencies**
        - For Zustand: use \`useShallow\` not \`shallow\` as second param (v5)
        - Avoid unconditional setState in useEffect
        - Stabilize object/array references with useMemo/useCallback
    
    2. **Variable Declaration Order** - CRITICAL
       - Declare/import ALL variables before use
       - Avoid Temporal Dead Zone (TDZ) errors
       - Check function hoisting rules
    
    3. **Import Validation** - DEPLOYMENT BLOCKER
       - Verify all imports against <DEPENDENCIES>
       - Check file paths are correct (existing files or generating in this phase)
       - Ensure named vs default import syntax is correct
    
    4. **Runtime Error Prevention**
       - Add null checks before property access (user?.name)
       - Validate array length before element access
       - Use try-catch for async operations
       - Handle undefined values gracefully
    
    **CODE QUALITY STANDARDS:**
    •   **Robustness:** Write fault-tolerant code with proper error handling and fallbacks
    •   **State Management:** Ensure UI reflects application state correctly, no infinite re-renders
    •   **Performance:** Use React.memo, useMemo, useCallback to prevent unnecessary re-renders
    •   **VISUAL EXCELLENCE & UI MASTERY:** Create stunning, professional-grade UI that exceeds user expectations:
        - **Pixel-Perfect Layouts:** Ensure UI elements render exactly as per the blueprint with obsessive attention to spacing, alignment, and visual hierarchy
        - **Beautiful Spacing Systems:** Use consistent, harmonious spacing that creates visual rhythm and breathing room
        - **Interactive State Design:** Implement beautiful hover, focus, active, and loading states for all interactive elements
        - **Smooth Animations:** Add subtle, professional micro-interactions and transitions that enhance user experience
        - **Responsive Excellence:** Create layouts that look intentionally designed at every breakpoint, not just scaled
        - **Visual Depth:** Use shadows, borders, gradients strategically to create beautiful visual depth and modern appeal
        - **Typography Mastery:** Implement clear visual hierarchy with perfect font sizes, weights, and spacing
        - **Color Harmony:** Use colors thoughtfully to create emotional connection and clear information hierarchy
        - **Component Polish:** Every button, form, card, and interface element should look professionally crafted
            - Mentally simulate the UI in multiple screen sizes and ensure it looks absolutely beautiful everywhere
            - Pay special attention to centering, alignment, and visual balance in all components
    •   **Dependency Verification:** **ONLY** use libraries specified in <DEPENDENCIES>. No other libraries are allowed or exist.
    •   **Performance:** Write efficient code. Avoid unnecessary computations or re-renders.
    •   **Styling:** Use the specified CSS approach consistently (e.g., CSS Modules, Tailwind). Ensure class names match CSS definitions.
    •   **BUG FREE CODE:** Write good quality bug free code of the highest standards. Ensure all syntax is correct and all imports are valid. 
    •   **Please thoroughly review the tailwind.config.js file and existing styling CSS files, and make sure you use only valid defined Tailwind classes in your CSS. Using a class that is not defined in tailwind.config.js will lead to a crash which is very bad.**
    •   **Ensure there are no syntax errors or typos such as \`border-border\` (undefined) in tailwind instead of \`border\` (real class)**
    •   **You are not permitted to directly interfere or overwrite any of the core config files such as package.json, linting configs, tsconfig etc. except some exceptions**
    •   **Refrain from writing any SVG from scratch. Use existing public svgs or from an asset library installed in the project. Do not use any asset libraries that are not already installed in the project.**
    •   **Don't have other exports with react components in the same file, move the exports to a separate file. Use a named function for your React component. Rename your component name to pascal case.**
    •   **Always review the whole codebase to identify and fix UI issues (spacing, alignment, margins, paddings, etc.), syntax errors, typos, and logical flaws**
    •   **Do not use any unicode characters in the code. Stick to only outputing valid ASCII characters. Close strings with appropriate quotes.**
    •   **Try to wrap all essential code in try-catch blocks to isolate errors and prevent application crashes. Treat this project as mission critical**
    •   **In the footer of pages, you can mention the following: "Built with ❤️ at Cloudflare"**
    •   **VISUAL POLISH CHECKLIST:** For every component you create, ensure:
        - ✅ Beautiful hover and focus states that feel responsive and delightful
        - ✅ Proper visual hierarchy with clear information flow
        - ✅ Consistent spacing that follows a harmonious rhythm
        - ✅ Professional shadows, borders, and visual depth where appropriate
        - ✅ Smooth transitions and micro-interactions that enhance usability
        - ✅ Perfect responsive behavior that looks intentional at all screen sizes
        - ✅ Accessible design with proper contrast and semantic elements
    •   **Follow DRY principles by heart. Always research and understand the codebase before making changes. Understand the patterns used in the codebase. Do more in less code, be efficient with code**
    •   Make sure every component, variable, function, class, and type is defined before it is used. 
    •   Make sure everything that is needed is exported correctly from relevant files. Do not put duplicate 'default' exports.
    •   You may need to rewrite a file from a *previous* phase *if* you identify a critical issue or runtime errors in it.
    •   If any previous phase files were not made correctly or were corrupt, You shall also rewrite them in this phase. You are to ensure that the entire codebase is correct and working as expected.
    •   **Write the whole, raw contents for every file (\`full_content\` format). Do not use diff format.**
    •   **Every phase needs to be deployable with all the views/pages working properly!**
    •   **If its the first phase, make sure you override the template pages in the boilerplate with actual application frontend page!**
    •   **Make sure the product after this phase is FUNCTIONAL, POLISHED, AND VISUALLY STUNNING**
        - **Frontend Visual Excellence:** Write frontend code with obsessive attention to visual details:
            - Perfect spacing, alignment, and proportions that create visual harmony
            - Beautiful color combinations and thoughtful use of visual hierarchy
            - Smooth transitions and delightful micro-interactions
            - Professional-grade component styling that impresses users
            - Flawless responsive behavior that feels intentionally designed at every breakpoint
        - **Backend Logic Excellence:** Write backend code with correct logic, data flow and proper error handling
        - **Design System Consistency:** Maintain consistent visual patterns and component behaviors throughout
        - Always stick to best design practices, DRY principles and SOLID principles while prioritizing user delight
    •   **ALWAYS export ALL the components, variables, functions, classes, and types from each and every file**
    •   Some React specific guidelines:
        - **Rendering Should Be a Pure Function of Props and State**: A component's render method should be predictable. Given the same inputs (props and state), it should always produce the same JSX output
        - **Effects are Managed Lifecycles, Not Afterthoughts**: Use useEffect for side effects and state synchronization; never unconditionally update state in render or effects. Guard effect updates with proper dependency arrays and conditions.
        - **The principle of having a "single source of truth" is paramount in React**

Also understand the following:

${PROMPT_UTILS.COMMON_PITFALLS}

Every single file listed in <CURRENT_PHASE> needs to be implemented in this phase, based on the provided <OUTPUT FORMAT>.

**CRITICAL IMPLEMENTATION RULES:**

⚠️  **RENDER LOOP PREVENTION** - ZERO TOLERANCE
- NEVER call setState during render phase
- ALWAYS use proper dependency arrays in useEffect
- Check for patterns causing infinite loops before submitting
- If you write problematic code, REWRITE the entire file immediately

⚠️  **ZUSTAND SELECTOR POLICY** — ZERO TOLERANCE
- Do NOT return objects/arrays from \`useStore\` selectors
- Do NOT destructure from object-literal selectors (e.g., \`const { a, b } = useStore((s) => ({ a: s.a, b: s.b }))\`)
- Always select primitives individually via separate \`useStore\` calls
- If you absolutely must read multiple values in one call, pass zustand's shallow comparator: \`useStore(selector, shallow)\`. Avoid object literals.

⚠️  **BACKWARD COMPATIBILITY** - PRESERVE EXISTING FUNCTIONALITY  
- Do NOT break anything from previous phases
- Maintain all existing features and functionality
- Test mentally that previous phase components still work
- We have frequent regressions - be extra cautious

${PROMPT_UTILS.COMMON_DEP_DOCUMENTATION}

</INSTRUCTIONS & CODE QUALITY STANDARDS>

**IMPLEMENT THE FOLLOWING PROJECT PHASE**
<CURRENT_PHASE>
{{phaseText}}

{{issues}}

{{userSuggestions}}

</CURRENT_PHASE>`;

const LAST_PHASE_PROMPT = `Finalization and Review phase. 
Goal: Thoroughly review the entire codebase generated in previous phases. Identify and fix any remaining critical issues (runtime errors, logic flaws, rendering bugs) before deployment.
** YOU MUST HALT AFTER THIS PHASE **

<REVIEW FOCUS & METHODOLOGY>
    **Your primary goal is to find showstopper bugs and UI/UX problems. Prioritize:**
    1.  **Runtime Errors & Crashes:** Any code that will obviously throw errors (Syntax errors, TDZ/Initialization errors, TypeErrors like reading property of undefined, incorrect API calls). **Analyze the provided \`errors\` carefully for root causes.**
    2.  **Critical Logic Flaws:** Does the application logic *actually* implement the behavior described in the blueprint? (e.g., Simulate game moves mentally: Does moving left work? Does scoring update correctly? Are win/loss conditions accurate?).
    3.  **UI Rendering Failures:** Will the UI render as expected? Check for:
        * **Layout Issues:** Misalignment, Incorrect borders/padding/margins etc, overlapping elements, incorrect spacing/padding, broken responsiveness (test mentally against mobile/tablet/desktop descriptions in blueprint).
        * **Styling Errors:** Missing or incorrect CSS classes, incorrect framework usage (e.g., wrong Tailwind class).
        * **Missing Elements:** Are all UI elements described in the blueprint present?
    4.  **State Management Bugs:** Does state update correctly? Do UI updates reliably reflect state changes? Are there potential race conditions or infinite update loops?
    5.  **Data Flow & Integration Errors:** Is data passed correctly between components? Do component interactions work as expected? Are imports valid and do the imported files/functions exist?
    6.  **Event Handling:** Do buttons, forms, and other interactions trigger the correct logic specified in the blueprint?
    7. **Import/Dependency Issues:** Are all imports valid? Are there any missing or incorrectly referenced dependencies? Are they correct for the specific version installed?
    8. **Library version issues:** Are you sure the code written is compatible with the installed version of the library? (e.g., Tailwind v3 vs. v4)
    9. **Especially lookout for setState inside render or without dependencies**
        - Mentally simulate the linting rule \`react-hooks/exhaustive-deps\`.

    **Method:**
    •   Review file-by-file, considering its dependencies and dependents.
    •   Mentally simulate user flows described in the blueprint.
    •   Cross-reference implementation against the \`description\`, \`userFlow\`, \`components\`, \`dataFlow\`, and \`implementationDetails\` sections *constantly*.
    •   Pay *extreme* attention to declaration order within scopes.
    •   Check for any imports that are not defined, installed or are not in the template.
    •   Come up with a the most important and urgent issues to fix first. We will run code reviews in multiple iterations, so focus on the most important issues first.

    IF there are any runtime errors or linting errors provided, focus on fixing them first and foremost. No need to provide any minor fixes or improvements to the code. Just focus on fixing the errors.

</REVIEW FOCUS & METHODOLOGY>

<ISSUES TO REPORT (Answer these based on your review):>
    1.  **Functionality Mismatch:** Does the codebase *fail* to deliver any core functionality described in the blueprint? (Yes/No + Specific examples)
    2.  **Logic Errors:** Are there flaws in the application logic (state transitions, calculations, game rules, etc.) compared to the blueprint? (Yes/No + Specific examples)
    3.  **Interaction Failures:** Do user interactions (clicks, inputs) behave incorrectly based on blueprint requirements? (Yes/No + Specific examples)
    4.  **Data Flow Problems:** Is data not flowing correctly between components or managed incorrectly? (Yes/No + Specific examples)
    5.  **State Management Issues:** Does state management lead to incorrect application behavior or UI? (Yes/No + Specific examples)
    6.  **UI Rendering Bugs:** Are there specific rendering issues (layout, alignment, spacing, overlap, responsiveness)? (Yes/No + Specific examples of files/components and issues)
    7.  **Performance Bottlenecks:** Are there obvious performance issues (e.g., inefficient loops, excessive re-renders)? (Yes/No + Specific examples)
    8.  **UI/UX Quality:** Is the UI significantly different from the blueprint's description or generally poor/unusable (ignoring minor aesthetics)? (Yes/No + Specific examples)
    9.  **Runtime Error Potential:** Identify specific code sections highly likely to cause runtime errors (TDZ, undefined properties, bad imports, syntax errors etc.). (Yes/No + Specific examples)
    10. **Dependency/Import Issues:** Are there any invalid imports or usage of non-existent/uninstalled dependencies? (Yes/No + Specific examples)

    If issues pertain to just dependencies not being installed, please only suggest the necessary \`bun add\` commands to install them. Do not suggest file level fixes.
</ISSUES TO REPORT (Answer these based on your review):>

**Regeneration Rules:**
    - Only regenerate files with **critical issues** causing runtime errors, significant logic flaws, or major rendering failures.
    - **Exception:** Small UI/CSS files *can* be regenerated for styling/alignment fixes if needed.
    - Do **not** regenerate for minor formatting or non-critical stylistic preferences.
    - Do **not** make major refactors or architectural changes.

<INSTRUCTIONS>
    Do not spend much time on this phase. If you find any critical issues, just fix them and move on, we will have thorough code reviews in the next phases.
    Do not make major changes to the code. Just focus on fixing the critical issues and bugs.
</INSTRUCTIONS>

This phase prepares the code for final deployment.`;

const README_GENERATION_PROMPT = `<TASK>
Generate a comprehensive README.md file for this project based on the provided blueprint and template information.
The README should be professional, well-structured, and provide clear instructions for users and developers.
</TASK>

<INSTRUCTIONS>
- Create a professional README with proper markdown formatting
- Do not add any images or screenshots
- Include project title, description, and key features from the blueprint
- Add technology stack section based on the template dependencies
- Include setup/installation instructions using bun (not npm/yarn)
- Add usage examples and development instructions
- Include a deployment section with Cloudflare-specific instructions
- **IMPORTANT**: Add a \`[cloudflarebutton]\` placeholder near the top and another in the deployment section for the Cloudflare deploy button. Write the **EXACT** string except the backticks and DON'T enclose it in any other button or anything. We will replace it with https://deploy.workers.cloudflare.com/?url=\${repositoryUrl\} when the repository is created.
- Structure the content clearly with appropriate headers and sections
- Be concise but comprehensive - focus on essential information
- Use professional tone suitable for open source projects
</INSTRUCTIONS>

Generate the complete README.md content in markdown format. 
Do not provide any additional text or explanation. 
All your output will be directly saved in the README.md file. 
Do not provide and markdown fence \`\`\` \`\`\` around the content either! Just pure raw markdown content!`;

const formatUserSuggestions = (suggestions?: string[] | null): string => {
    if (!suggestions || suggestions.length === 0) {
        return '';
    }
    
    return `
<USER SUGGESTIONS>
The following client suggestions and feedback have been provided, relayed by our client conversation agent.
Please address these **on priority** in this phase.

**Client Feedback & Suggestions**:
${suggestions.map((suggestion, index) => `${index + 1}. ${suggestion}`).join('\n')}

**IMPORTANT**: Resolve these in the right and most elegant, non-hacky way. If resolving user-reported critical issues/bugs, please refer to the guidelines already provided.
Try to make small targeted, isolated changes to the codebase to address the user's suggestions unless a complete rework is required.
</USER SUGGESTIONS>`;
};

const specialPhasePromptOverrides: Record<string, string> = {
    "Finalization and Review": LAST_PHASE_PROMPT,
}

const userPromptFormatter = (phaseConcept: PhaseConceptType, issues: IssueReport, userSuggestions?: string[]) => {
    const phaseText = TemplateRegistry.markdown.serialize(
        phaseConcept,
        PhaseConceptSchema
    );
    
    const prompt = PROMPT_UTILS.replaceTemplateVariables(specialPhasePromptOverrides[phaseConcept.name] || USER_PROMPT, {
        phaseText,
        issues: issuesPromptFormatter(issues),
        userSuggestions: formatUserSuggestions(userSuggestions)
    });
    return PROMPT_UTILS.verifyPrompt(prompt);
}

export class PhaseImplementationOperation extends AgentOperation<PhaseImplementationInputs, PhaseImplementationOutputs> {
    async execute(
        inputs: PhaseImplementationInputs,
        options: OperationOptions
    ): Promise<PhaseImplementationOutputs> {
        const { phase, issues, userContext } = inputs;
        const { env, logger, context } = options;
        
        logger.info(`Generating files for phase: ${phase.name}`, phase.description, "files:", phase.files.map(f => f.path));
    
        // Notify phase start
        const codeGenerationFormat = new SCOFFormat();
        // Build messages for generation
        const messages = getSystemPromptWithProjectContext(SYSTEM_PROMPT, context, CodeSerializerType.SCOF);
        
        // Create user message with optional images
        const userPrompt = userPromptFormatter(phase, issues, userContext?.suggestions) + codeGenerationFormat.formatInstructions();
        const userMessage = userContext?.images && userContext.images.length > 0
            ? createMultiModalUserMessage(
                userPrompt,
                userContext.images.map(img => `data:${img.mimeType};base64,${img.base64Data}`),
                'high'
            )
            : createUserMessage(userPrompt);
        
        messages.push(userMessage);
    
        // Initialize streaming state
        const streamingState: CodeGenerationStreamingState = {
            accumulator: '',
            completedFiles: new Map(),
            parsingState: {} as SCOFParsingState
        };
    
        const fixedFilePromises: Promise<FileOutputType>[] = [];

        let modelConfig = AGENT_CONFIG.phaseImplementation;
        if (inputs.isFirstPhase) {
            modelConfig = AGENT_CONFIG.firstPhaseImplementation;
        }

        const shouldEnableRealtimeCodeFixer = inputs.shouldAutoFix && IsRealtimeCodeFixerEnabled(options.inferenceContext);
    
        // Execute inference with streaming
        await executeInference({
            env: env,
            agentActionName: "phaseImplementation",
            context: options.inferenceContext,
            messages,
            modelConfig,
            stream: {
                chunk_size: 256,
                onChunk: (chunk: string) => {
                    codeGenerationFormat.parseStreamingChunks(
                        chunk,
                        streamingState,
                        // File generation started
                        (filePath: string) => {
                            logger.info(`Starting generation of file: ${filePath}`);
                            inputs.fileGeneratingCallback(filePath, FileProcessing.findFilePurpose(filePath, phase, context.allFiles.reduce((acc, f) => ({ ...acc, [f.filePath]: f }), {})));
                        },
                        // Stream file content chunks
                        (filePath: string, fileChunk: string, format: 'full_content' | 'unified_diff') => {
                            inputs.fileChunkGeneratedCallback(filePath, fileChunk, format);
                        },
                        // onFileClose callback
                        (filePath: string) => {
                            logger.info(`Completed generation of file: ${filePath}`);
                            const completedFile = streamingState.completedFiles.get(filePath);
                            if (!completedFile) {
                                logger.error(`Completed file not found: ${filePath}`);
                                return;
                            }
    
                            // Process the file contents
                            const originalContents = context.allFiles.find(f => f.filePath === filePath)?.fileContents || '';
                            completedFile.fileContents = FileProcessing.processGeneratedFileContents(
                                completedFile,
                                originalContents,
                                logger
                            );
    
                            const generatedFile: FileOutputType = {
                                ...completedFile,
                                filePurpose: FileProcessing.findFilePurpose(
                                    filePath, 
                                    phase, 
                                    context.allFiles.reduce((acc, f) => ({ ...acc, [f.filePath]: f }), {})
                                )
                            };

                            if (shouldEnableRealtimeCodeFixer && generatedFile.fileContents.split('\n').length > 50) {
                                // Call realtime code fixer immediately - this is the "realtime" aspect
                                const realtimeCodeFixer = new RealtimeCodeFixer(env, options.inferenceContext);
                                const fixPromise = realtimeCodeFixer.run(
                                    generatedFile, 
                                    {
                                        // previousFiles: previousFiles,
                                        query: context.query,
                                        template: context.templateDetails
                                    },
                                    phase
                                );
                                fixedFilePromises.push(fixPromise);
                            } else {
                                fixedFilePromises.push(Promise.resolve(generatedFile));
                            }
    
                            inputs.fileClosedCallback(generatedFile, `Completed generation of ${filePath}`);
                        }
                    );
                }
            }
        });

        // // Extract commands from the generated files
        // const commands = extractCommands(results.string, true);
        const commands = streamingState.parsingState.extractedInstallCommands;

        logger.info("Files generated for phase:", phase.name, "with", fixedFilePromises.length, "files being fixed in real-time and extracted install commands:", commands);
    
        // Return generated files for validation and deployment
        return {
            fixedFilePromises,
            deploymentNeeded: fixedFilePromises.length > 0,
            commands,
        };
    }

    async generateReadme(options: OperationOptions): Promise<FileOutputType> {
        const { env, logger, context } = options;
        logger.info("Generating README.md for the project");

        try {
            let readmePrompt = README_GENERATION_PROMPT;
            const messages = [...getSystemPromptWithProjectContext(SYSTEM_PROMPT, context, CodeSerializerType.SCOF), createUserMessage(readmePrompt)];

            const results = await executeInference({
                env: env,
                messages,
                agentActionName: "projectSetup",
                context: options.inferenceContext,
            });

            if (!results || !results.string) {
                logger.error('Failed to generate README.md content');
                throw new Error('Failed to generate README.md content');
            }

            logger.info('Generated README.md content successfully');

            return {
                filePath: 'README.md',
                fileContents: results.string,
                filePurpose: 'Project documentation and setup instructions'
            };
        } catch (error) {
            logger.error("Error generating README:", error);
            throw error;
        }
    }
}
