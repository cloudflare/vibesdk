export function streamFromString(input: string): ReadableStream<Uint8Array> {
	return new ReadableStream({
		start(controller) {
			controller.enqueue(new TextEncoder().encode(input));
			controller.close();
		},
	});
}

export class FakeWebSocket {
	sent: string[] = [];
	closed = false;

	private listeners = new Map<string, Set<(...args: unknown[]) => void>>();

	addEventListener(type: 'open' | 'close' | 'error' | 'message', listener: (event: unknown) => void): void {
		this.on(type, listener);
	}

	on(type: string, listener: (...args: unknown[]) => void): void {
		const set = this.listeners.get(type) ?? new Set();
		set.add(listener);
		this.listeners.set(type, set);
	}

	private emit(type: string, ...args: unknown[]): void {
		const set = this.listeners.get(type);
		if (!set) return;
		for (const cb of set) cb(...args);
	}

	send(data: string): void {
		this.sent.push(data);
	}

	close(): void {
		this.closed = true;
		this.emit('close', { code: 1000, reason: '' });
	}

	emitOpen(): void {
		this.emit('open', {});
	}

	emitMessageJson(obj: unknown): void {
		this.emit('message', { data: JSON.stringify(obj) });
	}

	emitError(err: unknown): void {
		this.emit('error', err);
	}
}

export type FetchCall = {
	url: string;
	init?: RequestInit;
};

export function createFetchMock(handler: (call: FetchCall) => Promise<Response> | Response) {
	const calls: FetchCall[] = [];
	const fn = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
		const url = typeof input === 'string' ? input : input.toString();
		calls.push({ url, init });
		return await handler({ url, init });
	};
	return { fetchFn: fn, calls };
}
