import { TypedEmitter } from './emitter';
import { normalizeRetryConfig, computeBackoffMs, type NormalizedRetryConfig } from './retry';
import type {
	AgentConnection,
	AgentConnectionOptions,
	AgentEventMap,
	AgentWsClientMessage,
	AgentWsServerMessage,
	WebSocketLike,
} from './types';

function toWsCloseEvent(ev: CloseEvent | { code?: number; reason?: string }): { code: number; reason: string } {
	return {
		code: typeof (ev as CloseEvent).code === 'number' ? (ev as CloseEvent).code : 1000,
		reason: typeof (ev as CloseEvent).reason === 'string' ? (ev as CloseEvent).reason : '',
	};
}

const WS_RETRY_DEFAULTS: NormalizedRetryConfig = {
	enabled: true,
	initialDelayMs: 1_000,
	maxDelayMs: 30_000,
	maxRetries: Infinity,
};

export function createAgentConnection(url: string, options: AgentConnectionOptions = {}): AgentConnection {
	const emitter = new TypedEmitter<AgentEventMap>();

	const retryCfg = normalizeRetryConfig(options.retry, WS_RETRY_DEFAULTS);

	const headers: Record<string, string> = { ...(options.headers ?? {}) };
	if (options.origin) headers.Origin = options.origin;

	let ws: WebSocketLike | null = null;
	let isOpen = false;
	let closedByUser = false;
	let reconnectAttempts = 0;
	let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

	const pendingSends: string[] = [];
	const maxPendingSends = 1_000;

	function clearReconnectTimer(): void {
		if (!reconnectTimer) return;
		clearTimeout(reconnectTimer);
		reconnectTimer = null;
	}

	function makeWebSocket(): WebSocketLike {
		if (options.webSocketFactory) return options.webSocketFactory(url, undefined, headers);
		return new WebSocket(url) as unknown as WebSocketLike;
	}

	function flushPendingSends(): void {
		if (!ws || !isOpen) return;
		for (const data of pendingSends) ws.send(data);
		pendingSends.length = 0;
	}

	function scheduleReconnect(reason: 'close' | 'error'): void {
		if (closedByUser) return;
		if (!retryCfg.enabled) return;
		if (reconnectAttempts >= retryCfg.maxRetries) return;
		if (reconnectTimer) return;

		const delayMs = computeBackoffMs(reconnectAttempts, retryCfg);
		emitter.emit('ws:reconnecting', {
			attempt: reconnectAttempts + 1,
			delayMs,
			reason,
		});
		reconnectAttempts += 1;

		reconnectTimer = setTimeout(() => {
			reconnectTimer = null;
			connectNow();
		}, delayMs);
	}

	function onOpen() {
		isOpen = true;
		reconnectAttempts = 0;
		emitter.emit('ws:open', undefined);
		// Flush after emitting open so user `ws:open` listeners can send auth/session_init first.
		flushPendingSends();
	}

	function onClose(ev: CloseEvent | { code?: number; reason?: string }) {
		isOpen = false;
		emitter.emit('ws:close', toWsCloseEvent(ev));
		scheduleReconnect('close');
	}

	function onError(error: unknown) {
		// Many runtimes emit 'error' before 'close'. We attempt reconnect on either.
		emitter.emit('ws:error', { error });
		scheduleReconnect('error');
	}

	function looksLikeAgentState(obj: unknown): obj is Record<string, unknown> {
		if (!obj || typeof obj !== 'object') return false;
		const behaviorType = (obj as { behaviorType?: unknown }).behaviorType;
		const projectType = (obj as { projectType?: unknown }).projectType;
		return typeof behaviorType === 'string' && typeof projectType === 'string';
	}

	function normalizeServerPayload(raw: unknown): AgentWsServerMessage | null {
		if (!raw || typeof raw !== 'object') return null;
		const t = (raw as { type?: unknown }).type;
		if (typeof t === 'string') {
			// Defensive: some buggy servers encode a full JSON payload into `type`.
			// If it looks like JSON, attempt to parse and normalize it.
			const trimmed = t.trim();
			if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
				try {
					const inner = JSON.parse(trimmed) as unknown;
					const normalizedInner = normalizeServerPayload(inner);
					if (normalizedInner) return normalizedInner;
					emitter.emit('ws:raw', { raw: inner });
					return null;
				} catch {
					// fall through
				}
			}
			return raw as AgentWsServerMessage;
		}

		// Some servers/runtimes may send AgentState-ish objects without the `{ type }` envelope.
		const state = (raw as { state?: unknown }).state;
		if (looksLikeAgentState(state)) {
			return { type: 'cf_agent_state', state } as unknown as AgentWsServerMessage;
		}
		if (looksLikeAgentState(raw)) {
			return { type: 'cf_agent_state', state: raw } as unknown as AgentWsServerMessage;
		}
		return null;
	}

	function onMessage(data: unknown) {
		try {
			const raw = JSON.parse(String(data)) as unknown;
			const parsed = normalizeServerPayload(raw);
			if (!parsed) {
				emitter.emit('ws:raw', { raw });
				return;
			}

			emitter.emit('ws:message', parsed);

			// Best-effort sugar routing
			switch (parsed.type) {
				case 'agent_connected':
					emitter.emit('connected', parsed);
					break;
				case 'conversation_response':
				case 'conversation_state':
					emitter.emit('conversation', parsed);
					break;
				case 'phase_generating':
				case 'phase_generated':
				case 'phase_implementing':
				case 'phase_implemented':
				case 'phase_validating':
				case 'phase_validated':
					emitter.emit('phase', parsed);
					break;
				case 'file_chunk_generated':
				case 'file_generated':
				case 'file_generating':
				case 'file_regenerating':
				case 'file_regenerated':
					emitter.emit('file', parsed);
					break;
				case 'generation_started':
				case 'generation_complete':
				case 'generation_stopped':
				case 'generation_resumed':
					emitter.emit('generation', parsed);
					break;
				case 'deployment_completed':
				case 'deployment_started':
				case 'deployment_failed':
					emitter.emit('preview', parsed);
					break;
				case 'cloudflare_deployment_started':
				case 'cloudflare_deployment_completed':
				case 'cloudflare_deployment_error':
					emitter.emit('cloudflare', parsed);
					break;
				case 'error':
					emitter.emit('error', { error: String(parsed.error ?? 'Unknown error') });
					break;
				default:
					break;
			}
		} catch (error) {
			onError(error);
		}
	}

	function connectNow(): void {
		if (closedByUser) return;
		clearReconnectTimer();

		try {
			ws = makeWebSocket();
		} catch (error) {
			onError(error);
			scheduleReconnect('error');
			return;
		}

		if (ws.addEventListener) {
			ws.addEventListener('open', () => onOpen());
			ws.addEventListener('close', (ev) => onClose(ev as CloseEvent));
			ws.addEventListener('error', (ev) => onError(ev));
			ws.addEventListener('message', (ev) => onMessage((ev as MessageEvent).data));
			return;
		}

		if (ws.on) {
			ws.on('open', () => onOpen());
			ws.on('close', (code: unknown, reason: unknown) => onClose({ code: typeof code === 'number' ? code : undefined, reason: typeof reason === 'string' ? reason : undefined }));
			ws.on('error', (error: unknown) => onError(error));
			ws.on('message', (data: unknown) => onMessage(data));
		}
	}

	connectNow();

	function send(msg: AgentWsClientMessage): void {
		const data = JSON.stringify(msg);
		if (isOpen && ws) {
			ws.send(data);
			return;
		}

		pendingSends.push(data);
		if (pendingSends.length > maxPendingSends) {
			pendingSends.shift();
			emitter.emit('ws:error', {
				error: new Error(`Message queue overflow: dropped oldest message (queue size: ${maxPendingSends})`),
			});
		}
	}

	function close(): void {
		closedByUser = true;
		isOpen = false;
		pendingSends.length = 0;
		clearReconnectTimer();
		ws?.close();
		ws = null;
	}

	async function waitFor<K extends keyof AgentEventMap>(
		event: K,
		predicate?: (payload: AgentEventMap[K]) => boolean,
		timeoutMs: number = 60_000,
	): Promise<AgentEventMap[K]> {
		return new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				unsub();
				reject(new Error(`Timeout waiting for event: ${String(event)}`));
			}, timeoutMs);

			const unsub = emitter.on(event, (payload) => {
				if (predicate && !predicate(payload)) return;
				clearTimeout(timeout);
				unsub();
				resolve(payload);
			});
		});
	}

	return {
		send,
		close,
		on: (event, cb) => emitter.on(event, cb),
		onAny: (cb) => emitter.onAny(cb),
		waitFor,
	};
}
