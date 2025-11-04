/**
 * User Secrets Routes
 * API routes for the new Durable Object-backed user secrets management
 */

import { UserSecretsController } from '../controllers/user-secrets/controller';
import { Hono } from 'hono';
import { AppEnv } from '../../types/appenv';
import { adaptController } from '../honoAdapter';
import { AuthConfig, setAuthLevel } from '../../middleware/auth/routeAuth';

/**
 * Setup user-secrets routes (new DO-backed system)
 */
export function setupUserSecretsRoutes(app: Hono<AppEnv>): void {
    // Create a sub-router for user-secrets routes
    const userSecretsRouter = new Hono<AppEnv>();
    
    // List all secrets metadata
    userSecretsRouter.get(
        '/',
        setAuthLevel(AuthConfig.authenticated),
        adaptController(UserSecretsController, UserSecretsController.listSecrets)
    );
    
    // Store a new secret
    userSecretsRouter.post(
        '/',
        setAuthLevel(AuthConfig.authenticated),
        adaptController(UserSecretsController, UserSecretsController.storeSecret)
    );
    
    // Get decrypted secret value
    userSecretsRouter.get(
        '/:secretId/value',
        setAuthLevel(AuthConfig.authenticated),
        adaptController(UserSecretsController, UserSecretsController.getSecretValue)
    );
    
    // Update secret
    userSecretsRouter.patch(
        '/:secretId',
        setAuthLevel(AuthConfig.authenticated),
        adaptController(UserSecretsController, UserSecretsController.updateSecret)
    );
    
    // Delete secret
    userSecretsRouter.delete(
        '/:secretId',
        setAuthLevel(AuthConfig.authenticated),
        adaptController(UserSecretsController, UserSecretsController.deleteSecret)
    );
    
    // Mount the router under /api/user-secrets
    app.route('/api/user-secrets', userSecretsRouter);
}
