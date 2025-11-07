import { BaseProjectState } from '../state';
import { ProjectType, RuntimeType, ExportResult, ExportOptions } from '../types';
import { AgentComponent } from '../AgentComponent';
import type { AgentInfrastructure } from '../AgentCore';

/**
 * Abstract base class for project objectives
 * 
 * Defines WHAT is being built (app, workflow, presentation, etc.)
 * 
 * Design principles:
 * - Defines project identity (type, name, description)
 * - Defines runtime requirements (sandbox, worker, none)
 * - Defines template needs
 * - Implements export/deployment logic
 * - Provides lifecycle hooks
 */
export abstract class ProjectObjective<TState extends BaseProjectState = BaseProjectState> 
    extends AgentComponent<TState> {
    
    constructor(infrastructure: AgentInfrastructure<TState>) {
        super(infrastructure);
    }
    
    // ==========================================
    // ABSTRACT METHODS (Must be implemented)
    // ==========================================
    
    /**
     * Get project type identifier
     */
    abstract getType(): ProjectType;
    
    /**
     * Get runtime type (where it runs during development)
     */
    abstract getRuntime(): RuntimeType;
    
    /**
     * Does this project need a template?
     */
    abstract needsTemplate(): boolean;
    
    /**
     * Get template type if needed
     */
    abstract getTemplateType(): string | null;
    
    /**
     * Export/deploy project to target platform
     * 
     * This is where objective-specific deployment logic lives:
     * - AppObjective: Deploy to Cloudflare Workers + Pages
     * - WorkflowObjective: Deploy to Cloudflare Workers only
     * - PresentationObjective: Export to PDF/Google Slides/PowerPoint
     */
    abstract export(options?: ExportOptions): Promise<ExportResult>;
    
    // ==========================================
    // OPTIONAL LIFECYCLE HOOKS
    // ==========================================
    
    /**
     * Called after project is created and initialized
     * Override for project-specific setup
     */
    async onProjectCreated(): Promise<void> {
        // Default: no-op
    }
    
    /**
     * Called after code generation completes
     * Override for project-specific post-generation actions
     */
    async onCodeGenerated(): Promise<void> {
        // Default: no-op
    }
    
    // ==========================================
    // OPTIONAL VALIDATION
    // ==========================================
    
    /**
     * Validate project configuration and state
     * Override for project-specific validation
     */
    async validate(): Promise<{ valid: boolean; errors?: string[] }> {
        return { valid: true };
    }
}
