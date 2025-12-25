/**
 * Vault Routes - API routes for user secrets vault
 */

import { UserSecretsController } from '../controllers/user-secrets/controller';
import { Hono } from 'hono';
import { AppEnv } from '../../types/appenv';
import { adaptController } from '../honoAdapter';
import { AuthConfig, setAuthLevel } from '../../middleware/auth/routeAuth';

export function setupUserSecretsRoutes(app: Hono<AppEnv>): void {
	// Vault lifecycle routes
	const vaultRouter = new Hono<AppEnv>();

	// WebSocket connection to vault DO - must be before other routes
	// Supports ticket-based auth (SDK) or JWT-based auth (browser)
	vaultRouter.get(
		'/ws',
		setAuthLevel(AuthConfig.authenticated, {
			ticketAuth: { resourceType: 'vault' }
		}),
		adaptController(UserSecretsController, UserSecretsController.handleWebSocketConnection)
	);

	vaultRouter.get(
		'/status',
		setAuthLevel(AuthConfig.authenticated),
		adaptController(UserSecretsController, UserSecretsController.getVaultStatus)
	);

	vaultRouter.get(
		'/config',
		setAuthLevel(AuthConfig.authenticated),
		adaptController(UserSecretsController, UserSecretsController.getVaultConfig)
	);

	vaultRouter.post(
		'/setup',
		setAuthLevel(AuthConfig.authenticated),
		adaptController(UserSecretsController, UserSecretsController.setupVault)
	);

	vaultRouter.post(
		'/reset',
		setAuthLevel(AuthConfig.authenticated),
		adaptController(UserSecretsController, UserSecretsController.resetVault)
	);

	app.route('/api/vault', vaultRouter);
}
