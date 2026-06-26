/**
 * Cloudflare Account Controller
 * Manage user's Cloudflare accounts and AI Gateways
 */

import { BaseController } from '../baseController';
import { RouteContext } from '../../types/route-context';
import { CloudflareAccountService } from '../../../services/cloudflare/CloudflareAccountService';
import { UserService } from '../../../database/services/UserService';
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
	 * Revoke the current Cloudflare OAuth connection for the user. Clears the HttpOnly
	 * token cookie AND deletes the stored account/gateway rows so no server-side state
	 * survives a disconnect (closes the persistence half of the account-hijack chain).
	 * A subsequent reconnect re-provisions from scratch.
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
		try {
			const accountService = new CloudflareAccountService(env);
			await accountService.deleteAllForUser(user.id);
		} catch (error) {
			this.logger.error('Failed to delete Cloudflare account rows on disconnect', error);
			return CloudflareAccountController.createErrorResponse(
				error instanceof Error ? error.message : 'Failed to disconnect',
				500,
			);
		}

		const response = CloudflareAccountController.createSuccessResponse({ message: 'Disconnected' });
		response.headers.append('Set-Cookie', buildClearTokenCookie(env));
		return response;
	}

	/**
	 * GET /api/cloudflare/ai-gateway-preference
	 * Return the user's resolved AI Gateway usage preference.
	 */
	static async getAiGatewayPreference(
		_request: Request,
		env: Env,
		_ctx: ExecutionContext,
		context: RouteContext,
	): Promise<Response> {
		const user = context.user;
		if (!user) {
			return CloudflareAccountController.createErrorResponse('Authentication required', 401);
		}

		try {
			const pref = await new UserService(env).getAiGatewayPreference(user.id);
			return CloudflareAccountController.createSuccessResponse(pref);
		} catch (error) {
			this.logger.error('Error getting AI Gateway preference', error);
			return CloudflareAccountController.createErrorResponse(
				error instanceof Error ? error.message : 'Failed to get preference',
				500,
			);
		}
	}

	/**
	 * PUT /api/cloudflare/ai-gateway-preference
	 * Set whether the user's own AI Gateway should be used for inference.
	 */
	static async setAiGatewayPreference(
		request: Request,
		env: Env,
		_ctx: ExecutionContext,
		context: RouteContext,
	): Promise<Response> {
		const user = context.user;
		if (!user) {
			return CloudflareAccountController.createErrorResponse('Authentication required', 401);
		}

		try {
			const body = (await request.json()) as { enabled?: unknown };
			if (typeof body.enabled !== 'boolean') {
				return CloudflareAccountController.createErrorResponse(
					'enabled (boolean) is required',
					400,
				);
			}

			const userService = new UserService(env);
			await userService.setAiGatewayPreference(user.id, body.enabled);
			const pref = await userService.getAiGatewayPreference(user.id);
			return CloudflareAccountController.createSuccessResponse(pref);
		} catch (error) {
			this.logger.error('Error setting AI Gateway preference', error);
			return CloudflareAccountController.createErrorResponse(
				error instanceof Error ? error.message : 'Failed to set preference',
				500,
			);
		}
	}
}
