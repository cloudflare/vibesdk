/**
 * Limits Controller
 * API endpoints for viewing usage limits
 */

import { BaseController } from '../baseController';
import { RouteContext } from '../../types/route-context';
import { checkUsageAndBalance, hasCloudflareConfigured } from '../../../services/rate-limit';
import { createLogger } from '../../../logger';

export class LimitsController extends BaseController {
	static logger = createLogger('LimitsController');

	/**
	 * GET /api/limits/usage
	 * Get current usage and limits for the authenticated user
	 */
	static async getUsage(
		request: Request,
		env: Env,
		_ctx: ExecutionContext,
		context: RouteContext,
	): Promise<Response> {
		const user = context.user;
		if (!user) {
			return LimitsController.createErrorResponse('Authentication required', 401);
		}

		try {
			// Token is read from the HttpOnly cookie inside checkUsageAndBalance.
			const [usageResult, hasCfConfigured] = await Promise.all([
				checkUsageAndBalance(env, user.id, request),
				hasCloudflareConfigured(env, user.id),
			]);

			const window = usageResult.windowKind ?? 'rolling';
			const used = Number.isFinite(usageResult.limit) ? usageResult.limit - usageResult.remaining : 0;
			const response = LimitsController.createSuccessResponse({
				config: {
					limit: {
						type: 'credits',
						window,
						maxValue: usageResult.limit,
						enabled: true,
						periodSeconds: usageResult.periodSeconds,
						resetAt: usageResult.resetAt,
					},
					unlimited: !Number.isFinite(usageResult.limit),
				},
				usage: {
					credits: {
						[window]: used,
					},
				},
				limitCheck: {
					withinLimits: usageResult.withinLimits,
					exceededLimits: usageResult.withinLimits ? [] : [{
						type: 'credits',
						window,
						current: used,
						max: usageResult.limit,
						percentUsed: Number.isFinite(usageResult.limit) && usageResult.limit > 0
							? (used / usageResult.limit) * 100
							: 0,
					}],
					message: usageResult.withinLimits ? 'Within limits' : 'Limit exceeded',
				},
				hasUserToken: usageResult.hasUserToken,
				hasCloudflareConfigured: hasCfConfigured,
				cloudflareCredits: usageResult.balance !== null ? {
					credits: usageResult.balance,
					currency: 'USD',
				} : null,
			});
			if (usageResult.refreshedCookie) {
				response.headers.append('Set-Cookie', usageResult.refreshedCookie);
			}
			return response;
		} catch (error) {
			this.logger.error('Error getting usage', error);
			return LimitsController.createErrorResponse(
				error instanceof Error ? error.message : 'Failed to get usage',
				500,
			);
		}
	}
}
