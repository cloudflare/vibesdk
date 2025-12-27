/**
 * WebSocket Ticket Routes
 */

import { Hono } from 'hono';
import { AppEnv } from '../../types/appenv';
import { AuthConfig, setAuthLevel } from '../../middleware/auth/routeAuth';
import { adaptController } from '../honoAdapter';
import { TicketController } from '../controllers/ticket/controller';

export function setupTicketRoutes(app: Hono<AppEnv>): void {
	// Create WebSocket ticket - requires authentication
	// Ownership check is done in the controller based on resourceType
	app.post(
		'/api/ws-ticket',
		setAuthLevel(AuthConfig.authenticated),
		adaptController(TicketController, TicketController.createTicket)
	);
}
