/**
 * Ticket Controller
 *
 * Creates one-time-use tickets for WebSocket authentication.
 * Tickets are stored in the appropriate DO and consumed on connection.
 */

import { BaseController } from '../baseController';
import { RouteContext } from '../../types/route-context';
import { createLogger } from '../../../logger';
import { checkAppOwnership } from '../../../middleware/auth/routeAuth';
import { generateTicketToken, getResourceStub } from '../../../middleware/auth/ticketAuth';
import type { TicketResourceType } from '../../../middleware/auth/routeAuth';
import type { PendingWsTicket, AuthUser } from '../../../types/auth-types';

const TICKET_TTL_MS = 15_000;

interface CreateTicketRequest {
	resourceType: TicketResourceType;
	resourceId?: string;
}

// ============================================================================
// Helpers
// ============================================================================

async function verifyOwnership(
	user: AuthUser,
	resourceType: TicketResourceType,
	resourceId: string,
	env: Env
): Promise<boolean> {
	switch (resourceType) {
		case 'agent':
			return checkAppOwnership(user, { agentId: resourceId }, env);
		case 'vault':
			return resourceId === user.id;
	}
}

function resolveResourceId(
	body: CreateTicketRequest,
	userId: string
): { resourceId: string } | { error: string } {
	if (body.resourceType === 'vault') {
		return { resourceId: userId };
	}
	if (!body.resourceId) {
		return { error: 'resourceId is required for agent tickets' };
	}
	return { resourceId: body.resourceId };
}

// ============================================================================
// Controller
// ============================================================================

export class TicketController extends BaseController {
	static readonly logger = createLogger('TicketController');

	/**
	 * Create a WebSocket ticket
	 * POST /api/ws-ticket
	 */
	static async createTicket(
		request: Request,
		env: Env,
		_ctx: ExecutionContext,
		context: RouteContext
	): Promise<Response> {
		const user = context.user;
		if (!user) {
			return this.createErrorResponse('Authentication required', 401);
		}

		// Parse and validate request
		let body: CreateTicketRequest;
		try {
			body = await request.json() as CreateTicketRequest;
		} catch {
			return this.createErrorResponse('Invalid JSON body', 400);
		}

		if (!body.resourceType || !['agent', 'vault'].includes(body.resourceType)) {
			return this.createErrorResponse('Invalid resourceType', 400);
		}

		// Resolve resource ID
		const resolved = resolveResourceId(body, user.id);
		if ('error' in resolved) {
			return this.createErrorResponse(resolved.error, 400);
		}
		const { resourceId } = resolved;

		// Verify ownership
		if (!await verifyOwnership(user, body.resourceType, resourceId, env)) {
			this.logger.warn('Ticket creation denied', { userId: user.id, resourceType: body.resourceType, resourceId });
			return this.createErrorResponse('Access denied', 403);
		}

		// Create and store ticket
		const now = Date.now();
		const ticket: PendingWsTicket = {
			token: generateTicketToken(body.resourceType, resourceId),
			user,
			sessionId: context.sessionId ?? `ticket:${body.resourceType}:${resourceId}`,
			createdAt: now,
			expiresAt: now + TICKET_TTL_MS,
		};

		try {
			const stub = await getResourceStub(env, body.resourceType, resourceId);
			await stub.storeWsTicket(ticket);

			this.logger.info('Ticket created', { resourceType: body.resourceType, resourceId, userId: user.id });

			return this.createSuccessResponse({
				ticket: ticket.token,
				expiresIn: Math.floor(TICKET_TTL_MS / 1000),
				expiresAt: new Date(ticket.expiresAt).toISOString(),
			});
		} catch (error) {
			this.logger.error('Failed to create ticket', { resourceType: body.resourceType, resourceId, error });
			return this.createErrorResponse('Failed to create ticket', 500);
		}
	}
}
