/**
 * Setup routes for AI Gateway analytics endpoints
 */
import { AnalyticsController } from '../controllers/analytics/controller';
import { Hono } from 'hono';
import { AppEnv } from '../../types/appenv';
import { AuthConfig, setAuthLevel } from '../../middleware/auth/routeAuth';
import { adaptController } from '../honoAdapter';

/**
 * Setup analytics routes
 */
export function setupAnalyticsRoutes(app: Hono<AppEnv>): void {
    // User analytics - requires authentication
    app.get(
        '/api/user/:id/analytics',
        setAuthLevel(AuthConfig.ownerOnly),
        adaptController(AnalyticsController, AnalyticsController.getUserAnalytics)
    );

    // Agent/Chat analytics - requires authentication
    app.get(
        '/api/agent/:id/analytics',
        setAuthLevel(AuthConfig.ownerOnly),
        adaptController(AnalyticsController, AnalyticsController.getAgentAnalytics)
    );
}