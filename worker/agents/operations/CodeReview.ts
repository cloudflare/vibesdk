import { CodeReviewOutputType, CodeReviewOutput , FileOutputSchema } from '../schemas';
import { GenerationContext } from '../domain/values/GenerationContext';
import { IssueReport } from '../domain/values/IssueReport';
import { createSystemMessage, createUserMessage } from '../inferutils/common';
import { executeInference } from '../inferutils/infer';
import { generalSystemPromptBuilder, issuesPromptFormatter, PROMPT_UTILS } from '../prompts';
import { TemplateRegistry } from '../inferutils/schemaFormatters';
import { z } from 'zod';
import { AgentOperation, OperationOptions } from '../operations/common';

export interface CodeReviewInputs {
    issues: IssueReport
}

const SYSTEM_PROMPT = `You are a Senior Software Engineer at Cloudflare specializing in comprehensive React application analysis. Your mandate is to identify ALL critical issues across the ENTIRE codebase that could impact functionality, user experience, or deployment.

## COMPREHENSIVE ISSUE DETECTION PRIORITIES:

### 1. REACT RENDER LOOPS & INFINITE LOOPS (CRITICAL)
**IMMEDIATELY FLAG THESE PATTERNS:**
- "Maximum update depth exceeded" errors
- "Too many re-renders" warnings  
- useEffect without dependency arrays that set state
- State updates during render phase
- Unstable object/array dependencies in hooks
- Infinite loops in event handlers or calculations

### 2. RUNTIME ERRORS & CRASHES (CRITICAL)
- Undefined/null variable access without proper guards
- Import/export mismatches and missing imports
- TypeScript compilation errors
- Missing error boundaries around components
- Unhandled promise rejections

### 3. LOGIC ERRORS & BROKEN FUNCTIONALITY (HIGH)
- Incorrect business logic implementation
- Wrong conditional statements or boolean logic
- Incorrect data transformations or calculations
- State management bugs (stale closures, race conditions)
- Event handlers not working as expected
- Form validation logic errors

### 4. UI RENDERING & LAYOUT ISSUES (HIGH)
- Components not displaying correctly
- CSS layout problems (flexbox, grid issues)
- Responsive design breaking at certain breakpoints
- Missing or incorrect styling classes
- Accessibility violations (missing alt text, ARIA labels)
- Loading states and error states not implemented

### 5. DATA FLOW & STATE MANAGEMENT (MEDIUM-HIGH)
- Props drilling where context should be used
- Incorrect state updates (mutating state directly)
- Missing state synchronization between components
- Inefficient re-renders due to poor state structure
- Missing loading/error states for async operations

### 6. INCOMPLETE FEATURES & MISSING FUNCTIONALITY (MEDIUM)
- Placeholder components that need implementation
- TODO comments indicating missing functionality
- Incomplete API integrations
- Missing validation or error handling
- Unfinished user flows or navigation

### 7. STALE ERROR FILTERING
**IGNORE these if no current evidence in codebase:**
- Errors mentioning files that don't exist in current code
- Errors about components/functions that have been removed
- Errors with timestamps older than recent changes

## COMPREHENSIVE ANALYSIS METHOD:
1. **Scan ENTIRE codebase systematically** - don't just focus on reported errors
2. **Analyze each component for completeness** - check if features are fully implemented
3. **Cross-reference errors with current code** - validate issues exist
4. **Check data flow and state management** - ensure proper state handling
5. **Review UI/UX implementation** - verify user experience is correct
6. **Validate business logic** - ensure functionality works as intended
7. **Provide actionable, specific fixes** - not general suggestions

${PROMPT_UTILS.COMMANDS}

## COMMON PATTERNS TO AVOID:
${PROMPT_UTILS.COMMON_PITFALLS}
${PROMPT_UTILS.REACT_RENDER_LOOP_PREVENTION} 

<CLIENT REQUEST>
"{{query}}"
</CLIENT REQUEST>

<DEPENDENCIES>
These are the dependencies that came installed in the environment:
{{dependencies}}

If anything else is used in the project, make sure it is installed in the environment
</DEPENDENCIES>

{{template}}`;

// Open question: Do we need to pass blueprint to code reviewer?

const USER_PROMPT = `
<REPORTED_ISSUES>
{{issues}}
</REPORTED_ISSUES>

<CURRENT_CODEBASE>
{{context}}
</CURRENT_CODEBASE>

<ANALYSIS_INSTRUCTIONS>
**Step 1: Filter Stale Errors**
- Compare reported errors against current codebase
- SKIP errors mentioning files/components that no longer exist
- SKIP errors that don't match current code structure

**Step 2: Prioritize React Render Loops**
- Search for "Maximum update depth exceeded" patterns
- Look for useEffect without dependencies that modify state
- Identify unstable object/array references in hooks
- Flag setState calls during render phase

**Step 3: Comprehensive Codebase Analysis**
- Scan each file for logic errors and broken functionality
- Check UI components for rendering and layout issues
- Validate state management patterns and data flow
- Identify incomplete features and missing implementations
- Review error handling and loading states

**Step 4: Business Logic Validation**
- Verify conditional logic and calculations are correct
- Check form validation and user input handling
- Ensure API calls and data transformations work properly
- Validate user flows and navigation patterns

**Step 5: UI/UX Issue Detection**
- Check for broken layouts and styling issues
- Identify missing responsive design implementations
- Find accessibility violations and missing states
- Validate component props and data binding

**Step 6: Provide Parallel-Ready File Fixes**
IMPORTANT: Your output will be used to run PARALLEL FileRegeneration operations - one per file. Structure your findings accordingly:

- **Group issues by file path** - each file will be fixed independently
- **Make each file's issues self-contained** - don't reference other files in the fix
- **Avoid cross-file dependencies** in fixes - each file must be fixable in isolation
- **Provide complete context per file** - include all necessary details for that file

For each file with issues, provide:
- **FILE:** [exact file path]
- **ISSUES:** [List of specific issues in this file only]
- **PRIORITY:** Critical/High/Medium (for this file)
- **FIX_SCOPE:** [What needs to be changed in this specific file]

**PARALLEL OPERATION CONSTRAINTS:**
- Each file will be processed by a separate FileRegeneration agent
- Agents cannot communicate with each other during fixes
- All issues for a file must be fixable without knowing other files' changes
- Avoid fixes that require coordinated changes across multiple files
- If a cross-file issue exists, break it down into independent file-specific fixes

**ANALYSIS SCOPE:**
- Analyze ALL files in the codebase systematically
- Group discovered issues by the file they occur in
- Ensure each file's issues are complete and self-contained
- Prioritize issues that can be fixed independently
- Flag any issues requiring coordinated multi-file changes separately
</ANALYSIS_INSTRUCTIONS>`;

const userPromptFormatter = (issues: IssueReport, context: string) => {
    const prompt = USER_PROMPT
        .replaceAll('{{issues}}', issuesPromptFormatter(issues))
        .replaceAll('{{context}}', context);
    return PROMPT_UTILS.verifyPrompt(prompt);
}

export class CodeReviewOperation extends AgentOperation<CodeReviewInputs, CodeReviewOutputType> {
    async execute(
        inputs: CodeReviewInputs,
        options: OperationOptions
    ): Promise<CodeReviewOutputType> {
        const { issues } = inputs;
        const { env, logger, context } = options;
        
        logger.info("Performing code review");
        logger.info("Running static code analysis via linting...");

        // Log all types of issues for comprehensive analysis
        if (issues.runtimeErrors.length > 0) {
            logger.info(`Found ${issues.runtimeErrors.length} runtime errors: ${issues.runtimeErrors.map(e => e.message).join(', ')}`);
        }
        if (issues.staticAnalysis.lint.issues.length > 0) {
            logger.info(`Found ${issues.staticAnalysis.lint.issues.length} lint issues`);
        }
        if (issues.staticAnalysis.typecheck.issues.length > 0) {
            logger.info(`Found ${issues.staticAnalysis.typecheck.issues.length} typecheck issues`);
        }
        
        logger.info("Performing comprehensive codebase analysis for all issue types (runtime, logic, UI, state management, incomplete features)");

        // Get files context
        const filesContext = getFilesContext(context);

        const messages = [
            createSystemMessage(generalSystemPromptBuilder(SYSTEM_PROMPT, {
                query: context.query,
                blueprint: context.blueprint,
                templateDetails: context.templateDetails,
                dependencies: context.dependencies,
            })),
            createUserMessage(userPromptFormatter(issues, filesContext)),
        ];

        try {
            const { object: reviewResult } = await executeInference({
                env: env,
                messages,
                schema: CodeReviewOutput,
                agentActionName: "codeReview",
                context: options.inferenceContext,
                reasoning_effort: issues.runtimeErrors.length || issues.staticAnalysis.lint.issues.length || issues.staticAnalysis.typecheck.issues.length > 0 ? undefined : 'low',
                // format: 'markdown'
            });

            if (!reviewResult) {
                throw new Error("Failed to get code review result");
            }
            return reviewResult;
        } catch (error) {
            logger.error("Error during code review:", error);
            throw error;
        }
    }
}

/**
 * Get files context for review
 */
function getFilesContext(context: GenerationContext): string {
    const files = context.allFiles;
    const filesObject = { files };

    return TemplateRegistry.markdown.serialize(
        filesObject,
        z.object({
            files: z.array(FileOutputSchema)
        })
    );
}