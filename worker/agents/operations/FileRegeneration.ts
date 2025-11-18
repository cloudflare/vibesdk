import { FileGenerationOutputType } from '../schemas';
import { AgentOperation, OperationOptions } from '../operations/common';
import { RealtimeCodeFixer } from '../assistants/realtimeCodeFixer';
import { FileOutputType } from '../schemas';

export interface FileRegenerationInputs {
    file: FileOutputType;
    issues: string[];
    retryIndex: number;
}

const SYSTEM_PROMPT = `You are an elite autonomous agent specializing in surgical code fixes. Your CRITICAL mandate is to fix the EXACT SPECIFIC reported issues while preserving all existing functionality, interfaces, and patterns.

## CORE PRINCIPLES:
1. **MINIMAL CHANGE POLICY** - Make isolated, small changes to fix the issue
2. **DO AS INSTRUCTED** - Follow the instructions exactly as given, without adding or removing anything else.
3. **NO NEW FEATURES** - Do not add functionality, only repair existing functionality as explicitly requested

## FORBIDDEN ACTIONS (Will cause new issues):
- Altering ANY other code apart from the specific issues to fix.
- Adding new dependencies or imports not already present UNLESS explicitly requested.
- Changing function signatures or return types UNLESS explicitly requested.
- Modifying working components to "improve" them UNLESS explicitly requested.
- Refactoring code structure or patterns UNLESS explicitly requested.
- Adding new state management or effects UNLESS explicitly requested.
- Changing existing CSS classes or styling approaches UNLESS explicitly requested.

## REQUIRED SAFETY CHECKS:
- Ensure your fix targets the exact problem described and fixes it in the exact way expected.
- Make all necessary changes to keep the code correct and working.
- Do not make any changes to the code that is not related to the specific issues to fix.

Your goal is zero regression - fix the issues without breaking anything else.`

const USER_PROMPT = `<SURGICAL_FIX_REQUEST: {{filePath}}>

<CONTEXT>
User Query: {{query}}
File Path: {{filePath}}
File Purpose: {{filePurpose}}
</CONTEXT>

<CURRENT_FILE_CONTENTS>
{{fileContents}}
</CURRENT_FILE_CONTENTS>

<SPECIFIC_ISSUES_TO_FIX>
{{issues}}
</SPECIFIC_ISSUES_TO_FIX>

<FIX_PROTOCOL>
## Step 1: Minimal Fix Identification  
- Identify the smallest possible change non-hacky to fix each valid issue
- Avoid touching any working code unless it is directly related to the issue to fix
- Preserve all existing patterns and structures unless it is directly related to the issue to fix
- Every change should be right and proper, and STRICT DRY Principles and best coding practices should be followed

## Step 2: Apply Surgical Fixes
Use this exact format for making each fix:

**Example - Null Safety Fix:**
Issue: "Cannot read property 'items' of undefined"
<fix>
# Add null check to prevent undefined access

\`\`\`
<<<<<<< SEARCH
const total = data.items.length;
=======
const total = data?.items?.length || 0;
>>>>>>> REPLACE
\`\`\`
</fix>

**Example - Render Loop Fix:**
Issue: "Maximum update depth exceeded in useEffect"
<fix>
# Add missing dependency array to prevent infinite loop

\`\`\`
<<<<<<< SEARCH
useEffect(() => {
  setState(newValue);
});
=======
useEffect(() => {
  setState(newValue);
}, [newValue]);
>>>>>>> REPLACE
\`\`\`
</fix>

## SAFETY CONSTRAINTS:
- SEARCH block must match existing code character-for-character
- Only fix the exact reported problem
- Never modify imports, exports, or function signatures
- Preserve all existing error handling
- Do not add new dependencies or change existing patterns
- If an issue cannot be fixed surgically, explain why instead of forcing a fix
</FIX_PROTOCOL>`;

export class FileRegenerationOperation extends AgentOperation<FileRegenerationInputs, FileGenerationOutputType> {    
    async execute(
        inputs: FileRegenerationInputs,
        options: OperationOptions
    ): Promise<FileGenerationOutputType> {
        try {
            // Use realtime code fixer to fix the file with enhanced surgical fix prompts
            const realtimeCodeFixer = new RealtimeCodeFixer(options.env, options.inferenceContext, false, undefined, "fileRegeneration", SYSTEM_PROMPT, USER_PROMPT);
            const fixedFile = await realtimeCodeFixer.run(
                inputs.file, {
                    previousFiles: options.context.allFiles,
                    query: options.context.query,
                    template: options.context.templateDetails
                },
                undefined,
                inputs.issues,
                5
            );

            return {
                ...fixedFile,
                format: "full_content"
            };
        } catch (error) {
            options.logger.error(`Error fixing file ${inputs.file.filePath}:`, error);
            throw error;
        }
    }
}
