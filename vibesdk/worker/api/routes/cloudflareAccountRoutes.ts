/**
 * Cloudflare Account Routes
 * Routes for managing Cloudflare accounts and AI Gateways
 */

import { Hono } from 'hono';
import { AppEnv } from '../../types/appenv';
import { adaptController } from '../honoAdapter';
import { AuthConfig, setAuthLevel } from '../../middleware/auth/routeAuth';
import { CloudflareAccountController } from '../controllers/cloudflareAccount/controller';

export function setupCloudflareAccountRoutes(app: Hono<AppEnv>): void {
	// Get all user accounts with gateways
	app.get(
		'/api/cloudflare/accounts',
		setAuthLevel(AuthConfig.authenticated),
		adaptController(CloudflareAccountController, CloudflareAccountController.getAccounts)
	);

	// Set user's selected account and gateway
	app.put(
		'/api/cloudflare/selection',
		setAuthLevel(AuthConfig.authenticated),
		adaptController(CloudflareAccountController, CloudflareAccountController.setSelection)
	);

	// Disconnect: clear the HttpOnly OAuth cookie. Token refresh is transparent now,
	// so there is no longer a separate /refresh-token endpoint.
	app.delete(
		'/api/cloudflare/connection',
		setAuthLevel(AuthConfig.authenticated),
		adaptController(CloudflareAccountController, CloudflareAccountController.disconnect)
	);
}
