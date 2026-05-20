/**
 * WebSocket broadcast buffer — server-turn persistence.
 *
 * Two layers of persistence:
 *
 * Layer 1 (in-memory, ephemeral):
 *   Messages buffered when zero clients are connected. Survives network blips
 *   within the same DO in-memory instance. Discarded on DO hibernation/restart.
 *   Constants: MAX_BROADCAST_BUFFER_SIZE, BROADCAST_BUFFER_TTL_MS.
 *
 * Layer 2 (SQLite, durable):
 *   Messages written to `ws_broadcast_log` in the DO's SQLite storage. Survives
 *   full DO hibernation and restart. Replayed on reconnect before STATE_SNAPSHOT.
 *   Flushed + pruned after each reconnect. Longer TTL (30 min) because DO restart
 *   diagnosis takes longer than a network blip.
 *   Constants: MAX_SQLITE_BROADCAST_BUFFER_SIZE, SQLITE_BROADCAST_TTL_MS.
 *   Functions: initWsBroadcastLog, persistBroadcast, replayPersistedBroadcasts,
 *              pruneExpiredBroadcasts.
 *
 * On `flushPendingBroadcasts`, both layers are merged, deduplicated by
 * `enqueuedAt` timestamp, and delivered in chronological order. SQLite log is
 * pruned after delivery. ADR-011 Option B — ResumableStream pattern adoption.
 *
 * Pattern mirrors CF Agents SDK v0.12.4 "server turn persistence"
 * (`cancelOnClientAbort: false`): keep server execution running, deliver
 * buffered output on reconnect.
 *
 * ADR-008 S14 — DEC-043-D. ADR-011 Option B (SQLite layer).
 */

import type { WebSocketMessageType, WebSocketMessageData } from '../../api/websocketTypes';
import type { SqlExecutor } from '../git/fs-adapter';

// ── In-memory layer constants ─────────────────────────────────────────────────

/** Maximum number of broadcast messages held per DO instance (FIFO eviction). */
export const MAX_BROADCAST_BUFFER_SIZE = 100;

/** Entries older than this are discarded on in-memory flush (5 minutes). */
export const BROADCAST_BUFFER_TTL_MS = 5 * 60_000;

// ── SQLite layer constants ────────────────────────────────────────────────────

/** Maximum rows kept in ws_broadcast_log (oldest pruned on insert). */
export const MAX_SQLITE_BROADCAST_BUFFER_SIZE = 200;

/**
 * SQLite rows older than this are dropped on flush (30 minutes).
 * Longer than in-memory TTL because DO restart diagnosis takes longer.
 */
export const SQLITE_BROADCAST_TTL_MS = 30 * 60_000;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PendingBroadcast {
    type: WebSocketMessageType;
    data: WebSocketMessageData<WebSocketMessageType>;
    /** Unix timestamp (ms) when the message was enqueued. */
    enqueuedAt: number;
}

interface WsBroadcastLogRow {
    id: number;
    msg_type: string;
    msg_data: string;
    enqueued_at: number;
}

// ── Pure helpers — in-memory layer (fully testable without CF bindings) ───────

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

// ── SQLite layer — durable cross-restart persistence ─────────────────────────

/**
 * Ensure the `ws_broadcast_log` table exists in the DO's SQLite storage.
 * Safe to call on every DO start — uses CREATE TABLE IF NOT EXISTS.
 */
export function initWsBroadcastLog(sql: SqlExecutor): void {
    void sql`
        CREATE TABLE IF NOT EXISTS ws_broadcast_log (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            msg_type    TEXT    NOT NULL,
            msg_data    TEXT    NOT NULL,
            enqueued_at INTEGER NOT NULL
        )
    `;
    void sql`
        CREATE INDEX IF NOT EXISTS idx_ws_broadcast_log_enqueued_at
            ON ws_broadcast_log (enqueued_at)
    `;
}

/**
 * Write one broadcast message to the SQLite log.
 *
 * When the row count exceeds MAX_SQLITE_BROADCAST_BUFFER_SIZE, the oldest
 * rows are deleted to cap storage. Uses a FIFO eviction strategy matching
 * the in-memory buffer.
 */
export function persistBroadcast(
    sql: SqlExecutor,
    type: WebSocketMessageType,
    data: WebSocketMessageData<WebSocketMessageType>,
    now: number = Date.now(),
): void {
    const serialised = JSON.stringify(data);
    sql`
        INSERT INTO ws_broadcast_log (msg_type, msg_data, enqueued_at)
        VALUES (${type}, ${serialised}, ${now})
    `;

    // FIFO eviction: keep only the most recent MAX_SQLITE_BROADCAST_BUFFER_SIZE rows
    sql`
        DELETE FROM ws_broadcast_log
        WHERE id NOT IN (
            SELECT id FROM ws_broadcast_log
            ORDER BY enqueued_at DESC
            LIMIT ${MAX_SQLITE_BROADCAST_BUFFER_SIZE}
        )
    `;
}

/**
 * Load all fresh rows from the SQLite log, ordered by enqueue time (oldest first).
 * Rows older than SQLITE_BROADCAST_TTL_MS are excluded.
 * Returns an array of PendingBroadcast in chronological order.
 */
export function replayPersistedBroadcasts(
    sql: SqlExecutor,
    now: number = Date.now(),
): PendingBroadcast[] {
    const cutoff = now - SQLITE_BROADCAST_TTL_MS;
    const rows = sql<WsBroadcastLogRow>`
        SELECT id, msg_type, msg_data, enqueued_at
        FROM ws_broadcast_log
        WHERE enqueued_at >= ${cutoff}
        ORDER BY enqueued_at ASC
    `;

    return rows.map((row) => ({
        type: row.msg_type as WebSocketMessageType,
        data: JSON.parse(row.msg_data) as WebSocketMessageData<WebSocketMessageType>,
        enqueuedAt: row.enqueued_at,
    }));
}

/**
 * Delete all rows from the SQLite log.
 * Called after a successful reconnect flush to prevent duplicate delivery.
 */
export function pruneExpiredBroadcasts(sql: SqlExecutor): void {
    sql`DELETE FROM ws_broadcast_log`;
}

// ── Merge helper — used by flushPendingBroadcasts in codingAgent.ts ──────────

/**
 * Merge in-memory and SQLite-replayed broadcasts into a single chronologically
 * ordered, deduplicated array. Deduplication key is `enqueuedAt` timestamp
 * (sufficient because messages from the same DO instance share a monotonic clock).
 *
 * In-memory entries are typically a subset of SQLite entries within the same
 * DO lifetime. On DO restart, in-memory is empty and SQLite provides replay.
 */
export function mergeBroadcasts(
    inMemory: PendingBroadcast[],
    fromSqlite: PendingBroadcast[],
    now: number = Date.now(),
): PendingBroadcast[] {
    // Combine both sources
    const all = [...fromSqlite, ...inMemory];

    // Deduplicate by enqueuedAt (SQLite and in-memory may overlap within same lifetime)
    const seen = new Set<number>();
    const deduped: PendingBroadcast[] = [];
    for (const entry of all) {
        if (!seen.has(entry.enqueuedAt)) {
            seen.add(entry.enqueuedAt);
            deduped.push(entry);
        }
    }

    // Apply SQLite TTL (longer than in-memory TTL)
    const cutoff = now - SQLITE_BROADCAST_TTL_MS;
    return deduped
        .filter((e) => e.enqueuedAt >= cutoff)
        .sort((a, b) => a.enqueuedAt - b.enqueuedAt);
}
