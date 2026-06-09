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
    TemplateDetails,
    TemplateInfo,
    InstanceCreationRequest,
} from './sandboxTypes';
  
import { createObjectLogger, StructuredLogger } from '../../logger';
import { env } from 'cloudflare:workers'
import { ZipExtractor } from './zipExtractor';
import { FileTreeBuilder } from './fileTreeBuilder';
import { DeploymentTarget } from 'worker/agents/core/types';

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

const templateDetailsCache: Record<string, TemplateDetails> = {};
  
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
                    description: t.description,
                    disabled: t.disabled ?? false,
                    projectType: t.projectType || 'app',
                    renderMode: t.renderMode,
                    slideDirectory: t.slideDirectory,
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
     * Get details for a specific template - fully in-memory, no sandbox operations
     * Downloads zip from R2, extracts in memory, and returns all files with metadata
     * Returns: { success: boolean, templateDetails?: {...}, error?: string }
     */
    static async getTemplateDetails(templateName: string, downloadDir?: string): Promise<TemplateDetailsResponse> {
        try {
            if (templateDetailsCache[templateName]) {
                console.log(`Template details for template: ${templateName} found in cache`);
                return {
                    success: true,
                    templateDetails: templateDetailsCache[templateName]
                };
            }
            // Download template zip from R2
            const downloadUrl = downloadDir ? `${downloadDir}/${templateName}.zip` : `${templateName}.zip`;
            const r2Object = await env.TEMPLATES_BUCKET.get(downloadUrl);
              
            if (!r2Object) {
                throw new Error(`Template '${templateName}' not found in bucket`);
            }
        
            const zipData = await r2Object.arrayBuffer();
            
            // Extract all files in memory
            const allFiles = ZipExtractor.extractFiles(zipData);
            
            // Build file tree
            const fileTree = FileTreeBuilder.buildFromTemplateFiles(allFiles, { rootPath: '.' });
            
            // Extract dependencies from package.json
            const packageJsonFile = allFiles.find(f => f.filePath === 'package.json');
            const packageJson = packageJsonFile ? JSON.parse(packageJsonFile.fileContents) : null;
            const dependencies = packageJson?.dependencies || {};
            
            // Parse metadata files
            const dontTouchFile = allFiles.find(f => f.filePath === '.donttouch_files.json');
            const dontTouchFiles = dontTouchFile ? JSON.parse(dontTouchFile.fileContents) : [];
            
            const redactedFile = allFiles.find(f => f.filePath === '.redacted_files.json');
            const redactedFiles = redactedFile ? JSON.parse(redactedFile.fileContents) : [];
            
            const importantFile = allFiles.find(f => f.filePath === '.important_files.json');
            const importantFiles = importantFile ? JSON.parse(importantFile.fileContents) : [];
            
            // Get template info from catalog
            const catalogResponse = await BaseSandboxService.listTemplates();
            const catalogInfo = catalogResponse.success 
                ? catalogResponse.templates.find(t => t.name === templateName)
                : null;
            console.log('Catalog info:', catalogInfo);
            // Remove metadata files and convert to map for efficient lookups
            const filteredFiles = allFiles.filter(f => 
                !f.filePath.startsWith('.') || 
                (!f.filePath.endsWith('.json') && !f.filePath.startsWith('.git'))
            );
            
            // Convert array to map: filePath -> fileContents
            const filesMap: Record<string, string> = {};
            for (const file of filteredFiles) {
                filesMap[file.filePath] = file.fileContents;
            }
            
            const templateDetails: TemplateDetails = {
                name: templateName,
                description: {
                    selection: catalogInfo?.description.selection || '',
                    usage: catalogInfo?.description.usage || ''
                },
                disabled: catalogInfo?.disabled ?? false,
                fileTree,
                allFiles: filesMap,
                language: catalogInfo?.language,
                deps: dependencies,
                importantFiles: importantFiles,
                dontTouchFiles: dontTouchFiles,
                redactedFiles: redactedFiles,
                projectType: catalogInfo?.projectType || 'app',
                frameworks: catalogInfo?.frameworks || [],
                renderMode: catalogInfo?.renderMode,
                slideDirectory: catalogInfo?.slideDirectory,
            };

            templateDetailsCache[templateName] = templateDetails;

            return {
                success: true,
                templateDetails
            };
        } catch (error) {
            return {
                success: false,
                error: `Failed to get template details: ${error instanceof Error ? error.message : 'Unknown error'}`
            };
        }
    }
    
    // ==========================================
    // INSTANCE LIFECYCLE (Required)
    // ==========================================
  
    /**
     * Create a new instance from a template
     * Returns: { success: boolean, instanceId?: string, error?: string }
     * @param options - Instance creation options
     */
    abstract createInstance(
        options: InstanceCreationRequest
    ): Promise<BootstrapResponse>;

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

    abstract getLogs(instanceId: string, onlyRecent?: boolean, durationSeconds?: number): Promise<GetLogsResponse>;
  
    // ==========================================
    // COMMAND EXECUTION (Required)
    // ==========================================
  
    /**
     * Execute multiple commands sequentially with optional timeout
     * Returns: { success: boolean, results: [...], message?: string, error?: string }
     */
    abstract executeCommands(instanceId: string, commands: string[], timeout?: number): Promise<ExecuteCommandsResponse>;
 
    abstract updateProjectName(instanceId: string, projectName: string): Promise<boolean>;
  
    // ==========================================
    // ERROR MANAGEMENT (Required)
    // ==========================================
  
    /**
     * Get all runtime errors from an instance
     * Returns: { success: boolean, errors: [...], hasErrors: boolean, error?: string }
     */
    abstract getInstanceErrors(instanceId: string, clear?: boolean): Promise<RuntimeErrorResponse>;
  
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
    abstract deployToCloudflareWorkers(instanceId: string, target?: DeploymentTarget): Promise<DeploymentResult>;
  
    // ==========================================
    // GITHUB INTEGRATION (Required)
    // ==========================================

}
