import { TypedEmitter } from './emitter';
import { normalizeRetryConfig, computeBackoffMs, type NormalizedRetryConfig } from './retry';
import { isRecord } from './utils';
import type {
	AgentConnection,
	AgentConnectionOptions,
	AgentEventMap,
	AgentWsClientMessage,
	AgentWsServerMessage,
	AgentState,
	UrlProvider,
} from './types';

const WS_RETRY_DEFAULTS: NormalizedRetryConfig = {
	enabled: true,
	initialDelayMs: 1_000,
	maxDelayMs: 30_000,
	maxRetries: Infinity,
};

/**
 * Create a WebSocket connection to an agent.
 *
 * @param getUrl - Async function that returns WebSocket URL with fresh ticket.
 *                 Called on initial connect and on each reconnect attempt.
 * @param options - Connection options (retry config, credentials).
 */
export function createAgentConnection(
	getUrl: UrlProvider,
	options: AgentConnectionOptions = {}
): AgentConnection {
	const emitter = new TypedEmitter<AgentEventMap>();
	const retryCfg = normalizeRetryConfig(options.retry, WS_RETRY_DEFAULTS);

	let ws: WebSocket | null = null;
	let isOpen = false;
	let closedByUser = false;
	let reconnectAttempts = 0;
	let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

	const pendingSends: string[] = [];
	const maxPendingSends = 1_000;

	function clearReconnectTimer(): void {
		if (reconnectTimer) {
			clearTimeout(reconnectTimer);
			reconnectTimer = null;
		}
	}

	function flushPendingSends(): void {
		if (!ws || !isOpen) return;
		for (const data of pendingSends) {
			ws.send(data);
		}
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
			void connectNow();
		}, delayMs);
	}

	function onOpen(): void {
		isOpen = true;
		reconnectAttempts = 0;
		emitter.emit('ws:open', undefined);
		flushPendingSends();
	}

	function onClose(e: CloseEvent): void {
		isOpen = false;
		emitter.emit('ws:close', { code: e.code, reason: e.reason });
		scheduleReconnect('close');
	}

	function onError(): void {
		emitter.emit('ws:error', { error: new Error('WebSocket error') });
		scheduleReconnect('error');
	}

	function isAgentState(obj: unknown): obj is AgentState {
		if (!isRecord(obj)) return false;
		return typeof obj.behaviorType === 'string' && typeof obj.projectType === 'string';
	}

	function normalizeServerPayload(raw: unknown): AgentWsServerMessage | null {
		if (!isRecord(raw)) return null;

		const t = raw.type;
		if (typeof t === 'string') {
			const trimmed = t.trim();
			if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
				try {
					const inner = JSON.parse(trimmed) as unknown;
					const normalizedInner = normalizeServerPayload(inner);
					if (normalizedInner) return normalizedInner;
					if (isRecord(inner)) {
						emitter.emit('ws:raw', { raw: inner });
					}
					return null;
				} catch {
					// Invalid JSON in type field, treat as regular message
				}
			}
			return raw as AgentWsServerMessage;
		}

		const state = raw.state;
		if (isAgentState(state)) {
			return { type: 'cf_agent_state', state };
		}
		if (isAgentState(raw)) {
			return { type: 'cf_agent_state', state: raw };
		}
		return null;
	}

	function onMessage(e: MessageEvent): void {
		try {
			const data = typeof e.data === 'string' ? e.data : String(e.data);
			const raw = JSON.parse(data) as unknown;
			const parsed = normalizeServerPayload(raw);

			if (!parsed) {
				if (isRecord(raw)) {
					emitter.emit('ws:raw', { raw });
				}
				return;
			}

			emitter.emit('ws:message', parsed);

			// Route to typed event channels
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
			}
		} catch (error) {
			emitter.emit('ws:error', {
				error: error instanceof Error ? error : new Error(String(error)),
			});
		}
	}

	async function connectNow(): Promise<void> {
		if (closedByUser) return;
		clearReconnectTimer();

		if (typeof WebSocket === 'undefined') {
			emitter.emit('ws:error', {
				error: new Error(
					'WebSocket is not available. This SDK requires a runtime with native WebSocket support (Cloudflare Workers, browsers, Bun, or Node.js 22+).'
				),
			});
			return;
		}

		try {
			const url = await getUrl();
			ws = new WebSocket(url);

			ws.addEventListener('open', onOpen);
			ws.addEventListener('close', onClose);
			ws.addEventListener('error', onError);
			ws.addEventListener('message', onMessage);
		} catch (error) {
			emitter.emit('ws:error', {
				error: error instanceof Error ? error : new Error(String(error)),
			});
			scheduleReconnect('error');
		}
	}

	// Start initial connection
	void connectNow();

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
				error: new Error(`Message queue overflow: dropped oldest message (max: ${maxPendingSends})`),
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
		timeoutMs = 60_000
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
