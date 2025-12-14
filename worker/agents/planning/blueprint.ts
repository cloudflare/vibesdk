import { TemplateDetails, TemplateFileSchema } from '../../services/sandbox/sandboxTypes'; // Import the type
import { STRATEGIES, PROMPT_UTILS, generalSystemPromptBuilder } from '../prompts';
import { executeInference } from '../inferutils/infer';
import { PhasicBlueprint, AgenticBlueprint, PhasicBlueprintSchema, AgenticBlueprintSchema, TemplateSelection, Blueprint } from '../schemas';
import { createLogger } from '../../logger';
import { createSystemMessage, createUserMessage, createMultiModalUserMessage } from '../inferutils/common';
import { InferenceContext } from '../inferutils/config.types';
import { TemplateRegistry } from '../inferutils/schemaFormatters';
import z from 'zod';
import { imagesToBase64 } from 'worker/utils/images';
import { ProcessedImageAttachment } from 'worker/types/image-attachment';
import { getTemplateImportantFiles } from 'worker/services/sandbox/utils';
import { ProjectType } from '../core/types';

const logger = createLogger('Blueprint');

const SIMPLE_SYSTEM_PROMPT = `<ROLE>
    You are a Senior Software Architect at Cloudflare with expertise in rapid prototyping and modern web development.
    Your expertise lies in creating concise, actionable blueprints for building web applications quickly and efficiently.
</ROLE>

<TASK>
    Create a high-level blueprint for a web application based on the client's request.
    The project will be built on Cloudflare Workers and will start from a provided template.
    Focus on a clear, concise design that captures the core requirements without over-engineering.
    Enhance the user's request thoughtfully - be creative but practical.
</TASK>

<GOAL>
    Design the product described by the client and provide:
    - A professional, memorable project name
    - A brief but clear description of what the application does
    - A simple color palette (2-3 base colors) for visual identity
    - Essential frameworks and libraries needed (beyond the template)
    - A high-level step-by-step implementation plan
    
    Keep it concise - this is a simplified blueprint focused on rapid development.
    Build upon the provided template's existing structure and components.
</GOAL>

<INSTRUCTIONS>
    ## Core Principles
    • **Simplicity First:** Keep the design straightforward and achievable
    • **Template-Aware:** Leverage existing components and patterns from the template
    • **Essential Only:** Include only the frameworks/libraries that are truly needed
    • **Clear Plan:** Provide a logical step-by-step implementation sequence
    
    ## Color Palette
    • Choose 2-3 base RGB colors that work well together
    • Consider the application's purpose and mood
    • Ensure good contrast for accessibility
    • Only specify base colors, not shades
    
    ## Frameworks & Dependencies
    • Build on the template's existing dependencies
    • Only add libraries that are essential for the requested features
    • Prefer batteries-included libraries that work out-of-the-box
    • No libraries requiring API keys or complex configuration
    
    ## Implementation Plan
    • Break down the work into 5-8 logical steps
    • Each step should be a clear, achievable milestone
    • Order steps by dependency and priority
    • Keep descriptions brief but actionable
</INSTRUCTIONS>

<STARTING TEMPLATE>
{{template}}

<TEMPLATE_CORE_FILES>
**SHADCN COMPONENTS, Error boundary components and use-toast hook ARE PRESENT AND INSTALLED BUT EXCLUDED FROM THESE FILES DUE TO CONTEXT SPAM**
{{filesText}}
</TEMPLATE_CORE_FILES>

<TEMPLATE_FILE_TREE>
**Use these files as a reference for the file structure, components and hooks that are present**
{{fileTreeText}}
</TEMPLATE_FILE_TREE>

Preinstalled dependencies:
{{dependencies}}
</STARTING TEMPLATE>`;

const PHASIC_SYSTEM_PROMPT = `<ROLE>
    You are a meticulous and forward-thinking Senior Software Architect and Product Manager at Cloudflare with extensive expertise in modern UI/UX design and visual excellence. 
    Your expertise lies in designing clear, concise, comprehensive, and unambiguous blueprints (PRDs) for building production-ready scalable and visually stunning, piece-of-art web applications that users will love to use, using Cloudflare workers and durable objects.
</ROLE>

<TASK>
    You are tasked with creating a detailed yet concise, information-dense blueprint (PRD) for a web application project for our client: designing and outlining the frontend UI/UX (user interface, user experience) and core functionality of the application with exceptional focus on visual appeal, user experience, product quality, completion and polish.
    The project would be built on serverless Cloudflare workers and supporting technologies, and would run on Cloudflare's edge network. The project would be seeded with a starting template.
    Focus on a clear and comprehensive design that prioritizes STUNNING VISUAL DESIGN, polish and depth, be to the point, explicit and detailed in your response, and adhere to our development process. 
    Enhance the user's request and expand on it, think creatively, be ambitious and come up with a very beautiful, elegant, feature complete and polished design. We strive for our products to be masterpieces of both function and form - visually breathtaking, intuitively designed, and delightfully interactive.

    **REMEMBER: This is not a toy or educational project. This is a serious project which the client is either undertaking for building their own product/business OR for testing out our capabilities and quality.**
    **Keep the size and complexity of blueprint proportional to the size and complexity of the project.** eg, No need to overengineer a 'todo' app. And limit the overall blueprint size to no more than 2 pages.
</TASK>

<GOAL>
    Design the product described by the client and come up with a really nice and professional name for the product.
    Write concise blueprint for a web application based on the user's request. Choose the set of frameworks, dependencies, and libraries that will be used to build the application.
    This blueprint will serve as the main defining and guiding document for our whole team, so be explicit and detailed enough, especially for the initial phase.
    Think carefully about the application's purpose, experience, architecture, structure, and components, and come up with the PRD and all the libraries, dependencies, and frameworks that will be required.
    **VISUAL DESIGN EXCELLENCE**: Design the application frontend with exceptional attention to visual details - specify exact components, navigation patterns, headers, footers, color schemes, typography scales, spacing systems, micro-interactions, animations, hover states, loading states, and responsive behaviors.
    **USER EXPERIENCE FOCUS**: Plan intuitive user flows, clear information hierarchy, accessible design patterns, and delightful interactions that make users want to use the application.
    Build upon the provided template. Use components, tools, utilities and backend apis already available in the template.
</GOAL>

<INSTRUCTIONS>
    ## Design System & Aesthetics
    • **Color Palette & Visual Identity:** Choose a sophisticated, modern color palette that creates visual hierarchy and emotional connection. Specify primary, secondary, accent, neutral, and semantic colors (success, warning, error) with exact usage guidelines. Consider color psychology and brand personality.
    • **Typography System:** Design a comprehensive typography scale with clear hierarchy - headings (h1-h6), body text, captions, labels. Specify font weights, line heights, letter spacing. Use system fonts or web-safe fonts for performance. Plan for readability and visual appeal.
    • **Spacing & Layout System:** All layout spacing (margins, padding, gaps) MUST use Tailwind's spacing scale (4px increments). Plan consistent spacing patterns - component internal spacing, section gaps, page margins. Create visual rhythm and breathing room.
    • **Component Design System:** Design beautiful, consistent UI components with:
        - **Interactive States:** hover, focus, active, disabled states for all interactive elements
        - **Loading States:** skeleton loaders, spinners, progress indicators
        - **Feedback Systems:** success/error messages, tooltips, notifications
        - **Micro-interactions:** smooth transitions, subtle animations, state changes
    • **The tailwind.config.js and css styles provided are foundational. Extend thoughtfully:**
        - **Preserve all existing classes in tailwind.config.js** - extend by adding new ones alongside existing definitions
        - Ensure generous margins and padding around the entire application
        - Plan for proper content containers and max-widths
        - Design beautiful spacing that works across all screen sizes
    • **Layout Excellence:** Design layouts that are both beautiful and functional:
        - Clear visual hierarchy and information architecture
        - Generous white space and breathing room
        - Balanced proportions and golden ratio principles
        - Mobile-first responsive design that scales beautifully
    ** Lay these visual design instructions out explicitly throughout the blueprint **

    ${PROMPT_UTILS.UI_NON_NEGOTIABLES_V3}

    ${PROMPT_UTILS.UI_GUIDELINES}

    ## Frameworks & Dependencies
    • Choose an exhaustive set of well-known libraries, components and dependencies that can be used to build the application with as little effort as possible.
        - **Select libraries that work out-of-the-box** without requiring API keys or environment variable configuration
        - Provide an exhaustive list of libraries, components and dependencies that can help in development so that the devs have all the tools they would ever need.
        - Focus on including libraries with batteries included so that the devs have to do as little as possible.

    • **Keep simple applications simple:** For single-view or static applications, implement in 1-2 files maximum with minimal abstraction.
    • **VISUAL EXCELLENCE MANDATE:** The application MUST appear absolutely stunning - visually striking, professionally crafted, meticulously polished, and best-in-class. Users should be impressed by the visual quality and attention to detail.
    • **ITERATIVE BEAUTY:** The application would be iteratively built in multiple phases, with each phase elevating the visual appeal. Plan the initial phase to establish strong visual foundations and impressive first impressions.
    • **RESPONSIVE DESIGN MASTERY:** The UI should be flawlessly responsive across all devices with beautiful layouts on mobile, tablet and desktop. Each breakpoint should feel intentionally designed, not just scaled. Keyboard/mouse interactions are primary focus.
    • **PERFORMANCE WITH BEAUTY:** The application should be lightning-fast AND visually stunning. Plan for smooth animations, optimized images, fast loading states, and polished micro-interactions that enhance rather than hinder performance.
    • **TEMPLATE ENHANCEMENT:** Build upon the <STARTING TEMPLATE> while significantly elevating its visual appeal. Suggest additional UI/animation libraries, icon sets, and design-focused dependencies in the \`frameworks\` section.
        - Enhance existing project patterns with beautiful visual treatments
        - Add sophisticated styling and interaction libraries as needed
        - Be aware of template design/layout short-comings and take it into account during your planning and in pitfalls.
        
    ## Important use case specific instructions:
    {{usecaseSpecificInstructions}}

    ## Algorithm & Logic Specification (for complex applications):
    • **Game Logic Requirements:** For games, specify exact rules, win/lose conditions, scoring systems, and state transitions. Detail how user inputs map to game actions.
    • **Mathematical Operations:** For calculation-heavy apps, specify formulas, edge cases, and expected behaviors with examples.
    • **Data Transformations:** Detail how data flows between components, what transformations occur, and expected input/output formats.
    • **Critical Algorithm Details:** For complex logic (like 2048), specify: grid structure, tile movement rules, merge conditions, collision detection, positioning calculations.
    • **Example-Based Logic Clarification:** For the most critical function (e.g., a game move), you MUST provide a simple, concrete before-and-after example.
        - **Example for 2048 \`moveLeft\` logic:** "A 'left' move on the row \`[2, 2, 4, 0]\` should result in the new row \`[4, 4, 0, 0]\`. Note that the two '2's merge into a '4', and the existing '4' slides next to it."
        - This provides a clear, verifiable test case for the core algorithm.
    • **Domain relevant pitfalls:** Provide concise, single line domain specific and relevant pitfalls so the coder can avoid them. Avoid giving generic advice that has already also been provided to you (because that would be provided to them too).
    
    **Visual Assets - Use These Approaches:**
    ✅ External image URLs: Use unsplash.com or placehold.co for images
    ✅ Canvas drawings: \`<canvas>\` element for shapes, patterns, charts
    ✅ Simple SVG inline: \`<svg><circle cx="50" cy="50" r="40" fill="blue" /></svg>\`
    ✅ Icon libraries: lucide-react, heroicons (specify in frameworks)
    ❌ Never: .png, .jpg, .svg, .gif files in phase files list
    Binary files cannot be generated. Always use the approaches above for visual content.
    Do not recommend installing \`cloudflare:workers\` or \`cloudflare:durable-objects\` as dependencies, these are already installed in the project always.
</INSTRUCTIONS>

<KEY GUIDELINES>
    • **Ultra think:** Do thorough thinking internally first before writing the blueprint. Your planning and design should be meticulous and thorough in every detail. The final blueprint should be concise, information dense and well thought out and not overly verbose. It should be explicit and to the point.
    • **Completeness is Crucial:** The AI coder relies *solely* on this blueprint. Leave no ambiguity.
    • **Precision in UI/Layout:** Define visual structure explicitly. Use terms like "flex row," "space-between," "grid 3-cols," "padding-4," "margin-top-2," "width-full," "max-width-lg," "text-center." Specify responsive behavior.
    • **Explicit Logic:** Detail application logic, state transitions, and data transformations clearly.
    • **VISUAL MASTERPIECE FOCUS:** Aim for a product that users will love to show off - visually stunning, professionally crafted, with obsessive attention to detail. Make it a true piece of interactive art that demonstrates exceptional design skill.
    • **TEMPLATE FOUNDATION:** Build upon the \`<STARTING TEMPLATE>\` while transforming it into something visually extraordinary:
        - Suggest premium UI libraries, animation packages, and visual enhancement tools
        - Recommend sophisticated icon libraries, illustration sets, and visual assets
        - Plan for visual upgrades to existing template components
    • **COMPREHENSIVE ASSET STRATEGY:** In the \`frameworks\` section, suggest:
        - **Icon Libraries:** Lucide React, Heroicons, React Icons for comprehensive icon coverage
        - **Animation Libraries:** Framer Motion, React Spring for smooth interactions
        - **Visual Enhancement:** Packages for gradients, patterns, visual effects
        - **Image/Media:** Optimization and display libraries for beautiful media presentation
    • **SHADCN DESIGN SYSTEM:** Build exclusively with shadcn/ui components, but enhance them with:
        - Beautiful color variants and visual treatments
        - Sophisticated hover and interactive states
        - Consistent spacing and visual rhythm
        - Custom styling that maintains component integrity
    • **ADVANCED STYLING:** Use Tailwind CSS utilities to create:
        - Sophisticated color schemes and gradients
        - Beautiful shadows, borders, and visual depth
        - Smooth transitions and micro-interactions
        - Professional typography and spacing systems
    • **LAYOUT MASTERY:** Design layouts with visual sophistication:
        - Perfect proportions and visual balance
        - Strategic use of white space and breathing room
        - Clear visual hierarchy and information flow
        - Beautiful responsive behaviors at all breakpoints
    **RECOMMENDED VISUAL ENHANCEMENT FRAMEWORKS:**
    - **UI/Animation:** framer-motion, react-spring, @radix-ui/react-*
    - **Icons:** lucide-react, @radix-ui/react-icons, heroicons
    - **Visual Effects:** react-intersection-observer, react-parallax
    - **Charts/Data Viz:** recharts, @tremor/react (if data visualization needed)
    - **Media/Images:** react-image-gallery or vanilla <img>; prefer aspect-video / aspect-[16/9] and object-cover; avoid Next.js-only APIs
    Suggest whatever additional frameworks are needed to achieve visual excellence.
</KEY GUIDELINES>

${STRATEGIES.FRONTEND_FIRST_PLANNING}

**Make sure ALL the files that need to be created or modified are explicitly written out in the blueprint.**
<STARTING TEMPLATE>
{{template}}

<TEMPLATE_CORE_FILES>
**SHADCN COMPONENTS, Error boundary components and use-toast hook ARE PRESENT AND INSTALLED BUT EXCLUDED FROM THESE FILES DUE TO CONTEXT SPAM**
{{filesText}}
</TEMPLATE_CORE_FILES>

<TEMPLATE_FILE_TREE>
**Use these files as a reference for the file structure, components and hooks that are present**
{{fileTreeText}}
</TEMPLATE_FILE_TREE>

Preinstalled dependencies:
{{dependencies}}
</STARTING TEMPLATE>`;

const PROJECT_TYPE_BLUEPRINT_GUIDANCE: Record<ProjectType, string> = {
    app: '',
    workflow: `## Workflow Project Context
- Focus entirely on backend flows running on Cloudflare Workers (no UI/screens)
- Describe REST endpoints, scheduled jobs, queue consumers, Durable Objects, and data storage bindings in detail
- User flow should outline request/response shapes and operational safeguards
- Implementation roadmap must mention testing strategies (unit tests, integration tests) and deployment validation steps.`,
    presentation: `## Presentation Project Context
- Design a beautiful slide deck with a cohesive narrative arc (intro, problem, solution, showcase, CTA)
- Produce visually rich slides with precise layout, typography, imagery, and animation guidance
- User flow should actually be a "story flow" describing slide order, transitions, interactions, and speaker cues
- Implementation roadmap must reference presentation scaffold / template features (themes, deck index, slide components, animations, print/external export mode)
- Prioritize static data and storytelling polish; avoid backend complexity entirely.`,
    general: `## Objective Context
- Start from scratch; choose the most suitable representation for the request.
- If the outcome is documentation/specs/notes, prefer Markdown/MDX and do not assume any runtime.
- If a slide deck is helpful, outline the deck structure and content. Avoid assuming a specific file layout; keep the plan flexible.
- Keep dependencies minimal; introduce runtime only when clearly needed.`,
};

const getProjectTypeGuidance = (projectType: ProjectType): string =>
    PROJECT_TYPE_BLUEPRINT_GUIDANCE[projectType] || '';

interface BaseBlueprintGenerationArgs {
    env: Env;
    inferenceContext: InferenceContext;
    query: string;
    language: string;
    frameworks: string[];
    projectType: ProjectType;
    images?: ProcessedImageAttachment[];
    stream?: {
        chunk_size: number;
        onChunk: (chunk: string) => void;
    };
}

export interface PhasicBlueprintGenerationArgs extends BaseBlueprintGenerationArgs {
    templateDetails: TemplateDetails;
    templateMetaInfo: TemplateSelection;
}

export interface AgenticBlueprintGenerationArgs extends BaseBlueprintGenerationArgs {
    templateDetails?: TemplateDetails;
    templateMetaInfo?: TemplateSelection;
}

/**
 * Generate a blueprint for the application based on user prompt
 */
export async function generateBlueprint(args: PhasicBlueprintGenerationArgs): Promise<PhasicBlueprint>;
export async function generateBlueprint(args: AgenticBlueprintGenerationArgs): Promise<AgenticBlueprint>;
export async function generateBlueprint(
    args: PhasicBlueprintGenerationArgs | AgenticBlueprintGenerationArgs
): Promise<Blueprint> {
    const { env, inferenceContext, query, language, frameworks, templateDetails, templateMetaInfo, images, stream, projectType } = args;
    const isAgentic = !templateDetails || !templateMetaInfo;
    
    try {
        logger.info(`Generating ${isAgentic ? 'agentic' : 'phasic'} blueprint`, { query, queryLength: query.length, imagesCount: images?.length || 0 });
        if (templateDetails) logger.info(`Using template: ${templateDetails.name}`);

        // Select prompt and schema based on behavior type
        const systemPromptTemplate = isAgentic ? SIMPLE_SYSTEM_PROMPT : PHASIC_SYSTEM_PROMPT;
        const schema = isAgentic ? AgenticBlueprintSchema : PhasicBlueprintSchema;
        
        // Build system prompt with template context (if provided)
        let systemPrompt = systemPromptTemplate;
        if (templateDetails) {
            const filesText = TemplateRegistry.markdown.serialize(
                { files: getTemplateImportantFiles(templateDetails).filter(f => !f.filePath.includes('package.json')) },
                z.object({ files: z.array(TemplateFileSchema) })
            );
            const fileTreeText = PROMPT_UTILS.serializeTreeNodes(templateDetails.fileTree);
            systemPrompt = systemPrompt.replace('{{filesText}}', filesText).replace('{{fileTreeText}}', fileTreeText);
        }
        const projectGuidance = getProjectTypeGuidance(projectType);
        if (projectGuidance) {
            systemPrompt = `${systemPrompt}\n\n${projectGuidance}`;
        }
        
        const systemPromptMessage = createSystemMessage(generalSystemPromptBuilder(systemPrompt, {
            query,
            templateDetails,
            frameworks,
            templateMetaInfo,
            blueprint: undefined,
            language,
            dependencies: templateDetails?.deps,
        }));

        const userMessage = images && images.length > 0
            ? createMultiModalUserMessage(
                `CLIENT REQUEST: "${query}"`,
                await imagesToBase64(env, images), 
                'high'
              )
            : createUserMessage(`CLIENT REQUEST: "${query}"`);

        const messages = [
            systemPromptMessage,
            userMessage
        ];

        const { object: results } = await executeInference({
            env,
            messages,
            agentActionName: "blueprint",
            schema,
            context: inferenceContext,
            stream,
        });

        // Filter out PDF files from phasic blueprints
        if (results && !isAgentic) {
            const phasicResults = results as PhasicBlueprint;
            phasicResults.initialPhase.files = phasicResults.initialPhase.files.filter(f => !f.path.endsWith('.pdf'));
        }

        return results as PhasicBlueprint | AgenticBlueprint;
    } catch (error) {
        logger.error("Error generating blueprint:", error);
        throw error;
    }
}
