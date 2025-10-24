import * as z from 'zod'

// --- Core File/Template Types ---

// Define the interface explicitly to break circular reference
export interface FileTreeNode {
    path: string;
    type: 'file' | 'directory';
    children?: FileTreeNode[];
}

export const FileTreeNodeSchema: z.ZodType<FileTreeNode> = z.lazy(() => z.object({
    path: z.string(),
    type: z.enum(['file', 'directory']),
    children: z.array(FileTreeNodeSchema).optional(),
}));

export const TemplateFileSchema = z.object({
    filePath: z.string(),
    fileContents: z.string(),
})
export type TemplateFile = z.infer<typeof TemplateFileSchema>

// --- Template Details ---

export const TemplateDetailsSchema = z.object({
    name: z.string(),
    description: z.object({
        selection: z.string(),
        usage: z.string(),
    }),
    fileTree: FileTreeNodeSchema,
    allFiles: z.record(z.string(), z.string()), // Map of filePath -> fileContents
    language: z.string().optional(),
    deps: z.record(z.string(), z.string()),
    frameworks: z.array(z.string()).optional(),
    importantFiles: z.array(z.string()),
    dontTouchFiles: z.array(z.string()),
    redactedFiles: z.array(z.string()),
})
export type TemplateDetails = z.infer<typeof TemplateDetailsSchema>

// ==========================================
// RUNTIME ERROR SCHEMAS
// ==========================================

export const SimpleErrorSchema = z.object({
  timestamp: z.string(),     // ISO timestamp
  level: z.number(),          // Pino log level (50=error, 60=fatal)
  message: z.string(),        // The 'msg' field from JSON log
  rawOutput: z.string()       // The complete raw JSON log line
});
export type SimpleError = z.infer<typeof SimpleErrorSchema>;

// StoredError extends SimpleError with storage-specific fields
export const StoredErrorSchema = SimpleErrorSchema.extend({
  id: z.number(),
  instanceId: z.string(),
  processId: z.string(),
  errorHash: z.string(),
  occurrenceCount: z.number(),
  createdAt: z.string()
});
export type StoredError = z.infer<typeof StoredErrorSchema>;

export const RuntimeErrorSchema = SimpleErrorSchema
export type RuntimeError = z.infer<typeof RuntimeErrorSchema>

// --- Instance Details ---

export const InstanceDetailsSchema = z.object({
    runId: z.string(),
    templateName: z.string(),
    startTime: z.union([z.string(), z.date()]),
    uptime: z.number(),
    previewURL: z.string().optional(),
    tunnelURL: z.string().optional(),
    directory: z.string(),
    serviceDirectory: z.string(),
    fileTree: FileTreeNodeSchema.optional(),
    runtimeErrors: z.array(RuntimeErrorSchema).optional(),
    processId: z.string().optional(),   
})
export type InstanceDetails = z.infer<typeof InstanceDetailsSchema>

// --- Command Execution ---

export const CommandExecutionResultSchema = z.object({
    command: z.string(),
    success: z.boolean(),
    output: z.string(),
    error: z.string().optional(),
    exitCode: z.number().optional(),
})
export type CommandExecutionResult = z.infer<typeof CommandExecutionResultSchema>

// --- API Request/Response Schemas ---

// /templates (GET)

export const TemplateInfoSchema = z.object({
    name: z.string(),
    language: z.string().optional(),
    frameworks: z.array(z.string()).optional(),
    description: z.object({
        selection: z.string(),
        usage: z.string(),
    })
})
export type TemplateInfo = z.infer<typeof TemplateInfoSchema>

export const TemplateListResponseSchema = z.object({
    success: z.boolean(),
    templates: z.array(TemplateInfoSchema),
    count: z.number(),
    error: z.string().optional(),
})
export type TemplateListResponse = z.infer<typeof TemplateListResponseSchema>

// /template/:name (GET)
export const TemplateDetailsResponseSchema = z.object({
    success: z.boolean(),
    templateDetails: TemplateDetailsSchema.optional(),
    error: z.string().optional(),
})
export type TemplateDetailsResponse = z.infer<typeof TemplateDetailsResponseSchema>

// /template/:name/files (POST)
export const GetTemplateFilesRequestSchema = z.object({
    filePaths: z.array(z.string()),
})
export type GetTemplateFilesRequest = z.infer<typeof GetTemplateFilesRequestSchema>

export const GetTemplateFilesResponseSchema = z.object({
    success: z.boolean(),
    files: z.array(TemplateFileSchema),
    errors: z.array(z.object({ file: z.string(), error: z.string() })).optional(),
    error: z.string().optional(),
})
export type GetTemplateFilesResponse = z.infer<typeof GetTemplateFilesResponseSchema>

export const BootstrapRequestSchema = z.object({
    templateName: z.string(),
    projectName: z.string(),
    webhookUrl: z.string().url().optional(),
    envVars: z.record(z.string(), z.string()).optional(),
})
export type BootstrapRequest = z.infer<typeof BootstrapRequestSchema>

export const PreviewSchema = z.object({
    runId: z.string().optional(),
    previewURL: z.string().optional(),
    tunnelURL: z.string().optional(),
})
export type PreviewType = z.infer<typeof PreviewSchema>

export const BootstrapResponseSchema = PreviewSchema.extend({
    success: z.boolean(),
    processId: z.string().optional(),
    message: z.string().optional(),
    error: z.string().optional(),
})
export type BootstrapResponse = z.infer<typeof BootstrapResponseSchema>

// /instances/:id/status (GET)
export const BootstrapStatusResponseSchema = z.object({
    success: z.boolean(),
    pending: z.boolean(),
    message: z.string().optional(),
    previewURL: z.string().optional(),
    tunnelURL: z.string().optional(),
    processId: z.string().optional(),
    isHealthy: z.boolean(),
    error: z.string().optional(),
})
export type BootstrapStatusResponse = z.infer<typeof BootstrapStatusResponseSchema>

// /instances (GET)
export const ListInstancesResponseSchema = z.object({
    success: z.boolean(),
    instances: z.array(InstanceDetailsSchema),
    count: z.number(),
    error: z.string().optional(),
})
export type ListInstancesResponse = z.infer<typeof ListInstancesResponseSchema>

// /instances/:id (GET)
export const GetInstanceResponseSchema = z.object({
    success: z.boolean(),
    instance: InstanceDetailsSchema.optional(),
    error: z.string().optional(),
})
export type GetInstanceResponse = z.infer<typeof GetInstanceResponseSchema>

// /instances/:id/files (POST)
export const WriteFilesRequestSchema = z.object({
    files: z.array(z.object({
        filePath: z.string(),
        fileContents: z.string(),
    })), 
    commitMessage: z.string().optional(),
})
export type WriteFilesRequest = z.infer<typeof WriteFilesRequestSchema>

// /instances/:id/files (GET) - Define schema for getting files from an instance
export const GetFilesResponseSchema = z.object({
    success: z.boolean(),
    files: z.array(TemplateFileSchema), // Re-use TemplateFileSchema { filePath, fileContents }
    errors: z.array(z.object({ file: z.string(), error: z.string() })).optional(),
    error: z.string().optional(),
})
export type GetFilesResponse = z.infer<typeof GetFilesResponseSchema>

export const WriteFilesResponseSchema = z.object({
    success: z.boolean(),
    message: z.string().optional(),
    results: z.array(z.object({
        file: z.string(),
        success: z.boolean(),
        error: z.string().optional(),
    })),
    error: z.string().optional(),
})
export type WriteFilesResponse = z.infer<typeof WriteFilesResponseSchema>

export const GetLogsResponseSchema = z.object({
    success: z.boolean(),
    logs: z.object({
        stdout: z.string(),
        stderr: z.string(),
    }),
    error: z.string().optional(),
})
export type GetLogsResponse = z.infer<typeof GetLogsResponseSchema>

// /instances/:id/commands (POST)
export const ExecuteCommandsRequestSchema = z.object({
    commands: z.array(z.string()),
    timeout: z.number().optional(),
})
export type ExecuteCommandsRequest = z.infer<typeof ExecuteCommandsRequestSchema>

export const ExecuteCommandsResponseSchema = z.object({
    success: z.boolean(),
    results: z.array(CommandExecutionResultSchema),
    message: z.string().optional(),
    error: z.string().optional(),
})
export type ExecuteCommandsResponse = z.infer<typeof ExecuteCommandsResponseSchema>

// /instances/:id/errors (GET)
export const RuntimeErrorResponseSchema = z.object({
    success: z.boolean(),
    errors: z.array(RuntimeErrorSchema),
    hasErrors: z.boolean(),
    error: z.string().optional(),
})
export type RuntimeErrorResponse = z.infer<typeof RuntimeErrorResponseSchema>

// /instances/:id/errors (DELETE)
export const ClearErrorsResponseSchema = z.object({
    success: z.boolean(),
    message: z.string().optional(),
    error: z.string().optional(),
})
export type ClearErrorsResponse = z.infer<typeof ClearErrorsResponseSchema>

// /instances/:id/fix-code (POST)
export const FixCodeResponseSchema = z.object({
    success: z.boolean(),
    message: z.string().optional(),
    fixes: z.array(z.object({
        filePath: z.string(),
        originalCode: z.string(),
        fixedCode: z.string(),
        explanation: z.string(),
    })),
    applied: z.array(z.string()).optional(),
    failed: z.array(z.string()).optional(),
    commands: z.array(z.string()).optional(),
    error: z.string().optional(),
})
export type FixCodeResponse = z.infer<typeof FixCodeResponseSchema>

// /instances/:id (DELETE)
export const ShutdownResponseSchema = z.object({
    success: z.boolean(),
    message: z.string().optional(),
    error: z.string().optional(),
})
export type ShutdownResponse = z.infer<typeof ShutdownResponseSchema>

// /templates/from-instance (POST)
export const PromoteToTemplateRequestSchema = z.object({
    instanceId: z.string(),
    templateName: z.string().optional(),
})
export type PromoteToTemplateRequest = z.infer<typeof PromoteToTemplateRequestSchema>

export const PromoteToTemplateResponseSchema = z.object({
    success: z.boolean(),
    message: z.string().optional(),
    templateName: z.string().optional(),
    error: z.string().optional(),
})
export type PromoteToTemplateResponse = z.infer<typeof PromoteToTemplateResponseSchema>

// /templates (POST) - AI template generation
export const GenerateTemplateRequestSchema = z.object({
    prompt: z.string(),
    templateName: z.string(),
    options: z.object({
        framework: z.string().optional(),
        language: z.enum(['javascript', 'typescript']).optional(),
        styling: z.enum(['tailwind', 'css', 'scss']).optional(),
        features: z.array(z.string()).optional(),
    }).optional(),
})
export type GenerateTemplateRequest = z.infer<typeof GenerateTemplateRequestSchema>

export const GenerateTemplateResponseSchema = z.object({
    success: z.boolean(),
    templateName: z.string(),
    summary: z.string().optional(),
    fileCount: z.number().optional(),
    fileTree: FileTreeNodeSchema.optional(),
    error: z.string().optional(),
})
export type GenerateTemplateResponse = z.infer<typeof GenerateTemplateResponseSchema>

// /instances/:id/lint (GET)
export const LintSeveritySchema = z.enum(['error', 'warning', 'info'])
export type LintSeverity = z.infer<typeof LintSeveritySchema>

export const CodeIssueSchema = z.object({
    message: z.string(),
    filePath: z.string(),
    line: z.number(),
    column: z.number().optional(),
    severity: LintSeveritySchema,
    ruleId: z.string().optional(),
    source: z.string().optional()
})
export type CodeIssue = z.infer<typeof CodeIssueSchema>

export const CodeIssueResponseSchema =  z.object({
    issues: z.array(CodeIssueSchema),
    summary: z.object({
        errorCount: z.number(),
        warningCount: z.number(),
        infoCount: z.number()
    }).optional(),
    rawOutput: z.string().optional(),
})
export type CodeIssueResponse = z.infer<typeof CodeIssueResponseSchema>

export const StaticAnalysisResponseSchema = z.object({
    success: z.boolean(),
    lint: CodeIssueResponseSchema,
    typecheck: CodeIssueResponseSchema,
    error: z.string().optional()
})
export type StaticAnalysisResponse = z.infer<typeof StaticAnalysisResponseSchema>

// --- Cloudflare Deployment ---

// /instances/:id/deploy (POST) - Request body
export const DeploymentCredentialsSchema = z.object({
    apiToken: z.string().optional(),
    accountId: z.string().optional(),
})
export type DeploymentCredentials = z.infer<typeof DeploymentCredentialsSchema>

// /instances/:id/deploy (POST) - Response
export const DeploymentResultSchema = z.object({
    success: z.boolean(),
    message: z.string(),
    deployedUrl: z.string().optional(),
    deploymentId: z.string().optional(),
    output: z.string().optional(),
    error: z.string().optional(),
})
export type DeploymentResult = z.infer<typeof DeploymentResultSchema>

// --- Webhook Event Types ---

// Base webhook event schema
export const WebhookEventBaseSchema = z.object({
    eventType: z.string(),
    instanceId: z.string(),
    timestamp: z.union([z.string(), z.date()]).transform(val => typeof val === 'string' ? val : val.toISOString()),
    agentId: z.string().optional(),
})

// Runtime error webhook event - compatible with current runner service
export const WebhookRuntimeErrorEventSchema = WebhookEventBaseSchema.extend({
    eventType: z.literal('runtime_error'),
    payload: z.object({
        runId: z.string(),
        error: RuntimeErrorSchema,
        instanceInfo: z.object({
            templateName: z.string().optional(),
            serviceDirectory: z.string().optional(),
        }),
    }),
})
export type WebhookRuntimeErrorEvent = z.infer<typeof WebhookRuntimeErrorEventSchema>

// Build status webhook event (for future use)
export const WebhookBuildStatusEventSchema = WebhookEventBaseSchema.extend({
    eventType: z.literal('build_status'),
    payload: z.object({
        status: z.enum(['started', 'completed', 'failed']),
        buildOutput: z.string().optional(),
        buildErrors: z.array(z.string()).optional(),
        duration: z.number().optional(),
    }),
})
export type WebhookBuildStatusEvent = z.infer<typeof WebhookBuildStatusEventSchema>

// Deployment status webhook event (for future use)
export const WebhookDeploymentStatusEventSchema = WebhookEventBaseSchema.extend({
    eventType: z.literal('deployment_status'),
    payload: z.object({
        status: z.enum(['started', 'completed', 'failed']),
        deploymentType: z.enum(['preview', 'cloudflare_workers']).optional(),
        deployedUrl: z.string().optional(),
        deploymentId: z.string().optional(),
        error: z.string().optional(),
    }),
})
export type WebhookDeploymentStatusEvent = z.infer<typeof WebhookDeploymentStatusEventSchema>

// Instance health webhook event (for future use)
export const WebhookInstanceHealthEventSchema = WebhookEventBaseSchema.extend({
    eventType: z.literal('instance_health'),
    payload: z.object({
        status: z.enum(['healthy', 'unhealthy', 'shutting_down']),
        uptime: z.number().optional(),
        memoryUsage: z.number().optional(),
        cpuUsage: z.number().optional(),
        lastActivity: z.union([z.string(), z.date()]).optional(),
        message: z.string().optional(),
    }),
})
export type WebhookInstanceHealthEvent = z.infer<typeof WebhookInstanceHealthEventSchema>

// Command execution webhook event (for future use)
export const WebhookCommandExecutionEventSchema = WebhookEventBaseSchema.extend({
    eventType: z.literal('command_execution'),
    payload: z.object({
        status: z.enum(['started', 'completed', 'failed']),
        command: z.string(),
        output: z.string().optional(),
        error: z.string().optional(),
        exitCode: z.number().optional(),
        duration: z.number().optional(),
    }),
})
export type WebhookCommandExecutionEvent = z.infer<typeof WebhookCommandExecutionEventSchema>

// Union type for all webhook events
export const WebhookEventSchema = z.discriminatedUnion('eventType', [
    WebhookRuntimeErrorEventSchema,
    WebhookBuildStatusEventSchema,
    WebhookDeploymentStatusEventSchema,
    WebhookInstanceHealthEventSchema,
    WebhookCommandExecutionEventSchema,
])
export type WebhookEvent = z.infer<typeof WebhookEventSchema>

// Webhook payload with authentication
export const WebhookPayloadSchema = z.object({
    signature: z.string().optional(),
    timestamp: z.union([z.string(), z.date()]),
    event: WebhookEventSchema,
})
export type WebhookPayload = z.infer<typeof WebhookPayloadSchema>

// Current runner service payload (direct payload without wrapper)
export const RunnerServiceWebhookPayloadSchema = z.object({
    runId: z.string(),
    error: RuntimeErrorSchema,
    instanceInfo: z.object({
        templateName: z.string().optional(),
        serviceDirectory: z.string().optional(),
    }),
})
export type RunnerServiceWebhookPayload = z.infer<typeof RunnerServiceWebhookPayloadSchema>

/**
 * GitHub integration types for exporting generated applications
 */

// Common fields for GitHub operations
interface GitHubUserInfo {
    token: string;
    email: string;
    username: string;
    isPrivate: boolean;
}

// Request for pushing to existing repository (low-level push)
export interface GitHubPushRequest extends GitHubUserInfo {
    cloneUrl: string;
    repositoryHtmlUrl: string;
}

export const GitHubPushResponseSchema = z.object({
    success: z.boolean(),
    commitSha: z.string().optional(),
    error: z.string().optional(),
    details: z.object({
        operation: z.string().optional(),
        exitCode: z.number().optional(),
        stderr: z.string().optional(),
    }).optional(),
})
export type GitHubPushResponse = z.infer<typeof GitHubPushResponseSchema>