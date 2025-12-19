declare module 'ws' {
	import type { WebSocketLike } from './types';

	export default class WebSocket implements WebSocketLike {
		constructor(url: string, protocols?: string | string[], options?: { headers?: Record<string, string> });
		send(data: string): void;
		close(): void;
		on(type: string, listener: (...args: unknown[]) => void): void;
	}
}
