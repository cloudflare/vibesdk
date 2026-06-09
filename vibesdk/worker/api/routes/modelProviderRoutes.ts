/**
 * Model Provider Routes
 * Routes for custom model provider management
 */
import { Hono } from 'hono';
import { AppEnv } from '../../types/appenv';
import { ModelProvidersController } from '../controllers/modelProviders/controller';
import { AuthConfig, setAuthLevel } from '../../middleware/auth/routeAuth';
import { adaptController } from '../honoAdapter';

export function setupModelProviderRoutes(app: Hono<AppEnv>): void {
    // Custom model provider routes
    app.get('/api/user/providers', setAuthLevel(AuthConfig.authenticated), adaptController(ModelProvidersController, ModelProvidersController.getProviders));
    app.get('/api/user/providers/:id', setAuthLevel(AuthConfig.authenticated), adaptController(ModelProvidersController, ModelProvidersController.getProvider));
    app.post('/api/user/providers', setAuthLevel(AuthConfig.authenticated), adaptController(ModelProvidersController, ModelProvidersController.createProvider));
    app.put('/api/user/providers/:id', setAuthLevel(AuthConfig.authenticated), adaptController(ModelProvidersController, ModelProvidersController.updateProvider));
    app.delete('/api/user/providers/:id', setAuthLevel(AuthConfig.authenticated), adaptController(ModelProvidersController, ModelProvidersController.deleteProvider));
    app.post('/api/user/providers/test', setAuthLevel(AuthConfig.authenticated), adaptController(ModelProvidersController, ModelProvidersController.testProvider));
}