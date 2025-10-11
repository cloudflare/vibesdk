import { Hono } from 'hono';
import { AppEnv } from '../../types/appenv';
import { ScreenshotsController } from '../controllers/screenshots/controller';
import { adaptController } from '../honoAdapter';
import { setAuthLevel, AuthConfig } from '../../middleware/auth/routeAuth';

export function setupScreenshotRoutes(app: Hono<AppEnv>): void {
  const router = new Hono<AppEnv>();

  // Publicly serve screenshots (they are non-sensitive previews of generated apps)
  router.get('/:id/:file', setAuthLevel(AuthConfig.authenticated), adaptController(ScreenshotsController, ScreenshotsController.serveScreenshot));

  app.route('/api/screenshots', router);
}
