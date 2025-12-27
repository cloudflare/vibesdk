/**
 * WebSocket Ticket Manager
 */

import { PendingWsTicket, TicketConsumptionResult } from '../types/auth-types';

/**
 * Manages in-memory storage of WebSocket tickets.
 */
export class WsTicketManager {
	private tickets = new Map<string, PendingWsTicket>();

	/**
	 * Store a ticket for later consumption
	 */
	store(ticket: PendingWsTicket): void {
		this.tickets.set(ticket.token, ticket);

		// Schedule auto-cleanup after expiry
		const ttl = ticket.expiresAt - Date.now();
		if (ttl > 0) {
			setTimeout(() => {
				this.tickets.delete(ticket.token);
			}, ttl + 1000); // +1s buffer
		}
	}

	/**
	 * Consume a ticket (one-time use)
	 * Returns user session if valid, null otherwise
	 */
	consume(token: string): TicketConsumptionResult | null {
		const ticket = this.tickets.get(token);

		if (!ticket) {
			return null;
		}

		// Delete immediately (one-time use)
		this.tickets.delete(token);

		// Check expiry
		if (Date.now() > ticket.expiresAt) {
			return null;
		}

		return {
			user: ticket.user,
			sessionId: ticket.sessionId,
		};
	}

	/**
	 * Check if a ticket exists (without consuming it)
	 */
	has(token: string): boolean {
		return this.tickets.has(token);
	}

	/**
	 * Get the number of pending tickets
	 */
	get size(): number {
		return this.tickets.size;
	}
}
