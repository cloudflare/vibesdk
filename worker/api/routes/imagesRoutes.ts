import { Hono } from 'hono';
import { AppEnv } from '../../types/appenv';
import { ScreenshotsController } from '../controllers/screenshots/controller';
import { adaptController } from '../honoAdapter';
import { setAuthLevel, AuthConfig } from '../../middleware/auth/routeAuth';

export function setupScreenshotRoutes(app: Hono<AppEnv>): void {
  const screenshotsRouter = new Hono<AppEnv>();

  // Publicly serve screenshots (they are non-sensitive previews of generated apps)
  screenshotsRouter.get('/:id/:file', setAuthLevel(AuthConfig.public), adaptController(ScreenshotsController, ScreenshotsController.serveScreenshot));

  app.route('/api/screenshots', screenshotsRouter);

//   const imagesRouter = new Hono<AppEnv>();
//   // Publicly serve image uploads
//   imagesRouter.get('/:id/:file', setAuthLevel(AuthConfig.authenticated), adaptController(ScreenshotsController, ScreenshotsController.serveScreenshot));

//   app.route('/api/uploads', imagesRouter);
}
