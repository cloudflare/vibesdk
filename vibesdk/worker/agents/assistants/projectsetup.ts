import { TemplateDetails } from "../../services/sandbox/sandboxTypes";
import { SetupCommandsType, type Blueprint } from "../schemas";
import { createObjectLogger, StructuredLogger } from '../../logger';
import { generalSystemPromptBuilder, PROMPT_UTILS } from '../prompts';
import { createAssistantMessage, createSystemMessage, createUserMessage } from "../inferutils/common";
import { executeInference, } from "../inferutils/infer";
import Assistant from "./assistant";
import { AIModels, InferenceContext } from "../inferutils/config.types";
import { extractCommands } from "../utils/common";

interface GenerateSetupCommandsArgs {
    env: Env;
    agentId: string;
    query: string;
    blueprint: Blueprint;
    template: TemplateDetails;
    inferenceContext: InferenceContext;
}

const SYSTEM_PROMPT = `You are an Expert DevOps Engineer at Cloudflare specializing in project setup and dependency management. Your task is to analyze project requirements and generate precise installation commands for missing dependencies.`

const SETUP_USER_PROMPT = `## TASK
Analyze the blueprint and generate exact \`bun add\` commands for missing dependencies. Only suggest packages that are NOT already in the starting template.

## EXAMPLES

**Example 1 - Game Project:**
Blueprint mentions: "2D Canvas game with score persistence"
Starting template has: react, typescript, tailwindcss
Output:
\`\`\`bash
bun add zustand@^4.5.0
bun add canvas-confetti@^1.9.0
\`\`\`

**Example 2 - Dashboard with Charts:**
Blueprint mentions: "Analytics dashboard with interactive charts"
Starting template has: react, typescript, vite
Output:
\`\`\`bash
bun add recharts@^2.12.0
bun add date-fns@^3.6.0
bun add @headlessui/react@^2.0.0
\`\`\`

**Example 3 - Already Complete:**
Blueprint mentions: "Simple todo app"
Starting template has: react, typescript, tailwindcss, lucide-react
Output:
\`\`\`bash
# No additional dependencies needed
\`\`\`

## RULES
- Use ONLY \`bun add\` commands
- Include specific version constraints (e.g., ^4.5.0)
- Check version compatibility (React 18 vs 19)
- Skip dependencies already in starting template
- Include common companion packages when needed
- Focus on blueprint requirements only
- cloudflare:workers is not needed, it's already installed

**Do not recommend installing \`cloudflare:workers\` or \`cloudflare:durable-objects\` as dependencies, these are already installed in the project always.**

${PROMPT_UTILS.COMMANDS}

<INPUT DATA>
<QUERY>
{{query}}
</QUERY>

<BLUEPRINT>
{{blueprint}}
</BLUEPRINT>

<STARTING TEMPLATE>
{{template}}

These are the only dependencies installed currently
{{dependencies}}
</STARTING TEMPLATE>

You need to make sure **ALL THESE** are installed at the least:
{{blueprintDependencies}}

</INPUT DATA>`;

export class ProjectSetupAssistant extends Assistant<Env> {
    private query: string;
    private logger: StructuredLogger;
    
    constructor({
        env,
        inferenceContext,
        query,
        blueprint,
        template,
    }: GenerateSetupCommandsArgs) {
        const systemPrompt = createSystemMessage(SYSTEM_PROMPT);
        super(env, inferenceContext, systemPrompt);
        this.save([createUserMessage(generalSystemPromptBuilder(SETUP_USER_PROMPT, {
            query,
            blueprint,
            templateDetails: template,
            dependencies: template.deps,
        }))]);
        this.query = query;
        this.logger = createObjectLogger(this, 'ProjectSetupAssistant')
    }

    async generateSetupCommands(error?: string): Promise<SetupCommandsType> {
        this.logger.info("Generating setup commands", { query: this.query, queryLength: this.query.length });
    
        try {
            let userPrompt = createUserMessage(`Now please suggest required setup commands for the project, inside markdown code fence`);
            if (error) {
                this.logger.info(`Regenerating setup commands after error: ${error}`);
                userPrompt = createUserMessage(`Some of the previous commands you generated might not have worked. Please review these and generate new commands if required, maybe try a different version or correct the name?
If the package simply doesn't exist, please don't suggest it. 
                    
${error}`);
                this.logger.info(`Regenerating setup commands with new prompt: ${userPrompt.content}`);
            }
            const messages = this.save([userPrompt]);

            const results = await executeInference({
                env: this.env,
                messages,
                agentActionName: "projectSetup",
                context: this.inferenceContext,
                modelName: error? AIModels.GEMINI_2_5_FLASH : undefined,
            });

            if (!results || !results.string) {
                this.logger.error('Project setup returned no result after all retries');
                throw new Error('Failed to generate setup commands: inference returned null');
            }

            this.logger.info(`Generated setup commands: ${results.string}`);

            this.save([createAssistantMessage(results.string)]);
            return { commands: extractCommands(results.string) };
        } catch (error) {
            this.logger.error("Error generating setup commands:", error);
            throw error;
        }
    }
}