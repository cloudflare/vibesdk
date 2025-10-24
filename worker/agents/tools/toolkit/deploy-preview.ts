import { ErrorResult, ToolDefinition } from '../types';
import { StructuredLogger } from '../../../logger';
import { CodingAgentInterface } from 'worker/agents/services/implementations/CodingAgent';

type DeployPreviewArgs = Record<string, never>;

type DeployPreviewResult = { message: string } | ErrorResult;

export function createDeployPreviewTool(
	agent: CodingAgentInterface,
	logger: StructuredLogger
): ToolDefinition<DeployPreviewArgs, DeployPreviewResult> {
	return {
		type: 'function' as const,
		function: {
			name: 'deploy_preview',
			description:
				'Uploads and syncs the current application to the preview environment. After deployment, the app is live at the preview URL, but runtime logs (get_logs) will only appear when the user interacts with the app - not automatically after deployment. CRITICAL: After deploying, use wait(20-30) to allow time for user interaction before checking logs.',
			parameters: {
				type: 'object',
				properties: {},
				required: [],
			},
		},
		implementation: async (_args) => {
			try {
				logger.info('Deploying preview to sandbox environment');
				const result = await agent.deployPreview();
				logger.info('Preview deployment completed', { result });
				return { message: result };
			} catch (error) {
				return {
					error:
						error instanceof Error
							? `Failed to deploy preview: ${error.message}`
							: 'Unknown error occurred while deploying preview',
				};
			}
		},
	};
}
