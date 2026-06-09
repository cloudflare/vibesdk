import { Hono } from 'hono';
import { StatusController } from '../controllers/status/controller';
import { adaptController } from '../honoAdapter';
import { AppEnv } from '../../types/appenv';
import { AuthConfig, setAuthLevel } from '../../middleware/auth/routeAuth';

export function setupStatusRoutes(app: Hono<AppEnv>): void {
    const statusRouter = new Hono<AppEnv>();

    statusRouter.get('/', setAuthLevel(AuthConfig.public), adaptController(StatusController, StatusController.getPlatformStatus));

    app.route('/api/status', statusRouter);
}
