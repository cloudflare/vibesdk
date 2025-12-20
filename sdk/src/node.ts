import WebSocket from 'ws';
import type { AgentConnectionOptions } from './types';

export function createNodeWebSocketFactory(): NonNullable<AgentConnectionOptions['webSocketFactory']> {
	return (url, protocols, headers) => {
		const ws = headers ? new WebSocket(url, protocols, { headers }) : new WebSocket(url, protocols);
		return ws as unknown as {
			send: (data: string) => void;
			close: () => void;
			on: (type: string, listener: (...args: unknown[]) => void) => void;
		};
	};
}
