/**
 * WebSocket Ticket Authentication
 *
 * Provides ticket-based authentication for WebSocket connections.
 * Tickets are opaque, one-time-use tokens stored in DO memory.
 *
 * Token formats:
 * - Agent: tk_{random} (resource ID from URL param)
 * - Vault: tkv_{userId}_{random} (resource ID encoded in token)
 */

import { getAgentStub } from '../../agents';
import type { AuthUserSession, PendingWsTicket, TicketConsumptionResult } from '../../types/auth-types';
import { createLogger } from '../../logger';
import type { TicketAuthConfig, TicketResourceType } from './routeAuth';

const logger = createLogger('TicketAuth');

// ============================================================================
// Constants
// ============================================================================

const MIN_TICKET_LENGTH = 35;
const AGENT_TICKET_PREFIX = 'tk_';
const VAULT_TICKET_PREFIX = 'tkv_';
const AGENT_TICKET_PATTERN = /^tk_[a-f0-9]+$/;

// ============================================================================
// Interfaces
// ============================================================================

/**
 * Interface for DOs that support WebSocket ticket authentication
 */
export interface TicketAuthenticatable {
	storeWsTicket(ticket: PendingWsTicket): Promise<void> | void;
	consumeWsTicket(token: string): Promise<TicketConsumptionResult | null> | TicketConsumptionResult | null;
}

// ============================================================================
// Resource Stub Resolution
// ============================================================================

/**
 * Get a resource stub that supports ticket authentication
 */
export async function getResourceStub(
	env: Env,
	resourceType: TicketResourceType,
	resourceId: string
): Promise<TicketAuthenticatable> {
	switch (resourceType) {
		case 'agent':
			return getAgentStub(env, resourceId);
		case 'vault': {
			const id = env.UserSecretsStore.idFromName(resourceId);
			return env.UserSecretsStore.get(id);
		}
	}
}

// ============================================================================
// Ticket Extraction & Validation
// ============================================================================

/**
 * Check if request has a ticket parameter
 */
export function hasTicketParam(request: Request): boolean {
	return new URL(request.url).searchParams.has('ticket');
}

/**
 * Extract ticket from request, returning null if not present or invalid format
 */
function extractAndValidateTicket(
	request: Request,
	resourceType: TicketResourceType
): string | null {
	const ticket = new URL(request.url).searchParams.get('ticket');
	if (!ticket || ticket.length < MIN_TICKET_LENGTH) {
		return null;
	}

	if (resourceType === 'vault') {
		return ticket.startsWith(VAULT_TICKET_PREFIX) && parseVaultTicket(ticket) ? ticket : null;
	}

	return ticket.startsWith(AGENT_TICKET_PREFIX) && AGENT_TICKET_PATTERN.test(ticket) ? ticket : null;
}

/**
 * Parse a vault ticket to extract the user ID
 * Format: tkv_{userId}_{random}
 */
function parseVaultTicket(ticket: string): string | null {
	const withoutPrefix = ticket.slice(VAULT_TICKET_PREFIX.length);
	const separatorIndex = withoutPrefix.indexOf('_');
	if (separatorIndex <= 0) {
		return null;
	}
	return withoutPrefix.slice(0, separatorIndex);
}

/**
 * Resolve the resource ID from ticket and route params
 */
function resolveResourceId(
	ticket: string,
	config: TicketAuthConfig,
	params: Record<string, string>
): string | null {
	if (config.resourceType === 'vault') {
		return parseVaultTicket(ticket);
	}

	if (!config.paramName) {
		logger.error('paramName required for agent ticket auth');
		return null;
	}

	return params[config.paramName] || null;
}

// ============================================================================
// Authentication
// ============================================================================

/**
 * Authenticate a request via WebSocket ticket
 */
export async function authenticateViaTicket(
	request: Request,
	env: Env,
	config: TicketAuthConfig,
	params: Record<string, string>
): Promise<AuthUserSession | null> {
	const ticket = extractAndValidateTicket(request, config.resourceType);
	if (!ticket) {
		logger.warn('Invalid or missing ticket', { resourceType: config.resourceType });
		return null;
	}

	const resourceId = resolveResourceId(ticket, config, params);
	if (!resourceId) {
		logger.warn('Could not resolve resource ID', { resourceType: config.resourceType });
		return null;
	}

	try {
		const stub = await getResourceStub(env, config.resourceType, resourceId);
		const result = await stub.consumeWsTicket(ticket);

		if (!result) {
			logger.warn('Ticket consumption failed', { resourceType: config.resourceType, resourceId });
			return null;
		}

		logger.info('Ticket authenticated', {
			resourceType: config.resourceType,
			resourceId,
			userId: result.user.id,
		});

		return { user: result.user, sessionId: result.sessionId };
	} catch (error) {
		logger.error('Ticket authentication error', { resourceType: config.resourceType, resourceId, error });
		return null;
	}
}

// ============================================================================
// Token Generation
// ============================================================================

/**
 * Generate a ticket token for the specified resource
 */
export function generateTicketToken(resourceType: TicketResourceType, resourceId: string): string {
	const random = crypto.randomUUID().replace(/-/g, '');

	switch (resourceType) {
		case 'vault':
			return `${VAULT_TICKET_PREFIX}${resourceId}_${random}`;
		case 'agent':
			return `${AGENT_TICKET_PREFIX}${random}`;
	}
}
