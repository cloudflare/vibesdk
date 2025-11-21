/**
 * Analytics Controller
 * Handles AI Gateway analytics API endpoints
 */

import { BaseController } from '../baseController';
import { RouteContext } from '../../types/route-context';
import { ApiResponse, ControllerResponse } from '../types';
import { AiGatewayAnalyticsService } from '../../../services/analytics/AiGatewayAnalyticsService';

import { UserAnalyticsResponseData, AgentAnalyticsResponseData } from './types';
import { AnalyticsError } from '../../../services/analytics/types';
import { createLogger } from '../../../logger';

export class AnalyticsController extends BaseController {
    static logger = createLogger('AnalyticsController');
	/**
	 * Get analytics data for a specific user
	 * GET /api/user/:id/analytics
	 */
	static async getUserAnalytics(
		request: Request,
		env: Env,
		_ctx: ExecutionContext,
		context: RouteContext,
	): Promise<ControllerResponse<ApiResponse<UserAnalyticsResponseData>>> {
		try {
			// Extract authenticated user from context
			const authUser = context.user!;

			// Extract route parameters
			const userId = context.pathParams.id;

			if (!userId) {
				return AnalyticsController.createErrorResponse<UserAnalyticsResponseData>(
					'User ID is required',
					400,
				);
			}

			// Verify user can only access their own analytics
			if (authUser.id !== userId) {
				return AnalyticsController.createErrorResponse<UserAnalyticsResponseData>(
					'You can only access your own analytics',
					403,
				);
			}

			// Parse query parameters
			const url = new URL(request.url);
			const daysParam = url.searchParams.get('days');

			// If days is provided, validate it; otherwise use all-time (undefined)
			let days: number | undefined;
			if (daysParam) {
				days = parseInt(daysParam);
				if (isNaN(days) || days < 1 || days > 365) {
					return AnalyticsController.createErrorResponse<UserAnalyticsResponseData>(
						'Days must be between 1 and 365',
						400,
					);
				}
			}

			// Get analytics data
            const service = new AiGatewayAnalyticsService(env);
			const analyticsData = await service.getUserAnalytics(
				userId,
				days,
			);

			this.logger.info('User analytics retrieved successfully', {
				userId,
				days: days || 'all-time',
				requestCount: analyticsData.totalRequests,
				cost: analyticsData.totalCost,
				requestedBy: authUser.id,
			});

			return AnalyticsController.createSuccessResponse(analyticsData);
		} catch (error) {
			this.logger.error('Error fetching user analytics:', error);

			if (error instanceof AnalyticsError) {
				return AnalyticsController.createErrorResponse<UserAnalyticsResponseData>(
					error.message,
					error.statusCode,
				);
			}

			return AnalyticsController.createErrorResponse<UserAnalyticsResponseData>(
				'Failed to fetch user analytics',
				500,
			);
		}
	}

	/**
	 * Get analytics data for a specific agent/chat
	 * GET /api/agent/:id/analytics
	 */
	static async getAgentAnalytics(
		request: Request,
		env: Env,
		_ctx: ExecutionContext,
		context: RouteContext,
	): Promise<ControllerResponse<ApiResponse<AgentAnalyticsResponseData>>> {
		try {
			// Extract authenticated user from context
			const authUser = context.user!;
			// Extract route parameters
			const agentId = context.pathParams.id;

			if (!agentId) {
				return AnalyticsController.createErrorResponse<AgentAnalyticsResponseData>(
					'Agent ID is required',
					400,
				);
			}

			// Ownership verification is handled by AuthConfig.ownerOnly middleware

			// Parse query parameters
			const url = new URL(request.url);
			const daysParam = url.searchParams.get('days');

			// If days is provided, validate it; otherwise use all-time (undefined)
			let days: number | undefined;
			if (daysParam) {
				days = parseInt(daysParam);
				if (isNaN(days) || days < 1 || days > 365) {
					return AnalyticsController.createErrorResponse<AgentAnalyticsResponseData>(
						'Days must be between 1 and 365',
						400,
					);
				}
			}

			// Get analytics data
            const service = new AiGatewayAnalyticsService(env);
			const analyticsData = await service.getChatAnalytics(
				agentId,
				days,
			);

			this.logger.info('Agent analytics retrieved successfully', {
				agentId,
				days: days || 'all-time',
				requestCount: analyticsData.totalRequests,
				cost: analyticsData.totalCost,
				requestedBy: authUser.id,
			});

			return AnalyticsController.createSuccessResponse(analyticsData);
		} catch (error) {
			this.logger.error('Error fetching agent analytics:', error);

			if (error instanceof AnalyticsError) {
				return AnalyticsController.createErrorResponse<AgentAnalyticsResponseData>(
					error.message,
					error.statusCode,
				);
			}

			return AnalyticsController.createErrorResponse<AgentAnalyticsResponseData>(
				'Failed to fetch agent analytics',
				500,
			);
		}
	}
}
