import z from 'zod';

// Schema for AI template selection output
export const TemplateSelectionSchema = z.object({
    selectedTemplateName: z.string().nullable().describe('The name of the most suitable template, or null if none are suitable.'),
    reasoning: z.string().describe('Brief explanation for the selection or why no template was chosen.'),
    useCase: z.enum(['SaaS Product Website', 'Dashboard', 'Blog', 'Portfolio', 'E-Commerce', 'General', 'Other']).describe('The use case for which the template is selected, if applicable.').nullable(),
    complexity: z.enum(['simple', 'moderate', 'complex']).describe('The complexity of developing the project based on the the user query').nullable(),
    styleSelection: z.enum(['Minimalist Design', 'Brutalism', 'Retro', 'Illustrative', 'Kid_Playful', 'Custom']).describe('Pick a style relevant to the user query').nullable(),
    projectName: z.string().describe('The name of the project based on the user query'),
});

export const FileOutputSchema = z.object({
    filePath: z.string().describe('The name of the file including path'),
    fileContents: z.string().describe('The complete contents of the file'),
    filePurpose: z.string().describe('Concise purpose of the file and it\'s expected contents')
});

export const FileConceptSchema = z.object({
    path: z.string().describe('Path to the file relative to the project root. File name should be valid and not contain any special characters apart from hyphen, underscore and dot.'),
    purpose: z.string().describe('Very short, Breif, Concise, to the point description, purpose and expected contents of this file including its role in the architecture, data and code flow details'),
    changes: z.string().nullable().describe('Specific, directed changes to be made to the file as instructions, if it\'s not a new file. Don\'t include code.'),
})

export const PhaseConceptSchema = z.object({
    name: z.string().describe('Name of the phase (Utility, api, frontend, etc)'),
    description: z.string().describe('Concise, descriptive, directed description of the phase'),
    files: z.array(FileConceptSchema).describe('Files that need to be written in this stage (new or modified existing), including paths and purposes of each source/code file. **NO BINARY FILES**.'),
    lastPhase: z.boolean().describe('Whether this is the last phase to be implemented. If true, no next phase is required and the process will end here'),
})

export const PhaseConceptLiteSchema = PhaseConceptSchema.omit({ files: true, lastPhase: true });

/**
 * Schema for file generation output
 */

export const FileGenerationOutput = FileOutputSchema.extend({
    format: z.enum(['full_content', 'unified_diff']).describe('`full_content` for full, raw file contents, `unified_diff` for unified diff'),
})

export const PhaseConceptGenerationSchema = PhaseConceptSchema.extend({
    installCommands: z.array(z.string()).describe('Commands to install any additional **STRICTLY NECESESARY** dependencies for this phase. Should be used very rarely! Stick to the already installed dependencies!'),
})

export const PhaseImplementationSchema = z.object({
    files: z.array(FileOutputSchema).describe('Files that need to be written in this stage (new or modified existing), including paths and purposes of each source/code file.'),
    deploymentNeeded: z.boolean().describe('Whether deployment is needed for this phase'),
    commands: z.array(z.string()).describe('Commands to run for deployment'),
})

/**
 * Schema for code documentation fetch output
 */
export const DocumentationOutput = z.object({
    content: z.string().describe('The documentation content'),
    source: z.string().describe('Source of the documentation'),
});

/**
 * Schema for code review output
 */
export const CodeReviewOutput = z.object({
    // dependencies_already_installed: z.array(z.string()).describe('List of dependencies that are already installed in the project'),
    dependenciesNotMet: z.array(z.string()).describe('List of dependencies that are not met in the project'),
    issuesFound: z.boolean().describe('Whether any issues were found in the code review'),
    frontendIssues: z.array(z.string()).describe('Issues related to the frontend code'),
    backendIssues: z.array(z.string()).describe('Issues related to the backend code'),
    // summary: z.string().describe('Detailed summary of the issues found in the code review'),
    filesToFix: z.array(z.object({
        filePath: z.string().describe('Path to the file that needs fixing'),
        issues: z.array(z.string()).describe('List of issues found in this file and actionable recommendations for fixing them'),
        require_code_changes: z.boolean().describe('Whether code changes are required to fix the issues'),
    })).describe('List of files that need to be fixed'),
    commands: z.array(z.string()).describe('Commands that might be needed to run for fixing an issue. Empty array if no commands are needed'),
});

export const BlueprintSchema = z.object({
    title: z.string().describe('Title of the application'),
    projectName: z.string().describe('Name of the project, in small case, no special characters, no spaces, no dots. Only letters, numbers, hyphens, underscores are allowed.'),
    detailedDescription: z.string().describe('Enhanced and detailed description of what the application does and how its supposed to work. Break down the project into smaller components and describe each component in detail.'),
    description: z.string().describe('Short, brief, concise description of the application in a single sentence'),
    colorPalette: z.array(z.string()).describe('Color palette RGB codes to be used in the application, only base colors and not their shades, max 3 colors'),
    views: z.array(z.object({
        name: z.string().describe('Name of the view'),
        description: z.string().describe('Description of the view'),
    })).describe('Views of the application'),
    userFlow: z.object({
        uiLayout: z.string().describe('Detailed description of the layout of the user interface of the application, including margins, padding, spacing, etc. and how UI elements appear and where'),
        uiDesign: z.string().describe('Description of the user interface design and how it should look, including styling, colors, fonts, etc.'),
        userJourney: z.string().describe('Description of the user journey through the application across all the components and how they interact with each other'),
    }).describe('Description of how the user will interact with the application'),
    dataFlow: z.string().describe('Brief description of how data flows through the application, if any'),
    architecture: z.object({
        dataFlow: z.string().describe('Conscise description of how data flows through the application'),
    }).describe('Description of the architecture of the application, only needed for a dynamic application'),
    pitfalls: z.array(z.string()).describe('Exhaustive yet concise list of all the various framework and domain specific pitfalls, issues, challenges, and bugs that can occur while developing this and to avoid during implementation'),
    frameworks: z.array(z.string()).describe('Essential Frameworks, libraries and dependencies to be used in the application, with only major versions optionally specified'),
    implementationRoadmap: z.array(z.object({
        phase: z.string().describe('Phase name'),
        description: z.string().describe('Description of the phase'),
    })).describe('Phases of the implementation roadmap'),
    initialPhase: PhaseConceptSchema.describe('The first phase to be implemented, in **STRICT** accordance with <PHASE GENERATION STRATEGY>'),
    // commands: z.array(z.string()).describe('Commands to set up the development environment and install all dependencies not already in the template. These will run before code generation starts.'),
});

export const BlueprintSchemaLite = BlueprintSchema.omit({
    initialPhase: true,
});

export const SetupCommandsSchema = z.object({
    commands: z.array(z.string()).describe('Commands to set up the development environment and install all dependencies not already in the template. These will run before code generation starts.')
});

export const ClientReportedErrorSchema = z.object({
    type: z.string().describe('Type of error'),
    data: z.object({
        errorType: z.string().describe('Type of error'),
        consecutiveCount: z.number().describe('Number of consecutive errors'),
        url: z.string().describe('URL where the error occurred'),
        timestamp: z.string().describe('Timestamp of the error'),
        error: z.object({
            message: z.string().describe('Error message'),
            fullBodyText: z.string().describe('Full error body text'),
            fullBodyHtml: z.string().describe('Full error body HTML'),
            errorElementsFound: z.number().describe('Number of error elements found'),
        }).describe('Error details'),
        browserInfo: z.object({
            userAgent: z.string().describe('User agent'),
            url: z.string().describe('URL where the error occurred'),
        }).describe('Browser information'),
    }).describe('Error data'),
});

// Screenshot Analysis Schema
export const ScreenshotAnalysisSchema = z.object({
    hasIssues: z.boolean().describe('Whether any issues were found in the screenshot'),
    issues: z.array(z.string()).describe('List of specific issues found'),
    suggestions: z.array(z.string()).describe('Suggestions for improvements'),
    uiCompliance: z.object({
        matchesBlueprint: z.boolean().describe('Whether the UI matches the blueprint specifications'),
        deviations: z.array(z.string()).describe('List of deviations from the blueprint')
    })
});

export type TemplateSelection = z.infer<typeof TemplateSelectionSchema>;
export type Blueprint = z.infer<typeof BlueprintSchema>;
export type FileConceptType = z.infer<typeof FileConceptSchema>;
export type PhaseConceptType = z.infer<typeof PhaseConceptSchema>;
export type PhaseConceptLiteType = z.infer<typeof PhaseConceptLiteSchema>;
export type FileOutputType = z.infer<typeof FileOutputSchema>
export type PhaseConceptGenerationSchemaType = z.infer<typeof PhaseConceptGenerationSchema>;
export type PhaseImplementationSchemaType = z.infer<typeof PhaseImplementationSchema>;
export type FileGenerationOutputType = z.infer<typeof FileGenerationOutput>;
export type DocumentationOutputType = z.infer<typeof DocumentationOutput>;
export type CodeReviewOutputType = z.infer<typeof CodeReviewOutput>;
export type SetupCommandsType = z.infer<typeof SetupCommandsSchema>;
export type ClientReportedErrorType = z.infer<typeof ClientReportedErrorSchema>;
export type ScreenshotAnalysisType = z.infer<typeof ScreenshotAnalysisSchema>;

// Conversational AI Schemas
export const ConversationalResponseSchema = z.object({
    // enhancedUserRequest: z.string().describe('Enhanced and clarified user request to be added to pendingUserInputs'),
    userResponse: z.string().describe('Response message to send back to the user via WebSocket'),
});

export type ConversationalResponseType = z.infer<typeof ConversationalResponseSchema>;


