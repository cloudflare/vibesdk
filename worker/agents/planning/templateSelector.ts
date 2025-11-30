import { createSystemMessage, createUserMessage, createMultiModalUserMessage } from '../inferutils/common';
import { TemplateInfo } from '../../services/sandbox/sandboxTypes';
import { createLogger } from '../../logger';
import { executeInference } from '../inferutils/infer';
import { InferenceContext } from '../inferutils/config.types';
import { RateLimitExceededError, SecurityError } from 'shared/types/errors';
import { TemplateSelection, TemplateSelectionSchema, ProjectTypePredictionSchema } from '../../agents/schemas';
import { generateSecureToken } from 'worker/utils/cryptoUtils';
import type { ImageAttachment } from '../../types/image-attachment';
import { ProjectType } from '../core/types';

const logger = createLogger('TemplateSelector');
interface SelectTemplateArgs {
    env: Env;
    query: string;
    projectType?: ProjectType | 'auto';
    availableTemplates: TemplateInfo[];
    inferenceContext: InferenceContext;
    images?: ImageAttachment[];
}

/**
 * Predicts the project type from the user query
 */
async function predictProjectType(
    env: Env,
    query: string,
    inferenceContext: InferenceContext,
    images?: ImageAttachment[]
): Promise<ProjectType> {
    try {
        logger.info('Predicting project type from query', { queryLength: query.length });

        const systemPrompt = `You are an Expert Project Type Classifier at Cloudflare. Your task is to analyze user requests and determine what type of project they want to build.

## PROJECT TYPES:

**app** - Full-stack web applications
- Interactive websites with frontend and backend
- Dashboards, games, social platforms, e-commerce sites
- Any application requiring user interface and interactivity
- Examples: "Build a todo app", "Create a gaming dashboard", "Make a blog platform"

**workflow** - Backend workflows and APIs
- Server-side logic without UI
- API endpoints, cron jobs, webhooks
- Data processing, automation tasks
- Examples: "Create an API to process payments", "Build a webhook handler", "Automate data sync"

**presentation** - Slides and presentation decks
- Slide-based content for presentations
- Marketing decks, pitch decks, educational slides
- Visual storytelling with slides
- Examples: "Create slides about AI", "Make a product pitch deck", "Build a presentation on climate change"

**general** - From-scratch content or mixed artifacts
- Docs/notes/specs in Markdown/MDX, or a slide deck initialized later
- Start with docs when users ask for write-ups; initialize slides if explicitly requested or clearly appropriate
- No sandbox/runtime unless slides/app are initialized by the builder
- Examples: "Write a spec", "Draft an outline and slides if helpful", "Create teaching materials"

## RULES:
- Default to 'app' when uncertain
- Choose 'workflow' only when explicitly about APIs, automation, or backend-only tasks
- Choose 'presentation' only when explicitly about slides, decks, or presentations
- Choose 'general' for docs/notes/specs or when the user asks to start from scratch without a specific runtime template
- Consider the presence of UI/visual requirements as indicator for 'app'
- High confidence when keywords are explicit, medium/low when inferring`;

        const userPrompt = `**User Request:** "${query}"

**Task:** Determine the project type and provide:
1. Project type (app, workflow, presentation, or general)
2. Reasoning for your classification
3. Confidence level (high, medium, low)

Analyze the request carefully and classify accordingly.`;

        const userMessage = images && images.length > 0
            ? createMultiModalUserMessage(
                userPrompt,
                images.map(img => `data:${img.mimeType};base64,${img.base64Data}`),
                'high'
              )
            : createUserMessage(userPrompt);

        const messages = [
            createSystemMessage(systemPrompt),
            userMessage
        ];

        const { object: prediction } = await executeInference({
            env,
            messages,
            agentActionName: "templateSelection", // Reuse existing agent action
            schema: ProjectTypePredictionSchema,
            context: inferenceContext,
            maxTokens: 500,
        });

        logger.info(`Predicted project type: ${prediction.projectType} (${prediction.confidence} confidence)`, {
            reasoning: prediction.reasoning
        });

        return prediction.projectType;

    } catch (error) {
        logger.error("Error predicting project type, defaulting to 'app':", error);
        return 'app';
    }
}

/**
 * Generates appropriate system prompt based on project type
 */
function getSystemPromptForProjectType(projectType: ProjectType): string {
    if (projectType === 'app') {
        // Keep the detailed, original prompt for apps
        return `You are an Expert Software Architect at Cloudflare specializing in template selection for rapid development. Your task is to select the most suitable starting template based on user requirements.

## SELECTION EXAMPLES:

**Example 1 - Game Request:**
User: "Build a 2D puzzle game with scoring"
Templates: ["react-dashboard", "react-game-starter", "vue-blog"]
Selection: "react-game-starter"
complexity: "simple"
Reasoning: "Game starter template provides canvas setup, state management, and scoring systems"

**Example 2 - Business Dashboard:**
User: "Create an analytics dashboard with charts"
Templates: ["react-dashboard", "nextjs-blog", "vanilla-js"]
Selection: "react-dashboard"
complexity: "simple" // Because single page application
Reasoning: "Dashboard template includes chart components, grid layouts, and data visualization setup"

**Example 3 - No Perfect Match:**
User: "Build a recipe sharing app"
Templates: ["react-social", "vue-blog", "angular-todo"]
Selection: "react-social"
complexity: "simple" // Because single page application
Reasoning: "Social template provides user interactions, content sharing, and community features closest to recipe sharing needs"

## SELECTION CRITERIA:
1. **Feature Alignment** - Templates with similar core functionality
2. **Tech Stack Match** - Compatible frameworks and dependencies  
3. **Architecture Fit** - Similar application structure and patterns
4. **Minimal Modification** - Template requiring least changes

## STYLE GUIDE:
- **Minimalist Design**: Clean, simple interfaces
- **Brutalism**: Bold, raw, industrial aesthetics
- **Retro**: Vintage, nostalgic design elements
- **Illustrative**: Rich graphics and visual storytelling
- **Kid_Playful**: Colorful, fun, child-friendly interfaces
- **Custom**: Design that doesn't fit any of the above categories

## RULES:
- ALWAYS select a template (never return null)
- Ignore misleading template names - analyze actual features
- **ONLY** Choose from the list of available templates
- Focus on functionality over naming conventions
- Provide clear, specific reasoning for selection`;
    }

    // Simpler, more general prompts for workflow and presentation
    return `You are an Expert Template Selector at Cloudflare. Your task is to select the most suitable ${projectType} template based on user requirements.

## PROJECT TYPE: ${projectType.toUpperCase()}

## SELECTION CRITERIA:
1. **Best Match** - Template that best fits the user's requirements
2. **Feature Alignment** - Templates with relevant functionality
3. **Minimal Modification** - Template requiring least customization

## RULES:
- ALWAYS select a template from the available list
- Analyze template descriptions carefully
- **ONLY** Choose from the provided templates
- Provide clear reasoning for your selection`;
}

/**
 * Uses AI to select the most suitable template for a given query.
 */
export async function selectTemplate({ env, query, projectType, availableTemplates, inferenceContext, images }: SelectTemplateArgs, retryCount: number = 3): Promise<TemplateSelection> {
    // Step 1: Predict project type if 'auto'
    const actualProjectType: ProjectType = projectType === 'auto'
        ? await predictProjectType(env, query, inferenceContext, images)
        : (projectType || 'app') as ProjectType;
    
    availableTemplates = availableTemplates.filter(t => !t.disabled && !t.name.includes('minimal'));
    logger.info(`Using project type: ${actualProjectType}${projectType === 'auto' ? ' (auto-detected)' : ''}`);

    // Step 2: Filter templates by project type
    const filteredTemplates = projectType === 'general' ? availableTemplates : availableTemplates.filter(t => t.projectType === actualProjectType);
    
    if (filteredTemplates.length === 0) {
        logger.warn(`No templates available for project type: ${actualProjectType}`);
        return { 
            selectedTemplateName: null, 
            reasoning: `No templates were available for project type: ${actualProjectType}`, 
            useCase: null, 
            complexity: null, 
            styleSelection: null, 
            projectType: actualProjectType
        };
    }

    // Step 3: Skip template selection if only 1 template for workflow/presentation
    if ((actualProjectType === 'workflow' || actualProjectType === 'presentation') && filteredTemplates.length === 1) {
        logger.info(`Only one ${actualProjectType} template available, auto-selecting: ${filteredTemplates[0].name}`);
        return {
            selectedTemplateName: filteredTemplates[0].name,
            reasoning: `Auto-selected the only available ${actualProjectType} template`,
            useCase: 'General',
            complexity: 'simple',
            styleSelection: null,
            projectType: actualProjectType
        };
    }

    try {
        logger.info(`Asking AI to select a template for the ${retryCount} time`, { 
            query, 
            projectType: actualProjectType,
            queryLength: query.length,
            imagesCount: images?.length || 0,
            availableTemplates: filteredTemplates.map(t => t.name),
            templateCount: filteredTemplates.length 
        });

        const validTemplateNames = filteredTemplates.map(t => t.name);

        const templateDescriptions = filteredTemplates.map((t, index) =>
            `### Template #${index + 1} \n Name - ${t.name} \n Language: ${t.language}, Frameworks: ${t.frameworks?.join(', ') || 'None'}\n Description: \`\`\`${t.description.selection}\`\`\``
        ).join('\n\n');

        // Step 4: Perform AI-based template selection
        const systemPrompt = getSystemPromptForProjectType(actualProjectType as ProjectType)

        const userPrompt = `**User Request:** "${query}"

## **Available Templates:**
**ONLY** These template names are available for selection: ${validTemplateNames.join(', ')}

Template detail: ${templateDescriptions}

**Task:** Select the most suitable template and provide:
1. Template name (exact match from list)
2. Clear reasoning for why it fits the user's needs
${actualProjectType === 'app' ? '3. Appropriate style for the project type. Try to come up with unique styles that might look nice and unique. Be creative about your choices. But don\'t pick brutalist all the time.' : ''}

Analyze each template's features, frameworks, and architecture to make the best match.
${images && images.length > 0 ? `\n**Note:** User provided ${images.length} image(s) - consider visual requirements and UI style from the images.` : ''}

ENTROPY SEED: ${generateSecureToken(64)} - for unique results`;

        const userMessage = images && images.length > 0
            ? createMultiModalUserMessage(
                userPrompt,
                images.map(img => `data:${img.mimeType};base64,${img.base64Data}`),
                'high'
              )
            : createUserMessage(userPrompt);

        const messages = [
            createSystemMessage(systemPrompt),
            userMessage
        ];

        const { object: selection } = await executeInference({
            env,
            messages,
            agentActionName: "templateSelection",
            schema: TemplateSelectionSchema,
            context: inferenceContext,
            maxTokens: 2000,
        });

        if (!selection) {
            logger.error('Template selection returned no result after all retries');
            throw new Error('Failed to select template: inference returned null');
        }

        logger.info(`AI template selection result: ${selection.selectedTemplateName || 'None'}, Reasoning: ${selection.reasoning}`);
        
        // Ensure projectType is set correctly
        return {
            ...selection,
            projectType: actualProjectType
        };

    } catch (error) {
        logger.error("Error during AI template selection:", error);
        if (error instanceof RateLimitExceededError || error instanceof SecurityError) {
            throw error;
        }

        if (retryCount > 0) {
            return selectTemplate({ env, query, projectType, availableTemplates, inferenceContext, images }, retryCount - 1);
        }
        // Fallback to no template selection in case of error
        return { selectedTemplateName: null, reasoning: "An error occurred during the template selection process.", useCase: null, complexity: null, styleSelection: null, projectType: actualProjectType };
    }
}
