import { describe, expect, it } from 'bun:test';
import { parseNdjsonStream } from '../src/ndjson';

function streamFromString(input: string): ReadableStream<Uint8Array> {
	return new ReadableStream({
		start(controller) {
			controller.enqueue(new TextEncoder().encode(input));
			controller.close();
		},
	});
}

describe('parseNdjsonStream', () => {
	it('parses newline-delimited JSON objects', async () => {
		const s = streamFromString('{"a":1}\n{"b":2}\n');
		const out: unknown[] = [];
		for await (const obj of parseNdjsonStream(s)) out.push(obj);
		expect(out).toEqual([{ a: 1 }, { b: 2 }]);
	});

	it('handles chunk tail without newline', async () => {
		const s = streamFromString('{"a":1}\n{"b":2}');
		const out: unknown[] = [];
		for await (const obj of parseNdjsonStream(s)) out.push(obj);
		expect(out).toEqual([{ a: 1 }, { b: 2 }]);
	});
});
