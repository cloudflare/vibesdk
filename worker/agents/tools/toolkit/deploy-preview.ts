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
				'Deploys the current application to a preview environment. **ONLY use this tool when:** (1) User explicitly requests deployment/deploy, OR (2) User reports the preview screen is blank/not showing anything, OR (3) User reports the preview page keeps refreshing/reloading. Do NOT use this tool for regular code changes - the preview auto-updates.',
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
