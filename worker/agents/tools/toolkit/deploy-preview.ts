import { tool, t } from '../types';
import { StructuredLogger } from '../../../logger';
import { ICodingAgent } from 'worker/agents/services/interfaces/ICodingAgent';

export function createDeployPreviewTool(
	agent: ICodingAgent,
	logger: StructuredLogger
) {
	return tool({
		name: 'deploy_preview',
		description:
			'Uploads and syncs the current application to the preview environment. After deployment, the app is live at the preview URL, but runtime logs (get_logs) will only appear when the user interacts with the app - not automatically after deployment. CRITICAL: After deploying, use wait(20-30) to allow time for user interaction before checking logs. Use force_redeploy=true to force a redeploy (will reset session ID and spawn a new sandbox, is expensive) ',
		args: {
			force_redeploy: t.deployment.force().describe('Force a full redeploy (resets session ID and spawns new sandbox)'),
		},
		run: async ({ force_redeploy }) => {
			try {
				logger.info('Deploying preview to sandbox environment');
				const result = await agent.deployPreview(undefined, force_redeploy);
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
	});
}
