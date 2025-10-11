/**
 * Secrets Routes
 * API routes for user secrets management
 */

import { SecretsController } from '../controllers/secrets/controller';
import { Hono } from 'hono';
import { AppEnv } from '../../types/appenv';
import { adaptController } from '../honoAdapter';
import { AuthConfig, setAuthLevel } from '../../middleware/auth/routeAuth';

/**
 * Setup secrets-related routes
 */
export function setupSecretsRoutes(app: Hono<AppEnv>): void {
    // Create a sub-router for secrets routes
    const secretsRouter = new Hono<AppEnv>();
    
    // Secrets management routes
    secretsRouter.get('/', setAuthLevel(AuthConfig.authenticated), adaptController(SecretsController, SecretsController.getAllSecrets));

    // DISABLED: BYOK Disabled for security reasons
    // secretsRouter.post('/', setAuthLevel(AuthConfig.authenticated), adaptController(SecretsController, SecretsController.storeSecret));
    secretsRouter.post('/', setAuthLevel(AuthConfig.authenticated), (c) => {
        return c.json({ message: 'BYOK is not supported for now' });
    });
    // secretsRouter.patch('/:secretId/toggle', setAuthLevel(AuthConfig.authenticated), adaptController(SecretsController, SecretsController.toggleSecret));
    // secretsRouter.delete('/:secretId', setAuthLevel(AuthConfig.authenticated), adaptController(SecretsController, SecretsController.deleteSecret));
    
    // Templates route
    secretsRouter.get('/templates', setAuthLevel(AuthConfig.authenticated), adaptController(SecretsController, SecretsController.getTemplates));
    
    // Mount the router under /api/secrets
    app.route('/api/secrets', secretsRouter);
}