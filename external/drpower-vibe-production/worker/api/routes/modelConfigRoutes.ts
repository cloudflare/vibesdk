/**
 * Routes for managing user model configurations
 */

import { ModelConfigController } from '../controllers/modelConfig/controller';
import { Hono } from 'hono';
import { AppEnv } from '../../types/appenv';
import { adaptController } from '../honoAdapter';
import { AuthConfig, setAuthLevel } from '../../middleware/auth/routeAuth';

/**
 * Setup model configuration routes
 * All routes are protected and require authentication
 */
export function setupModelConfigRoutes(app: Hono<AppEnv>): void {
    // Create a sub-router for model config routes
    const modelConfigRouter = new Hono<AppEnv>();

    // Model Configuration Routes
    modelConfigRouter.get('/', setAuthLevel(AuthConfig.authenticated), adaptController(ModelConfigController, ModelConfigController.getModelConfigs));
    modelConfigRouter.get('/defaults', setAuthLevel(AuthConfig.authenticated), adaptController(ModelConfigController, ModelConfigController.getDefaults));
    modelConfigRouter.get('/byok-providers', setAuthLevel(AuthConfig.authenticated), adaptController(ModelConfigController, ModelConfigController.getByokProviders));
    modelConfigRouter.get('/:agentAction', setAuthLevel(AuthConfig.authenticated), adaptController(ModelConfigController, ModelConfigController.getModelConfig));
    modelConfigRouter.put('/:agentAction', setAuthLevel(AuthConfig.authenticated), adaptController(ModelConfigController, ModelConfigController.updateModelConfig));
    modelConfigRouter.delete('/:agentAction', setAuthLevel(AuthConfig.authenticated), adaptController(ModelConfigController, ModelConfigController.deleteModelConfig));
    modelConfigRouter.post('/test', setAuthLevel(AuthConfig.authenticated), adaptController(ModelConfigController, ModelConfigController.testModelConfig));
    modelConfigRouter.post('/reset-all', setAuthLevel(AuthConfig.authenticated), adaptController(ModelConfigController, ModelConfigController.resetAllConfigs));

    // Mount the router under /api/model-configs
    app.route('/api/model-configs', modelConfigRouter);
}