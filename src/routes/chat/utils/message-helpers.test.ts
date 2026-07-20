import { describe, it, expect } from 'vitest';
import {
	appendTextDelta,
	appendReasoningDelta,
	appendToolEvent,
	setAssistantText,
	getMessageText,
	type ChatMessage,
	type MessagePart,
} from './message-helpers';

const CONV = 'conv-1';

/** Reduce a message's parts to a comparable shape (dropping volatile fields). */
function shape(parts: MessagePart[] | undefined) {
	return (parts ?? []).map((p) => {
		if (p.type === 'text') return { type: p.type, text: p.text };
		if (p.type === 'reasoning') return { type: p.type, text: p.text, done: p.done };
		return { type: p.type, name: p.event.name, status: p.event.status, result: p.event.result };
	});
}

describe('message parts appenders', () => {
	it('interleaves text, reasoning and tools in emission order', () => {
		let messages: ChatMessage[] = [];
		messages = appendReasoningDelta(messages, CONV, 'let me think', false);
		messages = appendReasoningDelta(messages, CONV, ' about it', true);
		messages = appendTextDelta(messages, CONV, 'Hello ');
		messages = appendTextDelta(messages, CONV, 'world');
		messages = appendToolEvent(messages, CONV, { name: 'write', status: 'start', id: 't1', args: { path: 'a.ts' } });
		messages = appendToolEvent(messages, CONV, { name: 'write', status: 'success', id: 't1', result: 'ok' });
		messages = appendTextDelta(messages, CONV, 'Done.');

		const msg = messages.find((m) => m.conversationId === CONV)!;
		expect(shape(msg.parts)).toEqual([
			{ type: 'reasoning', text: 'let me think about it', done: true },
			{ type: 'text', text: 'Hello world' },
			{ type: 'tool', name: 'write', status: 'success', result: 'ok' },
			{ type: 'text', text: 'Done.' },
		]);
		// Derived text mirror joins only the text parts.
		expect(getMessageText(msg.parts)).toBe('Hello world\n\nDone.');
	});

	it('matches tool completion by id even when interleaved', () => {
		let messages: ChatMessage[] = [];
		messages = appendToolEvent(messages, CONV, { name: 'read', status: 'start', id: 'a' });
		messages = appendToolEvent(messages, CONV, { name: 'read', status: 'start', id: 'b' });
		messages = appendToolEvent(messages, CONV, { name: 'read', status: 'success', id: 'a', result: 'A' });

		const msg = messages.find((m) => m.conversationId === CONV)!;
		const tools = (msg.parts ?? []).filter((p) => p.type === 'tool') as Extract<MessagePart, { type: 'tool' }>[];
		expect(tools).toHaveLength(2);
		expect(tools[0].event).toMatchObject({ id: 'a', status: 'success', result: 'A' });
		expect(tools[1].event).toMatchObject({ id: 'b', status: 'start' });
	});

	it('setAssistantText preserves streamed interleaving (finalize no-op)', () => {
		let messages: ChatMessage[] = [];
		messages = appendTextDelta(messages, CONV, 'Part A ');
		messages = appendToolEvent(messages, CONV, { name: 'edit', status: 'start', id: 't1' });
		messages = appendToolEvent(messages, CONV, { name: 'edit', status: 'success', id: 't1', result: 'done' });
		messages = appendTextDelta(messages, CONV, 'Part B');
		const before = shape(messages.find((m) => m.conversationId === CONV)!.parts);

		// Finalize with the full accumulated text; ordering must not collapse.
		messages = setAssistantText(messages, CONV, 'Part A \n\nPart B');
		const after = shape(messages.find((m) => m.conversationId === CONV)!.parts);
		expect(after).toEqual(before);
	});
});
