export async function* parseNdjsonStream(stream: ReadableStream<Uint8Array>): AsyncGenerator<unknown> {
	const reader = stream.getReader();
	const decoder = new TextDecoder();
	let buffer = '';

	while (true) {
		const { value, done } = await reader.read();
		if (done) break;
		buffer += decoder.decode(value, { stream: true });

		while (true) {
			const newlineIndex = buffer.indexOf('\n');
			if (newlineIndex === -1) break;
			const line = buffer.slice(0, newlineIndex).trim();
			buffer = buffer.slice(newlineIndex + 1);
			if (!line) continue;
			yield JSON.parse(line) as unknown;
		}
	}

	const tail = buffer.trim();
	if (tail) {
		yield JSON.parse(tail) as unknown;
	}
}
