import { ProjectObjective } from './base';
import { BaseProjectState } from '../state';
import { ProjectType, RuntimeType, ExportResult, ExportOptions } from '../types';
import { WebSocketMessageResponses, PREVIEW_EXPIRED_ERROR } from '../../constants';
import { AppService } from '../../../database/services/AppService';
import type { AgentInfrastructure } from '../AgentCore';

/**
 * AppObjective - Full-Stack Web Applications
 * 
 * Produces: React + Vite + Cloudflare Workers full-stack applications
 * Runtime: Cloudflare Containers (sandbox)
 * Template: R2-backed React templates
 * Export: Deploy to Cloudflare Workers for platform (and soon User's personal Cloudflare account)
 * 
 * This is the EXISTING, ORIGINAL project type.
 * All current production apps are AppObjective.
 */
export class AppObjective<TState extends BaseProjectState = BaseProjectState> 
  extends ProjectObjective<TState> {
  
  constructor(infrastructure: AgentInfrastructure<TState>) {
    super(infrastructure);
  }
  
  // ==========================================
  // IDENTITY
  // ==========================================
  
  getType(): ProjectType {
    return 'app';
  }

  // ==========================================
  // RUNTIME & INFRASTRUCTURE
  // ==========================================
  
  getRuntime(): RuntimeType {
    return 'sandbox';
  }
  
  needsTemplate(): boolean {
    return true;
  }
  
  getTemplateType(): string | null {
    return this.state.templateName;
  }

  // ==========================================
  // LIFECYCLE HOOKS
  // ==========================================
  
  /**
   * After code generation, auto-deploy to sandbox for preview
   */
  async onCodeGenerated(): Promise<void> {
    this.logger.info('AppObjective: Code generation complete, auto-deploying to sandbox');
    
    try {
      await this.deploymentManager.deployToSandbox();
      this.logger.info('AppObjective: Auto-deployment to sandbox successful');
    } catch (error) {
      this.logger.error('AppObjective: Auto-deployment to sandbox failed', error);
      // Don't throw - generation succeeded even if deployment failed
    }
  }

  // ==========================================
  // EXPORT/DEPLOYMENT
  // ==========================================
  
  async export(_options?: ExportOptions): Promise<ExportResult> {
    try {
      this.logger.info('Exporting app to Cloudflare Workers + Pages');
      
      // Ensure sandbox instance exists first
      if (!this.state.sandboxInstanceId) {
        this.logger.info('No sandbox instance, deploying to sandbox first');
        await this.deploymentManager.deployToSandbox();
        
        if (!this.state.sandboxInstanceId) {
          this.logger.error('Failed to deploy to sandbox service');
          this.broadcast(WebSocketMessageResponses.CLOUDFLARE_DEPLOYMENT_ERROR, {
            message: 'Deployment failed: Failed to deploy to sandbox service',
            error: 'Sandbox service unavailable'
          });
          return {
            success: false,
            error: 'Failed to deploy to sandbox service'
          };
        }
      }

      // Deploy to Cloudflare Workers + Pages
      const result = await this.deploymentManager.deployToCloudflare({
        onStarted: (data) => {
          this.broadcast(WebSocketMessageResponses.CLOUDFLARE_DEPLOYMENT_STARTED, data);
        },
        onCompleted: (data) => {
          this.broadcast(WebSocketMessageResponses.CLOUDFLARE_DEPLOYMENT_COMPLETED, data);
        },
        onError: (data) => {
          this.broadcast(WebSocketMessageResponses.CLOUDFLARE_DEPLOYMENT_ERROR, data);
        },
        onPreviewExpired: () => {
          // Re-deploy sandbox and broadcast error
          this.deploymentManager.deployToSandbox();
          this.broadcast(WebSocketMessageResponses.CLOUDFLARE_DEPLOYMENT_ERROR, {
            message: PREVIEW_EXPIRED_ERROR,
            error: PREVIEW_EXPIRED_ERROR
          });
        }
      });

      // Update database with deployment ID if successful
      if (result.deploymentUrl && result.deploymentId) {
        const appService = new AppService(this.env);
        await appService.updateDeploymentId(
          this.getAgentId(),
          result.deploymentId
        );
        
        this.logger.info('Updated app deployment ID in database', {
          agentId: this.getAgentId(),
          deploymentId: result.deploymentId
        });
      }

      return {
        success: !!result.deploymentUrl,
        url: result.deploymentUrl || undefined,
        metadata: {
          deploymentId: result.deploymentId,
          workersUrl: result.deploymentUrl
        }
      };

    } catch (error) {
      this.logger.error('Cloudflare deployment error:', error);
      this.broadcast(WebSocketMessageResponses.CLOUDFLARE_DEPLOYMENT_ERROR, {
        message: 'Deployment failed',
        error: error instanceof Error ? error.message : String(error)
      });
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown deployment error'
      };
    }
  }
}
