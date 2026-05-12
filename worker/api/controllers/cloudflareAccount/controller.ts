/**
 * Cloudflare Account Controller
 * Manage user's Cloudflare accounts and AI Gateways
 */

import { BaseController } from '../baseController';
import { RouteContext } from '../../types/route-context';
import { CloudflareAccountService } from '../../../services/cloudflare/CloudflareAccountService';
import { createLogger } from '../../../logger';
import { buildClearTokenCookie } from '../../../utils/oauthCookie';

export class CloudflareAccountController extends BaseController {
	static logger = createLogger('CloudflareAccountController');

	/**
	 * GET /api/cloudflare/accounts
	 * Get all user's Cloudflare accounts with their gateways
	 */
	static async getAccounts(
		_request: Request,
		env: Env,
		_ctx: ExecutionContext,
		context: RouteContext,
	): Promise<Response> {
		const user = context.user;
		if (!user) {
			return CloudflareAccountController.createErrorResponse(
				'Authentication required',
				401,
			);
		}

		try {
			const accountService = new CloudflareAccountService(env);
			const accounts = await accountService.getUserAccountsWithGateways(user.id);

			return CloudflareAccountController.createSuccessResponse(accounts);
		} catch (error) {
			this.logger.error('Error getting user accounts', error);
			return CloudflareAccountController.createErrorResponse(
				error instanceof Error ? error.message : 'Failed to get accounts',
				500,
			);
		}
	}

	/**
	 * PUT /api/cloudflare/selection
	 * Set user's selected account and gateway
	 */
	static async setSelection(
		request: Request,
		env: Env,
		_ctx: ExecutionContext,
		context: RouteContext,
	): Promise<Response> {
		const user = context.user;
		if (!user) {
			return CloudflareAccountController.createErrorResponse(
				'Authentication required',
				401,
			);
		}

		try {
			const body = await request.json() as { accountId: string; gatewayId: string };

			if (!body.accountId || !body.gatewayId) {
				return CloudflareAccountController.createErrorResponse(
					'accountId and gatewayId are required',
					400,
				);
			}

			const accountService = new CloudflareAccountService(env);
			const success = await accountService.setUserSelection(
				user.id,
				body.accountId,
				body.gatewayId
			);

			if (!success) {
				return CloudflareAccountController.createErrorResponse(
					'Invalid account or gateway selection',
					400,
				);
			}

			return CloudflareAccountController.createSuccessResponse({ message: 'Selection updated successfully' });
		} catch (error) {
			this.logger.error('Error setting user selection', error);
			return CloudflareAccountController.createErrorResponse(
				error instanceof Error ? error.message : 'Failed to set selection',
				500,
			);
		}
	}

	/**
	 * DELETE /api/cloudflare/connection
	 * Revoke the current Cloudflare OAuth connection for the user by clearing the
	 * HttpOnly token cookie. Stored account/gateway selections are retained so the
	 * user can reconnect without reconfiguring.
	 */
	static async disconnect(
		_request: Request,
		env: Env,
		_ctx: ExecutionContext,
		context: RouteContext,
	): Promise<Response> {
		const user = context.user;
		if (!user) {
			return CloudflareAccountController.createErrorResponse(
				'Authentication required',
				401,
			);
		}

		this.logger.info('User disconnecting Cloudflare OAuth', { userId: user.id });
		const response = CloudflareAccountController.createSuccessResponse({ message: 'Disconnected' });
		response.headers.append('Set-Cookie', buildClearTokenCookie(env));
		return response;
	}
}
