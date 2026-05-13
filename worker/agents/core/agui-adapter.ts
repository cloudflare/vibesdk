/**
 * agui-adapter — translate vibesdk WebSocket messages to AG-UI event format.
 *
 * AG-UI (https://docs.ag-ui.com) is the CopilotKit-backed standard for
 * agent↔frontend communication.  vibesdk emits both native events AND AG-UI
 * companion events (run_started, run_finished, state_snapshot, state_delta).
 * This adapter lets callers convert ANY vibesdk message to AG-UI format for
 * third-party integrations that don't speak the native protocol.
 *
 * Usage:
 *   import { toAgUiEvent } from './agui-adapter';
 *   const agUiEvent = toAgUiEvent(vibesdkMessage);
 *   if (agUiEvent) sseStream.write(`data: ${JSON.stringify(agUiEvent)}\n\n`);
 */

import type { WebSocketMessage } from '../../api/websocketTypes';

// ── AG-UI canonical event types ────────────────────────────────────────────

export type AgUiEventType =
    | 'RUN_STARTED'
    | 'RUN_FINISHED'
    | 'RUN_ERROR'
    | 'TEXT_MESSAGE_START'
    | 'TEXT_MESSAGE_CONTENT'
    | 'TEXT_MESSAGE_END'
    | 'TOOL_CALL_START'
    | 'TOOL_CALL_ARGS'
    | 'TOOL_CALL_END'
    | 'TOOL_CALL_RESULT'
    | 'STATE_SNAPSHOT'
    | 'STATE_DELTA'
    | 'MESSAGES_SNAPSHOT'
    | 'CUSTOM';

export interface AgUiBaseEvent {
    readonly type: AgUiEventType;
    readonly timestamp: number;
}

export interface AgUiRunStartedEvent extends AgUiBaseEvent {
    readonly type: 'RUN_STARTED';
    readonly threadId: string;
    readonly runId: string;
}

export interface AgUiRunFinishedEvent extends AgUiBaseEvent {
    readonly type: 'RUN_FINISHED';
    readonly threadId: string;
    readonly runId: string;
}

export interface AgUiRunErrorEvent extends AgUiBaseEvent {
    readonly type: 'RUN_ERROR';
    readonly message: string;
    readonly code?: string;
}

export interface AgUiTextMessageStartEvent extends AgUiBaseEvent {
    readonly type: 'TEXT_MESSAGE_START';
    readonly messageId: string;
    readonly role: 'assistant' | 'user';
}

export interface AgUiTextMessageContentEvent extends AgUiBaseEvent {
    readonly type: 'TEXT_MESSAGE_CONTENT';
    readonly messageId: string;
    readonly delta: string;
}

export interface AgUiTextMessageEndEvent extends AgUiBaseEvent {
    readonly type: 'TEXT_MESSAGE_END';
    readonly messageId: string;
}

export interface AgUiToolCallStartEvent extends AgUiBaseEvent {
    readonly type: 'TOOL_CALL_START';
    readonly toolCallId: string;
    readonly toolCallName: string;
    readonly parentMessageId?: string;
}

export interface AgUiToolCallArgsEvent extends AgUiBaseEvent {
    readonly type: 'TOOL_CALL_ARGS';
    readonly toolCallId: string;
    readonly delta: string;
}

export interface AgUiToolCallEndEvent extends AgUiBaseEvent {
    readonly type: 'TOOL_CALL_END';
    readonly toolCallId: string;
}

export interface AgUiToolCallResultEvent extends AgUiBaseEvent {
    readonly type: 'TOOL_CALL_RESULT';
    readonly messageId: string;
    readonly toolCallId: string;
    readonly role: 'tool';
    readonly content: string;
}

export interface AgUiStateSnapshotEvent extends AgUiBaseEvent {
    readonly type: 'STATE_SNAPSHOT';
    readonly snapshot: Record<string, unknown>;
}

export interface AgUiStateDeltaEvent extends AgUiBaseEvent {
    readonly type: 'STATE_DELTA';
    readonly delta: Array<{ op: string; path: string; value?: unknown }>;
}

export interface AgUiCustomEvent extends AgUiBaseEvent {
    readonly type: 'CUSTOM';
    readonly name: string;
    readonly value: unknown;
}

export type AgUiEvent =
    | AgUiRunStartedEvent
    | AgUiRunFinishedEvent
    | AgUiRunErrorEvent
    | AgUiTextMessageStartEvent
    | AgUiTextMessageContentEvent
    | AgUiTextMessageEndEvent
    | AgUiToolCallStartEvent
    | AgUiToolCallArgsEvent
    | AgUiToolCallEndEvent
    | AgUiToolCallResultEvent
    | AgUiStateSnapshotEvent
    | AgUiStateDeltaEvent
    | AgUiCustomEvent;

// ── Translator ──────────────────────────────────────────────────────────────

const now = (): number => Date.now();

/**
 * Translate a vibesdk WebSocket message to an AG-UI event.
 * Returns `null` for messages that have no AG-UI equivalent — callers
 * should forward AG-UI companion events (run_started, state_snapshot, …)
 * directly rather than translating native events.
 */
export function toAgUiEvent(msg: WebSocketMessage): AgUiEvent | null {
    const ts = now();

    switch (msg.type) {
        // AG-UI companion events — pass through with type conversion.
        case 'run_started':
            return {
                type: 'RUN_STARTED',
                threadId: msg.sessionId,
                runId: msg.runId,
                timestamp: ts,
            } satisfies AgUiRunStartedEvent;

        case 'run_finished':
            return {
                type: 'RUN_FINISHED',
                threadId: msg.sessionId,
                runId: msg.runId,
                timestamp: ts,
            } satisfies AgUiRunFinishedEvent;

        case 'run_error':
            return {
                type: 'RUN_ERROR',
                message: msg.message,
                code: msg.code,
                timestamp: ts,
            } satisfies AgUiRunErrorEvent;

        case 'state_snapshot':
            return {
                type: 'STATE_SNAPSHOT',
                snapshot: msg.snapshot,
                timestamp: ts,
            } satisfies AgUiStateSnapshotEvent;

        case 'state_delta':
            return {
                type: 'STATE_DELTA',
                delta: msg.delta,
                timestamp: ts,
            } satisfies AgUiStateDeltaEvent;

        // Native events with AG-UI mappings.
        case 'generation_started':
            // generation_started is already accompanied by run_started; skip to
            // avoid double-emitting — callers should pick the companion event.
            return null;

        case 'generation_complete':
            return null;

        case 'file_chunk_generated': {
            // Map streaming file chunks to TEXT_MESSAGE_CONTENT for AG-UI clients.
            const messageId = `file:${msg.filePath}`;
            return {
                type: 'TEXT_MESSAGE_CONTENT',
                messageId,
                delta: msg.chunk ?? '',
                timestamp: ts,
            } satisfies AgUiTextMessageContentEvent;
        }

        case 'error':
            return {
                type: 'RUN_ERROR',
                message: msg.error,
                timestamp: ts,
            } satisfies AgUiRunErrorEvent;

        default:
            // All other native messages become CUSTOM events.
            return {
                type: 'CUSTOM',
                name: msg.type,
                value: msg,
                timestamp: ts,
            } satisfies AgUiCustomEvent;
    }
}
