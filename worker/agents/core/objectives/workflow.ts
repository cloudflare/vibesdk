import { ProjectObjective } from './base';
import { BaseProjectState } from '../state';
import {
	ProjectType,
	RuntimeType,
	ExportResult,
	ExportOptions,
	DeployResult,
	DeployOptions,
} from '../types';
import type { AgentInfrastructure } from '../AgentCore';
import { WebSocketMessageResponses } from '../../constants';

/**
 * WIP!
 * WorkflowObjective - Backend-Only Workflows
 *
 * Produces: Cloudflare Workers without UI (APIs, scheduled jobs, queues)
 * Runtime: Sandbox for now, Dynamic Worker Loaders in the future
 * Template: In-memory (no R2)
 * Export: Deploy to Cloudflare Workers in user's account
 */
export class WorkflowObjective<
	TState extends BaseProjectState = BaseProjectState,
> extends ProjectObjective<TState> {
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

	// ==========================================
	// DEPLOYMENT & EXPORT
	// ==========================================

	async deploy(options?: DeployOptions): Promise<DeployResult> {
		const target = options?.target ?? 'user';

		try {
			this.logger.info(
				'Deploying workflow to Cloudflare Workers (user account)',
				{ target },
			);

			const result = await this.deploymentManager.deployToCloudflare({
				target,
				callbacks: {
					onStarted: (data) => {
						this.broadcast(
							WebSocketMessageResponses.CLOUDFLARE_DEPLOYMENT_STARTED,
							data,
						);
					},
					onCompleted: (data) => {
						this.broadcast(
							WebSocketMessageResponses.CLOUDFLARE_DEPLOYMENT_COMPLETED,
							data,
						);
					},
					onError: (data) => {
						this.broadcast(
							WebSocketMessageResponses.CLOUDFLARE_DEPLOYMENT_ERROR,
							data,
						);
					},
				},
			});

			return {
				success: !!result.deploymentUrl,
				target,
				url: result.deploymentUrl || undefined,
				deploymentId: result.deploymentId,
				metadata: {
					deploymentId: result.deploymentId,
					workersUrl: result.deploymentUrl,
				},
			};
		} catch (error) {
			const message =
				error instanceof Error
					? error.message
					: 'Unknown workflow deployment error';
			this.logger.error('Workflow deployment failed', error);
			this.broadcast(
				WebSocketMessageResponses.CLOUDFLARE_DEPLOYMENT_ERROR,
				{
					message: 'Workflow deployment failed',
					error: message,
				},
			);

			return {
				success: false,
				target,
				error: message,
			};
		}
	}

	async export(options: ExportOptions): Promise<ExportResult> {
		if (options.kind !== 'workflow') {
			const error =
				'Workflow export must be invoked with kind="workflow"';
			this.logger.warn(error, { kind: options.kind });
			return { success: false, error };
		}

		const deployResult = await this.deploy(options);
		return {
			success: deployResult.success,
			url: deployResult.url,
			error: deployResult.error,
			metadata: deployResult.metadata,
		};
	}
}
