import { StatsController } from '../controllers/stats/controller';
import { Hono } from 'hono';
import { AppEnv } from '../../types/appenv';
import { adaptController } from '../honoAdapter';
import { AuthConfig, setAuthLevel } from '../../middleware/auth/routeAuth';

/**
 * Setup user statistics routes
 */
export function setupStatsRoutes(app: Hono<AppEnv>): void {
    // User statistics
    app.get('/api/stats', setAuthLevel(AuthConfig.authenticated), adaptController(StatsController, StatsController.getUserStats));
    
    // User activity timeline
    app.get('/api/stats/activity', setAuthLevel(AuthConfig.authenticated), adaptController(StatsController, StatsController.getUserActivity));
}