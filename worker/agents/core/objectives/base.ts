import { BaseProjectState } from '../state';
import { ProjectType, RuntimeType, ExportResult, ExportOptions, DeployResult, DeployOptions } from '../types';
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
        
    // GitHub token cache (ephemeral, lost on DO eviction)
    protected githubTokenCache: {
        token: string;
        username: string;
        expiresAt: number;
    } | null = null;
    
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
     * Deploy project to its runtime target
     */
    abstract deploy(options?: DeployOptions): Promise<DeployResult>;
    
    /**
     * Export project artifacts (GitHub repo, PDF, etc.)
     */
    abstract export(options: ExportOptions): Promise<ExportResult>;
    
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

    /**
     * Cache GitHub OAuth token in memory for subsequent exports
     * Token is ephemeral - lost on DO eviction
     */
    setGitHubToken(token: string, username: string, ttl: number = 3600000): void {
        this.githubTokenCache = {
            token,
            username,
            expiresAt: Date.now() + ttl
        };
        this.logger.info('GitHub token cached', { 
            username, 
            expiresAt: new Date(this.githubTokenCache.expiresAt).toISOString() 
        });
    }

    /**
     * Get cached GitHub token if available and not expired
     */
    getGitHubToken(): { token: string; username: string } | null {
        if (!this.githubTokenCache) {
            return null;
        }
        
        if (Date.now() >= this.githubTokenCache.expiresAt) {
            this.logger.info('GitHub token expired, clearing cache');
            this.githubTokenCache = null;
            return null;
        }
        
        return {
            token: this.githubTokenCache.token,
            username: this.githubTokenCache.username
        };
    }

    /**
     * Clear cached GitHub token
     */
    clearGitHubToken(): void {
        this.githubTokenCache = null;
        this.logger.info('GitHub token cleared');
    }
}
