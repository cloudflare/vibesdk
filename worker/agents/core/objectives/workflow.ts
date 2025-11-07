import { ProjectObjective } from './base';
import { BaseProjectState } from '../state';
import { ProjectType, RuntimeType, ExportResult, ExportOptions } from '../types';
import type { AgentInfrastructure } from '../AgentCore';

/**
 * WIP!
 * WorkflowObjective - Backend-Only Workflows
 * 
 * Produces: Cloudflare Workers without UI (APIs, scheduled jobs, queues)
 * Runtime: Sandbox for now, Dynamic Worker Loaders in the future
 * Template: In-memory (no R2)
 * Export: Deploy to Cloudflare Workers in user's account
 */
export class WorkflowObjective<TState extends BaseProjectState = BaseProjectState> 
  extends ProjectObjective<TState> {
  
  constructor(infrastructure: AgentInfrastructure<TState>) {
    super(infrastructure);
  }
  
  // ==========================================
  // IDENTITY
  // ==========================================
  
  getType(): ProjectType {
    return 'workflow';
  }

  // ==========================================
  // RUNTIME & INFRASTRUCTURE
  // ==========================================
  
  getRuntime(): RuntimeType {
    return 'worker';
  }
  
  needsTemplate(): boolean {
    return false; // In-memory templates
  }
  
  getTemplateType(): string | null {
    return null;
  }

  // ==========================================
  // EXPORT/DEPLOYMENT
  // ==========================================

  async export(_options?: ExportOptions): Promise<ExportResult> {
    this.logger.info('Workflow export requested but not yet implemented');
    
    return {
      success: false,
      error: 'Workflow deployment not yet implemented'
    };
  }
}
