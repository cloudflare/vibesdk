import { ProjectObjective } from './base';
import { BaseProjectState } from '../state';
import { ProjectType, RuntimeType, ExportResult, ExportOptions, DeployResult, DeployOptions } from '../types';
import type { AgentInfrastructure } from '../AgentCore';
import { WebSocketMessageResponses, PREVIEW_EXPIRED_ERROR } from '../../constants';
import { AppService } from '../../../database/services/AppService';

/**
 * WIP - PresentationObjective - Slides/Docs/Marketing Materials
 * 
 * Produces: Spectacle-based presentations
 * Runtime: Sandbox
 * Template: Spectacle template (R2-backed)
 * Export: PDF, Google Slides, PowerPoint
 * 
 */
export class PresentationObjective<TState extends BaseProjectState = BaseProjectState> 
  extends ProjectObjective<TState> {
  
  constructor(infrastructure: AgentInfrastructure<TState>) {
    super(infrastructure);
  }
  
  // ==========================================
  // IDENTITY
  // ==========================================
  
  getType(): ProjectType {
    return 'presentation';
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
    return 'spectacle'; // New template to be created
  }

  // ==========================================
  // DEPLOYMENT & EXPORT
  // ==========================================

  async deploy(options?: DeployOptions): Promise<DeployResult> {
    const target = options?.target ?? 'platform';
    if (target !== 'platform') {
      const error = `Unsupported deployment target "${target}" for presentations`;
      this.logger.error(error);
      return { success: false, target, error };
    }

    try {
      this.logger.info('Deploying presentation to Workers for Platforms');

      if (!this.state.sandboxInstanceId) {
        await this.deploymentManager.deployToSandbox();

        if (!this.state.sandboxInstanceId) {
          const error = 'Failed to deploy to sandbox service';
          this.logger.error(error);
          return { success: false, target, error };
        }
      }

      const result = await this.deploymentManager.deployToCloudflare({
        target,
        callbacks: {
          onStarted: (data) => this.broadcast(WebSocketMessageResponses.CLOUDFLARE_DEPLOYMENT_STARTED, data),
          onCompleted: (data) => this.broadcast(WebSocketMessageResponses.CLOUDFLARE_DEPLOYMENT_COMPLETED, data),
          onError: (data) => this.broadcast(WebSocketMessageResponses.CLOUDFLARE_DEPLOYMENT_ERROR, data),
          onPreviewExpired: () => {
            this.deploymentManager.deployToSandbox();
            this.broadcast(WebSocketMessageResponses.CLOUDFLARE_DEPLOYMENT_ERROR, {
              message: PREVIEW_EXPIRED_ERROR,
              error: PREVIEW_EXPIRED_ERROR
            });
          }
        }
      });

      if (result.deploymentUrl && result.deploymentId) {
        const appService = new AppService(this.env);
        await appService.updateDeploymentId(this.getAgentId(), result.deploymentId);
      }

      return {
        success: !!result.deploymentUrl,
        target,
        url: result.deploymentUrl || undefined,
        metadata: {
          deploymentId: result.deploymentId,
          workersUrl: result.deploymentUrl
        }
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown presentation deployment error';
      this.logger.error('Presentation deployment error:', error);
      this.broadcast(WebSocketMessageResponses.CLOUDFLARE_DEPLOYMENT_ERROR, {
        message: 'Deployment failed',
        error: message
      });
      return { success: false, target, error: message };
    }
  }

  async export(options: ExportOptions): Promise<ExportResult> {
    const allowedKinds: Array<ExportOptions['kind']> = ['pdf', 'pptx', 'googleslides'];
    if (!allowedKinds.includes(options.kind)) {
      const error = `Unsupported presentation export kind "${options.kind}"`;
      this.logger.warn(error);
      return { success: false, error };
    }

    const format = options.format || options.kind;
    this.logger.info('Presentation export requested', { format });

    return {
      success: false,
      error: 'Presentation export not yet implemented - coming in Phase 3',
      metadata: { format }
    };
  }
}
