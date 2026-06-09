/**
 * Limits Routes
 * Routes for usage limits and free tier management
 */

import { Hono } from 'hono';
import { AppEnv } from '../../types/appenv';
import { adaptController } from '../honoAdapter';
import { AuthConfig, setAuthLevel } from '../../middleware/auth/routeAuth';
import { LimitsController } from '../controllers/limits/controller';

export function setupLimitsRoutes(app: Hono<AppEnv>): void {
	// User endpoint - get their own usage
	app.get(
		'/api/limits/usage',
		setAuthLevel(AuthConfig.authenticated),
		adaptController(LimitsController, LimitsController.getUsage),
	);
}
