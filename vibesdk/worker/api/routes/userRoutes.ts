import { UserController } from '../controllers/user/controller';
import { Hono } from 'hono';
import { AppEnv } from '../../types/appenv';
import { adaptController } from '../honoAdapter';
import { AuthConfig, setAuthLevel } from '../../middleware/auth/routeAuth';

/**
 * Setup user management routes
 */
export function setupUserRoutes(app: Hono<AppEnv>): void {
    // User apps with pagination (this is what the frontend needs)
    app.get('/api/user/apps', setAuthLevel(AuthConfig.authenticated), adaptController(UserController, UserController.getApps));

    // User profile
    app.put('/api/user/profile', setAuthLevel(AuthConfig.authenticated), adaptController(UserController, UserController.updateProfile));
}