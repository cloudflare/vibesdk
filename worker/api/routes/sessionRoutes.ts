import { Hono } from 'hono';
import type { AppEnv } from '../../types/appenv';
import { adaptController } from '../honoAdapter';
import { AuthConfig, setAuthLevel } from '../../middleware/auth/routeAuth';
import { SessionMonitorController } from '../controllers/sessions/monitorController';
import { SessionQualityController } from '../controllers/sessions/qualityController';
import { GitLogController } from '../controllers/sessions/gitLogController';

/**
 * Session-scoped read endpoints (monitor, quality, git history, etc.). Owner-checked inside
 * each controller.
 */
export function setupSessionRoutes(app: Hono<AppEnv>): void {
    app.get(
        '/api/sessions/:sessionId/monitor',
        setAuthLevel(AuthConfig.authenticated),
        adaptController(SessionMonitorController, SessionMonitorController.getMonitor),
    );

    app.get(
        '/api/sessions/:sessionId/quality',
        setAuthLevel(AuthConfig.authenticated),
        adaptController(SessionQualityController, SessionQualityController.getSessionQuality),
    );

    app.get(
        '/api/sessions/:sessionId/git/log',
        setAuthLevel(AuthConfig.authenticated),
        adaptController(GitLogController, GitLogController.getGitLog),
    );
}
