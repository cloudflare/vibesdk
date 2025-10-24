import { TemplateDetails } from "../../services/sandbox/sandboxTypes";
import { createAssistantMessage, createSystemMessage, createUserMessage } from "../inferutils/common";
import { FileOutputType, PhaseConceptType } from "../schemas";
import { CodeSerializerType } from "../utils/codeSerializers";
import { createObjectLogger } from "../../logger";
import { executeInference } from "../inferutils/infer";
import { PROMPT_UTILS } from "../prompts";
import Assistant from "./assistant";
import { applySearchReplaceDiff } from "../output-formats/diff-formats";
import { infer } from "../inferutils/core";
import { MatchingStrategy, FailedBlock } from "../output-formats/diff-formats/search-replace";
import { AgentActionKey, AIModels, InferenceContext } from "../inferutils/config.types";
import { AGENT_CONFIG } from "../inferutils/config";
// import { analyzeTypeScriptFile } from "../../services/code-fixer/analyzer";

// Constants for magic numbers
const DEFAULT_PASSES = 5;
const MAX_RETRIES = 3;
const FUZZY_THRESHOLD = 0.87;

export interface RealtimeCodeFixerContext {
    previousFiles?: FileOutputType[];
    query: string;
    template: TemplateDetails;
}

const SYSTEM_PROMPT = `You are a seasoned, highly experienced code inspection officer and senior full-stack engineer specializing in React and TypeScript. Your task is to review and verify if the provided TypeScript code file wouldn't cause any runtime infinite rendering loops or critical failures, and provide fixes if any. 
You would only be provided with a single file to review at a time. You are to simulate its runtime behavior and analyze it for listed issues. Your analysis should be thorough but concise, focusing on critical issues and effective fixes.`
/*
<previous_files>
{{previousFiles}}
</previous_files>


 */
const USER_PROMPT = `================================
Here is some relevant context:
<user_query>
{{query}}
</user_query>

Current project phase **being implemented:**
{{phaseConcept}}

================================

Here's the file you need to review:
<file_to_review>
<file_info>
Path: {{filePath}}
Purpose: {{filePurpose}}
</file_info>

<fileContents>
{{fileContents}}
</fileContents>

{{issues}}

You are only provided with this file to review. Assume all imports are correct and exist.
Please ignore the formatting, indentation, spacing and comments.
</file_to_review>

Review Process:
1. Review **THE FILE PROVIDED FOR REVIEW** i.e <file_to_review>.
2. Analyze the code structure, components, and dependencies.
3. Check code for **only these** critical issues in this priority order:
   a. "Maximum update depth exceeded" errors or infinite rendering loops
      - setState called during render: setCount(count + 1) in component body
      - useEffect without dependencies: useEffect(() => setState(...))
      - Object dependencies in useEffect: useEffect(..., [objectRef])
      - Zustand selector anti-patterns that cause unstable references:
        - Object-literal selectors with destructuring: const { a, b } = useStore((s) => ({ a: s.a, b: s.b }))
        - Fix required: select primitives individually with separate useStore(...) calls for each value
   b. Import/Export integrity errors
      - @xyflow/react: Must use { ReactFlow }, not default import
      - Missing @/lib/utils import for cn function
      - Components not properly exported
   c. Undefined variable access that causes runtime crashes
      - user.name without user?.name check
      - array.map without array?.length check
      - Accessing properties of undefined objects
   d. Syntax errors and JSX/TSX tag mismatches
   e. Tailwind class errors (border-border instead of border)
   f. Duplicate definitions
   g. Nested Router components
   h. UI rendering and alignment issues
   i. Incomplete code
   j. Logical issues in business logic

4. Pay special attention to React hooks, particularly useEffect, to prevent infinite loops or excessive re-renders.
5. For each issue, provide a fix that addresses the problem without altering existing behavior, definitions, or parameters.
6. Check if critical well known external imports are correct - for example 'React' being undefined or 'useEffect' being undefined.
7. Assume all internal imports are correct and exist. Do not modify imported code, and assume it's behavior from patterns.
8. If you lack context about a part of the code, do not modify it.
9. Ignore indentation, spacing, comments, unused imports/variables/functions, or any code that doesn't affect the functionality of the file. No need to waste time on such things.
10. If a change wouldn't fix anything or change any behaviour, i.e, its unnecessary, Don't suggest it.

Before providing fixes, conduct your analysis in <code_review> tags inside your thinking block. Be concise but thorough:

<code_review>
1. Code structure and components
   - List key components and their purposes
2. Critical issues identified:
   - For each issue, write out the problematic code snippet
3. React hooks analysis:
   - For each useEffect, list out its dependencies
4. Proposed fixes rationale
</code_review>

After your analysis, format each fix as follows:

<fix>
# Brief, one-line comment on the issue

\`\`\`
<<<<<<< SEARCH
[exact lines from current file]
=======
[your intended replacement]
>>>>>>> REPLACE
\`\`\`

# Brief, one-line comment on the fix
</fix>

Important reminders:
- Include all necessary fixes in your output.
- Only provide fixes for the file provided for review i.e <file_to_review>.
- The SEARCH section must exactly match a unique existing block of lines, including white space.
- **Every SEARCH section should be followed by a REPLACE section. The SEARCH section begins with <<<<<<< SEARCH and ends with ===== after which the REPLACE section automatically begins and ends with >>>>>>> REPLACE.**
- Assume internal imports (like shadcn components or ErrorBoundaries) exist.
- Please ignore non functional or non critical issues. You are not doing a code quality check, You are performing code validation and issues that can cause runtime errors.
- Pay extra attention to potential "Maximum update depth exceeded" errors, runtime error causing bugs, JSX/TSX Tag mismatches, logical issues and issues that can cause misalignment of UI components.
- Do not suggest changes about stuff that you are not given context about, and might break downstream code. 

If no issues are found, return a blank response.

Your final output should consist only of the fixes formatted as shown, without duplicating or rehashing any of the work you did in the code review section.
{{appendix}}`

const EXTRA_JSX_SPECIFIC =`
<appendix>
The most important class of errors is the "Maximum update depth exceeded" error which you definitely need to identify and fix. 
${PROMPT_UTILS.REACT_RENDER_LOOP_PREVENTION}
</appendix>
`;

const DIFF_FIXER_PROMPT = `You made mistakes in generating the diffs and they failed to match. You need to regenerate them properly.

{{failedBlocksCount}} SEARCH/REPLACE block(s) failed to match!

{{failedBlocks}}

The SEARCH section must exactly match an existing block of lines including all white space, comments, indentation, docstrings, etc.

# The other {{successfulBlocksCount}} SEARCH/REPLACE blocks were applied successfully.
Don't re-send them. Just reply with fixed versions of the failed blocks.

CRITICAL REQUIREMENTS:
- The SEARCH section must EXACTLY match existing lines in the current file
- Include all whitespace, comments, indentation exactly as they appear
- Find the exact text that exists NOW (after successful blocks were applied)
- Don't change the intended functionality of the REPLACE section
- You may make additional fixes if needed to the current content

Just reply with the corrected SEARCH/REPLACE blocks in this format:

<<<<<<< SEARCH
[exact lines from current file]
=======
[your intended replacement]
>>>>>>> REPLACE`

const userPromptFormatter = (user_prompt: string, query: string, file: FileOutputType, previousFiles?: FileOutputType[], currentPhase?: PhaseConceptType, issues?: string[]) => {
    const variables: Record<string, string> = {
        query,
        previousFiles: previousFiles ? PROMPT_UTILS.serializeFiles(previousFiles, CodeSerializerType.SIMPLE) : '',
        filePath: file.filePath,
        filePurpose: file.filePurpose,
        fileContents: file.fileContents,
        phaseConcept: currentPhase ? `
Current project phase overview:
<current_phase>
${JSON.stringify(currentPhase, null, 2)}
</current_phase>` : '',
        issues: issues ? `
<issues>
Here are some issues that were found via static analysis. These may or may not be false positives:
${issues.join('\n')}
</issues>` : '',
        appendix: (file.filePath.endsWith('.tsx') || file.filePath.endsWith('.jsx')) ? EXTRA_JSX_SPECIFIC : ''
    };
    
    const prompt = PROMPT_UTILS.replaceTemplateVariables(user_prompt, variables);
    return PROMPT_UTILS.verifyPrompt(prompt);
}

const diffPromptFormatter = (currentContent: string, failedBlocks: string, failedBlocksCount: number, successfulBlocksCount: number) => {
    const prompt = PROMPT_UTILS.replaceTemplateVariables(DIFF_FIXER_PROMPT, {
        currentContent,
        failedBlocks,
        failedBlocksCount: failedBlocksCount.toString(),
        successfulBlocksCount: successfulBlocksCount.toString()
    });
    return PROMPT_UTILS.verifyPrompt(prompt);
}

export class RealtimeCodeFixer extends Assistant<Env> {
    logger = createObjectLogger(this, 'RealtimeCodeFixer');
    lightMode: boolean;
    altPassModelOverride?: string;
    userPrompt: string;
    systemPrompt: string;
    agentActionNameOverride?: AgentActionKey;

    constructor(
        env: Env,
        inferenceContext: InferenceContext,
        lightMode: boolean = false,
        altPassModelOverride?: string,// = AIModels.GEMINI_2_5_FLASH,
        agentActionNameOverride?: AgentActionKey,
        systemPrompt: string = SYSTEM_PROMPT,
        userPrompt: string = USER_PROMPT
    ) {
        super(env, inferenceContext);
        this.lightMode = lightMode;
        this.altPassModelOverride = altPassModelOverride;
        this.agentActionNameOverride = agentActionNameOverride;
        this.userPrompt = userPrompt;
        this.systemPrompt = systemPrompt;
    }

    async run(
        generatedFile: FileOutputType,
        context: RealtimeCodeFixerContext,
        currentPhase?: PhaseConceptType,
        issues: string[] = [],
        passes: number = DEFAULT_PASSES
    ): Promise<FileOutputType> {
        try {
            // Ignore css or json files or *.config.js
            if (generatedFile.filePath.endsWith('.css') || generatedFile.filePath.endsWith('.json') || generatedFile.filePath.endsWith('.config.js')) {
                this.logger.info(`Skipping realtime code fixer for file: ${generatedFile.filePath}`);
                return generatedFile;
            }
            
            let content = generatedFile.fileContents;

            this.save([createSystemMessage(this.systemPrompt)]);

            const startTime = Date.now();
            let searchBlocks = -1;
            let i = 0;
            while (searchBlocks !== 0 && i < passes) {
                // Do a static analysis of the file
                // const analysis = await analyzeTypeScriptFile(generatedFile.filePath, content);
                // issues = [...issues, ...analysis.issues.map(issue => JSON.stringify(issue, null, 2))];
                this.logger.info(`Running realtime code fixer for file: ${generatedFile.filePath} (pass ${i + 1}/${passes}), issues: ${JSON.stringify(issues, null, 2)}`);
                const messages = this.save([
                    i === 0 ? createUserMessage(userPromptFormatter(this.userPrompt, context.query, generatedFile, context.previousFiles, currentPhase, issues)) : 
                    createUserMessage(`
Please quickly re-review the entire code for another pass to ensure there are no **critical** issues or bugs remaining and there are no weird unapplied changes or residues (e.g, malformed search/replace blocks or diffs).
**Look out for serious issues that can cause runtime errors, rendering issues, logical bugs, or things that got broken by previous fixes**
**Indentations do not cause issues, Please ignore indentation issues**
**Thoroughly look for \`Maximum update depth exceeded\` and other issues that can crash the app on priority**
**No need to be verbose or descriptive if you dont see any issues! We need to commit this file as soon as possible so don't waste time nit-picking! But it shouldn't break at any cost!**

\`\`\`
${content}
\`\`\`

If you think the file is corrupted or too broken, you can completely rewrite it from scratch and provide the raw code inside the commented out <content> tags as follows:
\`\`\`
//<content>
...raw, full code...
//</content>
\`\`\`
**MAKE SURE TO COMMENT THE TAGS AND THERE SHOULD ONLY BE ONE <content> TAG AND IT SHOULD BE CLOSED PROPERLY BY </content> TAG**
This would completely replace the original file contents. Otherwise if you just want to add more patches, You can use the SEARCH-REPLACE blocks as previously described.
Don't be nitpicky, If there are no actual issues, just say "No issues found".
`),
                ]);

                const fixResult = await executeInference({
                    env: this.env,
                    agentActionName: this.agentActionNameOverride ?? "realtimeCodeFixer",
                    context: this.inferenceContext,
                    messages,
                    modelName: (i !== 0 && this.altPassModelOverride) || this.lightMode ? this.altPassModelOverride : undefined,
                    temperature: (i !== 0 && this.altPassModelOverride) || this.lightMode ? 0.0 : undefined,
                    reasoning_effort: (i !== 0 && this.altPassModelOverride) || this.lightMode ? 'low' : undefined,
                });

                if (!fixResult) {
                    this.logger.warn(`Realtime code fixer returned no fix for file: ${generatedFile.filePath}`);
                    return generatedFile;
                }

                this.save([createAssistantMessage(fixResult.string)]);

                if (fixResult.string.includes('<content>')) {
                    // Complete rewrite, extract content between tags
                    const contentMatch = fixResult.string.match(/<content>([\s\S]*?)<\/content>/);
                    if (contentMatch) {
                        content = contentMatch[1].trim();
                    }
                    searchBlocks = 0;
                    continue;
                }
                
                // Search the number of search blocks in fixResult
                searchBlocks = fixResult.string.match(/<<<\s+SEARCH/g)?.length ?? 0;

                this.logger.info(`Applied search replace diff to file: ${generatedFile.filePath}
================================================================================
Raw content (pass ${i + 1}, found ${searchBlocks} search blocks): 
${content}
-------------------------
Diff:
${fixResult.string}
-------------------------`);
                content = await this.applyDiffSafely(content, fixResult.string);

                this.logger.info(`
-------------------------
final content (pass ${i + 1}): 
${content}
================================================================================
`);
                i++;
            }
            const endTime = Date.now();
            this.logger.info(`Realtime code fixer completed for file: ${generatedFile.filePath} in ${endTime - startTime}ms, found ${searchBlocks} search blocks`);

            return {
                ...generatedFile,
                fileContents: content
            };
        } catch (error) {
            this.logger.error(`Error during realtime code fixer for file ${generatedFile.filePath}:`, error);
        }
        return generatedFile;
    }

    /**
     * Smart diff applier with automatic error correction
     * Simple approach: applies diff, if blocks fail, gives all failed blocks to LLM to fix
     */
    async applyDiffSafely(
        originalContent: string, 
        originalDiff: string, 
        maxRetries: number = MAX_RETRIES
    ): Promise<string> {
        if (!originalContent || !originalDiff?.trim()) {
            this.logger.warn('Empty content or diff provided to applyDiffSafely');
            return originalContent;
        }

        this.logger.info('Starting smart diff application...');
        
        try {
            let currentContent = originalContent;
            let currentDiff = originalDiff;

            for (let attempt = 0; attempt <= maxRetries; attempt++) {
                currentDiff = currentDiff.replaceAll(/^={7}\s*$\n^`{3}\s*$/gm, '>>>>>>> REPLACE\n\`\`\`\n')         // A hack cuz LLM often returns =7 and `3 instead of >>>>> REPLACE
                const searchBlocks = currentDiff.match(/<<<\s+SEARCH/g)?.length ?? 0;
                const replaceBlocks = currentDiff.match(/\s+REPLACE/g)?.length ?? 0;
                if (searchBlocks !== replaceBlocks) {
                    this.logger.warn(`Realtime code fixer returned mismatched search and replace blocks for file, ${searchBlocks} search blocks and ${replaceBlocks} replace blocks`);
                    
                    const correctedDiff = await this.getLLMCorrectedDiff(
                        currentContent, 
                        [],
                        [`Mismatched search and replace blocks in current diff: ${searchBlocks} search blocks and ${replaceBlocks} replace blocks. Current diff: \n${currentDiff}`],
                        0
                    );

                    if (!correctedDiff) {
                        this.logger.warn(`❌ Failed to get LLM correction on attempt ${attempt + 1}`);
                        return currentContent; // Return what we have so far
                    }

                    // Use the corrected diff for the next iteration
                    currentDiff = correctedDiff;
                    continue;
                }
                // Apply the current diff
                const result = applySearchReplaceDiff(currentContent, currentDiff, {
                    strict: false,
                    matchingStrategies: [MatchingStrategy.EXACT, MatchingStrategy.WHITESPACE_INSENSITIVE, MatchingStrategy.INDENTATION_PRESERVING, MatchingStrategy.FUZZY],
                    fuzzyThreshold: FUZZY_THRESHOLD
                });

                const { blocksApplied, blocksTotal, blocksFailed, failedBlocks } = result.results;
                this.logger.info(`${attempt === 0 ? 'Initial' : `Retry ${attempt}`} application: ${blocksApplied}/${blocksTotal} blocks applied`);

                // Success - all blocks applied
                if (blocksFailed === 0) {
                    this.logger.info('✅ All blocks applied successfully');
                    return result.content;
                } else {
                    this.logger.warn(`⚠️ ${blocksFailed} blocks still failed after ${attempt} retries.
                        Failed blocks:
                        ${failedBlocks.map((block, i) => `   ${i + 1}. ${block}`).join('\n')}
-------------------------
Failing Diff:
${currentDiff}
-------------------------`);
                }

                // If this was the last attempt, return what we have
                if (attempt === maxRetries) {
                    this.logger.warn(`⚠️ ${blocksFailed} blocks still failed after ${maxRetries} retries`);
                    failedBlocks.forEach((block, i) => {
                        this.logger.warn(`   ${i + 1}. ${block.error}`);
                    });
                    return result.content;
                }

                // Update current content with any successful changes
                currentContent = result.content;

                // Ask LLM to fix all failed blocks
                this.logger.info(`🔄 Getting LLM correction for ${blocksFailed} failed blocks...`);
                
                const correctedDiff = await this.getLLMCorrectedDiff(
                    currentContent, 
                    failedBlocks,
                    result.results.errors,
                    blocksApplied
                );

                if (!correctedDiff) {
                    this.logger.warn(`❌ Failed to get LLM correction on attempt ${attempt + 1}`);
                    return result.content; // Return what we have so far
                }

                // Use the corrected diff for the next iteration
                currentDiff = correctedDiff;
            }

            return currentContent;

        } catch (error) {
            this.logger.error('❌ Error in smart diff application:', error);
            return originalContent;
        }
    }

    /**
     * Get corrected diff from LLM using the new simplified DIFF_FIXER prompt
     */
    async getLLMCorrectedDiff(
        currentContent: string,
        failedBlocks: FailedBlock[],
        allErrors: string[],
        successfullyAppliedCount: number
    ): Promise<string | null> {
        try {
            // Format the failed blocks in the expected format for the new prompt
            const failedBlocksText = failedBlocks.map((block) => 
                `## SearchReplaceNoExactMatch: This SEARCH block failed to exactly match lines in the file
<<<<<<< SEARCH
${block.search}
=======
${block.replace}
>>>>>>> REPLACE

${block.error}
`).join('\n\n');

            // Format all errors as additional context
            const allErrorsText = allErrors.length > 0 ? 
                `\n\nAll cumulative errors from diff application:\n${allErrors.map(err => `- ${err}`).join('\n')}` : 
                '';

            // Use the new simplified DIFF_FIXER prompt
            const diffFixerPrompt = diffPromptFormatter(
                currentContent,
                failedBlocksText + allErrorsText,
                failedBlocks.length,
                successfullyAppliedCount
            );

            this.logger.info(`Getting corrected diff from LLM...${failedBlocksText}`);

            const messages = this.save([createUserMessage(diffFixerPrompt)]); 
            
            const llmResponse = await infer({
                env: this.env,
                metadata: this.inferenceContext,
                modelName: AIModels.GEMINI_2_5_FLASH,
                reasoning_effort: 'low',
                temperature: 0.0,
                maxTokens: 10000,
                actionKey:'realtimeCodeFixer',
                messages,
            });

            if (!llmResponse) {
                this.logger.warn("❌ No LLM response received");
                return null;
            }

            this.logger.info(`LLM response received: ${llmResponse.string}`);
            this.save([createAssistantMessage(llmResponse.string)]);

            // The new prompt returns corrected diff directly without XML tags
            const trimmed = llmResponse.string.trim();
            
            // Count blocks for validation
            const searchCount = (trimmed.match(/<<<<<<< SEARCH/g) || []).length;
            const replaceCount = (trimmed.match(/>>>>>>> REPLACE/g) || []).length;
            
            if (searchCount !== replaceCount) {
                this.logger.warn(`❌ Mismatched markers: ${searchCount} SEARCH vs ${replaceCount} REPLACE`, trimmed);
                return null;
            }

            if (searchCount === 0) {
                this.logger.warn("❌ No valid search/replace blocks found in LLM response", trimmed);
                return null;
            }

            this.logger.info(`🔄 LLM provided ${searchCount} corrected blocks`);
            return trimmed;

        } catch (error) {
            this.logger.error('❌ Error getting LLM correction:', error);
            return null;
        }
    }

}

export function IsRealtimeCodeFixerEnabled(inferenceContext: InferenceContext): boolean {
    if (AGENT_CONFIG.realtimeCodeFixer.name !== AIModels.DISABLED) {
        console.log("Realtime code fixer enabled");
        return true;
    }
    
    if (inferenceContext.userModelConfigs?.['realtimeCodeFixer'] && inferenceContext.userModelConfigs['realtimeCodeFixer'].name !== AIModels.DISABLED) {
        console.log("Realtime code fixer enabled by user");
        return true;
    }

    console.log("Realtime code fixer disabled", inferenceContext.userModelConfigs);
    return false;
}
    