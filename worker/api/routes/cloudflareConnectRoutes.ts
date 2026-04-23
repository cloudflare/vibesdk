import { Hono } from 'hono';
import { AppEnv } from '../../types/appenv';
import { adaptController } from '../honoAdapter';
import { AuthConfig, setAuthLevel } from '../../middleware/auth/routeAuth';
import { CloudflareConnectController } from '../controllers/cloudflareConnect/controller';

export function setupCloudflareConnectRoutes(app: Hono<AppEnv>): void {
	app.get(
		'/oauth/login',
		setAuthLevel(AuthConfig.authenticated),
		adaptController(
			CloudflareConnectController,
			CloudflareConnectController.initiateConnect,
		),
	);

	app.get(
		'/auth/callback',
		setAuthLevel(AuthConfig.public),
		adaptController(
			CloudflareConnectController,
			CloudflareConnectController.handleCallback,
		),
	);
}
