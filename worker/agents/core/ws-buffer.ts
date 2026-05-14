/**
 * WebSocket broadcast buffer — server-turn persistence.
 *
 * When all client connections drop during an active inference (network blip,
 * browser refresh), broadcast messages are queued here and flushed on the
 * next reconnect. The buffer is ephemeral: it survives in the Durable Object's
 * in-memory instance but is discarded if the DO hibernates/restarts.
 *
 * On full DO restart, `onConnect` sends a STATE_SNAPSHOT that is sufficient
 * to restore client UI state — the buffer only matters for messages emitted
 * *between* a disconnect and the next reconnect within the same DO lifetime.
 *
 * Pattern mirrors CF Agents SDK v0.12.4 "server turn persistence"
 * (`cancelOnClientAbort: false`): keep server execution running, deliver
 * buffered output on reconnect.
 *
 * ADR-008 S14 — DEC-043-D.
 */

import type { WebSocketMessageType, WebSocketMessageData } from '../../api/websocketTypes';

// ── Constants ─────────────────────────────────────────────────────────────────

/** Maximum number of broadcast messages held per DO instance (FIFO eviction). */
export const MAX_BROADCAST_BUFFER_SIZE = 100;

/** Entries older than this are discarded on flush (5 minutes). */
export const BROADCAST_BUFFER_TTL_MS = 5 * 60_000;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PendingBroadcast {
    type: WebSocketMessageType;
    data: WebSocketMessageData<WebSocketMessageType>;
    /** Unix timestamp (ms) when the message was enqueued. */
    enqueuedAt: number;
}

// ── Pure helpers (fully testable without CF bindings) ────────────────────────

/**
 * Append a message to the buffer, evicting the oldest entry when the buffer
 * exceeds `MAX_BROADCAST_BUFFER_SIZE`.
 */
export function enqueueBroadcast(
    buffer: PendingBroadcast[],
    type: WebSocketMessageType,
    data: WebSocketMessageData<WebSocketMessageType>,
    now: number = Date.now(),
): PendingBroadcast[] {
    const entry: PendingBroadcast = { type, data, enqueuedAt: now };
    const next = [...buffer, entry];
    // FIFO eviction: keep the most recent MAX_BROADCAST_BUFFER_SIZE entries
    return next.length > MAX_BROADCAST_BUFFER_SIZE
        ? next.slice(next.length - MAX_BROADCAST_BUFFER_SIZE)
        : next;
}

/**
 * Return entries from `buffer` that are still within the TTL window.
 * Entries older than `BROADCAST_BUFFER_TTL_MS` relative to `now` are dropped.
 */
export function filterFreshBroadcasts(
    buffer: PendingBroadcast[],
    now: number = Date.now(),
): PendingBroadcast[] {
    const cutoff = now - BROADCAST_BUFFER_TTL_MS;
    return buffer.filter((entry) => entry.enqueuedAt >= cutoff);
}

/**
 * Returns true when the buffer holds at least one fresh entry.
 */
export function hasFreshBroadcasts(
    buffer: PendingBroadcast[],
    now: number = Date.now(),
): boolean {
    return filterFreshBroadcasts(buffer, now).length > 0;
}
