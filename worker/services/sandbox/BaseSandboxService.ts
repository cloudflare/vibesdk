import {
    // Template types
    TemplateListResponse,
    TemplateDetailsResponse,
    
    GetInstanceResponse,
    BootstrapStatusResponse,
    ShutdownResponse,
    
    // File operation types
    WriteFilesRequest,
    WriteFilesResponse,
    GetFilesResponse,
    
    ExecuteCommandsResponse,
    
    // Error management types
    RuntimeErrorResponse,
    ClearErrorsResponse,
    
    // Analysis types
    StaticAnalysisResponse,
    
    // Deployment types
    DeploymentResult,
    BootstrapResponse,
    
    GetLogsResponse,
    ListInstancesResponse,
    GitHubPushRequest,
    GitHubPushResponse,
    GitHubExportRequest,
    GitHubExportResponse
  } from './sandboxTypes';
  
  import { createObjectLogger, StructuredLogger } from '../../logger';
  import { env } from 'cloudflare:workers'
  /**
   * Streaming event for enhanced command execution
   */
  export interface StreamEvent {
    type: 'stdout' | 'stderr' | 'exit' | 'error';
    data?: string;
    code?: number;
    error?: string;
    timestamp: Date;
  }
  
  export interface TemplateInfo {
      name: string;
      language?: string;
      frameworks?: string[];
      description: {
          selection: string;
          usage: string;
      };
  }
  
  /**
   * Abstract base class providing complete RunnerService API compatibility
   * All implementations MUST support every method defined here
   */
  export abstract class BaseSandboxService {
    protected logger: StructuredLogger;
    protected sandboxId: string;
  
    constructor(sandboxId: string) {
      this.logger = createObjectLogger(this, 'BaseSandboxService');
      this.sandboxId = sandboxId;
    }
  
    // Any async startup tasks should be done here
    abstract initialize(): Promise<void>;
  
    // ==========================================
    // TEMPLATE MANAGEMENT (Required)
    // ==========================================
  
    /**
     * List all available templates
     * Returns: { success: boolean, templates: [...], count: number, error?: string }
     */
    static async listTemplates(): Promise<TemplateListResponse> {
        try {
            const response = await env.TEMPLATES_BUCKET.get('template_catalog.json');
            if (response === null) {
                throw new Error(`Failed to fetch template catalog: Template catalog not found`);
            }
            
            const templates = await response.json() as TemplateInfo[];

            // For now, just filter out *next* templates
            const filteredTemplates = templates.filter(t => !t.name.includes('next'));

            return {
                success: true,
                templates: filteredTemplates.map(t => ({
                    name: t.name,
                    language: t.language,
                    frameworks: t.frameworks || [],
                    description: t.description
                })),
                count: filteredTemplates.length
            };
        } catch (error) {
            return {
                success: false,
                templates: [],
                count: 0,
                error: `Failed to fetch templates: ${error instanceof Error ? error.message : 'Unknown error'}`
            };
        }
    }
  
      /**
       * Get details for a specific template including files and structure
       * Returns: { success: boolean, templateDetails?: {...}, error?: string }
       */
      abstract getTemplateDetails(templateName: string): Promise<TemplateDetailsResponse>;
  
    // ==========================================
    // INSTANCE LIFECYCLE (Required)
    // ==========================================
  
    /**
     * Create a new instance from a template
     * Returns: { success: boolean, instanceId?: string, error?: string }
     */
    abstract createInstance(templateName: string, projectName: string, webhookUrl?: string, localEnvVars?: Record<string, string>): Promise<BootstrapResponse>;

    /**
     * List all instances across all sessions
     * Returns: { success: boolean, instances: [...], count: number, error?: string }
     */
    abstract listAllInstances(): Promise<ListInstancesResponse>;
  
    /**
     * Get detailed information about an instance
     * Returns: { success: boolean, instance?: {...}, error?: string }
     */
    abstract getInstanceDetails(instanceId: string): Promise<GetInstanceResponse>;
  
    /**
     * Get current status of an instance
     * Returns: { success: boolean, pending: boolean, message?: string, previewURL?: string, error?: string }
     */
    abstract getInstanceStatus(instanceId: string): Promise<BootstrapStatusResponse>;
  
    /**
     * Shutdown and cleanup an instance
     * Returns: { success: boolean, message?: string, error?: string }
     */
    abstract shutdownInstance(instanceId: string): Promise<ShutdownResponse>;
  
    // ==========================================
    // FILE OPERATIONS (Required)
    // ==========================================
  
    /**
     * Write multiple files to an instance
     * Returns: { success: boolean, message?: string, results: [...], error?: string }
     */
    abstract writeFiles(instanceId: string, files: WriteFilesRequest['files'], commitMessage?: string): Promise<WriteFilesResponse>;
  
    /**
     * Read specific files from an instance
     * Returns: { success: boolean, files: [...], errors?: [...], error?: string }
     */
    abstract getFiles(instanceId: string, filePaths?: string[]): Promise<GetFilesResponse>;

    abstract getLogs(instanceId: string): Promise<GetLogsResponse>;
  
    // ==========================================
    // COMMAND EXECUTION (Required)
    // ==========================================
  
    /**
     * Execute multiple commands sequentially with optional timeout
     * Returns: { success: boolean, results: [...], message?: string, error?: string }
     */
    abstract executeCommands(instanceId: string, commands: string[], timeout?: number): Promise<ExecuteCommandsResponse>;
  
    // ==========================================
    // ERROR MANAGEMENT (Required)
    // ==========================================
  
    /**
     * Get all runtime errors from an instance
     * Returns: { success: boolean, errors: [...], hasErrors: boolean, error?: string }
     */
    abstract getInstanceErrors(instanceId: string): Promise<RuntimeErrorResponse>;
  
    /**
     * Clear all runtime errors from an instance
     * Returns: { success: boolean, message?: string, error?: string }
     */
    abstract clearInstanceErrors(instanceId: string): Promise<ClearErrorsResponse>;
  
    // ==========================================
    // CODE ANALYSIS & FIXING (Required)
    // ==========================================
  
    /**
     * Run static analysis (linting + type checking) on instance code
     * Returns: { success: boolean, lint: {...}, typecheck: {...}, error?: string }
     */
    abstract runStaticAnalysisCode(instanceId: string, lintFiles?: string[]): Promise<StaticAnalysisResponse>;
  
    // ==========================================
    // DEPLOYMENT (Required)
    // ==========================================
  
    /**
     * Deploy instance to Cloudflare Workers
     * Returns: { success: boolean, message: string, deployedUrl?: string, deploymentId?: string, error?: string }
     */
    abstract deployToCloudflareWorkers(instanceId: string): Promise<DeploymentResult>;
  
    // ==========================================
    // GITHUB INTEGRATION (Required)
    // ==========================================
  
    /**
     * Export generated app to GitHub (creates repository if needed, then pushes files)
     */
    abstract exportToGitHub(instanceId: string, request: GitHubExportRequest): Promise<GitHubExportResponse>

    /**
     * Push instance files to existing GitHub repository
     */
    abstract pushToGitHub(instanceId: string, request: GitHubPushRequest): Promise<GitHubPushResponse>
  }