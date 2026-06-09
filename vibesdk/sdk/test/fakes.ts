export function streamFromString(input: string): ReadableStream<Uint8Array> {
	return new ReadableStream({
		start(controller) {
			controller.enqueue(new TextEncoder().encode(input));
			controller.close();
		},
	});
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
