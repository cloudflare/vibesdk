import { Hono } from 'hono';
import type { AppEnv } from '../../types/appenv';
import { adaptController } from '../honoAdapter';
import { AuthConfig, setAuthLevel } from '../../middleware/auth/routeAuth';
import { SessionMonitorController } from '../controllers/sessions/monitorController';

/**
 * Session-scoped read endpoints (monitor, etc.). Owner-checked inside the
 * controller via agent_budgets.userId.
 */
export function setupSessionRoutes(app: Hono<AppEnv>): void {
    app.get(
        '/api/sessions/:sessionId/monitor',
        setAuthLevel(AuthConfig.authenticated),
        adaptController(SessionMonitorController, SessionMonitorController.getMonitor),
    );
}
