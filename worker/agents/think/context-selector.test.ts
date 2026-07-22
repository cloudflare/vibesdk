import type { ModelMessage } from 'ai';
import { describe, expect, it } from 'vitest';
import { selectThinkContextMessages } from './context-selector';

function user(text: string): ModelMessage {
	return { role: 'user', content: text };
}

function assistant(text: string): ModelMessage {
	return { role: 'assistant', content: text };
}

function toolCall(id: string, toolName: string): ModelMessage {
	return {
		role: 'assistant',
		content: [
			{
				type: 'tool-call',
				toolCallId: id,
				toolName,
				input: toolName === 'ask_questions' ? { questions: [{ question: 'Choose' }] } : {},
			},
		],
	};
}

function ask(id: string): ModelMessage {
	return toolCall(id, 'ask_questions');
}

function result(id: string, toolName = 'ask_questions'): ModelMessage {
	return {
		role: 'tool',
		content: [
			{
				type: 'tool-result',
				toolCallId: id,
				toolName,
				output: { type: 'text', value: '{"ok":true}' },
			},
		],
	};
}

describe('selectThinkContextMessages', () => {
	it('returns short histories unchanged', () => {
		const messages = [user('first'), assistant('one'), user('two')];
		expect(selectThinkContextMessages(messages)).toEqual(messages);
	});

	it('keeps the first and last five messages', () => {
		const messages = [
			user('first'),
			assistant('drop-1'),
			assistant('drop-2'),
			user('recent-1'),
			assistant('recent-2'),
			user('recent-3'),
			assistant('recent-4'),
			user('recent-5'),
		];
		expect(selectThinkContextMessages(messages)).toEqual([
			messages[0],
			...messages.slice(-5),
		]);
	});

	it('keeps every clarification call, its result, and its next user reply', () => {
		const messages = [
			user('first'),
			ask('ask-1'),
			result('ask-1'),
			assistant('waiting'),
			user('answer-1'),
			assistant('old work'),
			ask('ask-2'),
			result('ask-2'),
			assistant('more waiting'),
			user('answer-2'),
			assistant('recent-1'),
			user('recent-2'),
			assistant('recent-3'),
			user('recent-4'),
			assistant('recent-5'),
		];
		expect(selectThinkContextMessages(messages)).toEqual([
			messages[0],
			messages[1],
			messages[2],
			messages[4],
			messages[6],
			messages[7],
			...messages.slice(-6, -5),
			...messages.slice(-5),
		]);
	});

	it('associates consecutive calls with the same next user reply', () => {
		const messages = [
			user('first'),
			ask('ask-1'),
			result('ask-1'),
			ask('ask-2'),
			result('ask-2'),
			assistant('waiting'),
			user('shared answer'),
			assistant('one'),
			user('two'),
			assistant('three'),
			user('four'),
			assistant('five'),
		];
		const selected = selectThinkContextMessages(messages);
		expect(selected).toContain(messages[1]);
		expect(selected).toContain(messages[2]);
		expect(selected).toContain(messages[3]);
		expect(selected).toContain(messages[4]);
		expect(selected.filter((message) => message === messages[6])).toHaveLength(1);
	});

	it('keeps an unanswered clarification call and its tool result', () => {
		const messages = [
			user('first'),
			assistant('old'),
			user('older'),
			ask('pending'),
			result('pending'),
			assistant('one'),
			assistant('two'),
			assistant('three'),
			assistant('four'),
			assistant('five'),
		];
		const selected = selectThinkContextMessages(messages);
		expect(selected).toContain(messages[3]);
		expect(selected).toContain(messages[4]);
	});

	it('keeps all activate_skill calls and responses', () => {
		const messages = [
			user('first'),
			toolCall('skill-1', 'activate_skill'),
			result('skill-1', 'activate_skill'),
			assistant('old'),
			toolCall('skill-2', 'activate_skill'),
			result('skill-2', 'activate_skill'),
			user('one'),
			assistant('two'),
			user('three'),
			assistant('four'),
			user('five'),
		];
		const selected = selectThinkContextMessages(messages);
		expect(selected).toContain(messages[1]);
		expect(selected).toContain(messages[2]);
		expect(selected).toContain(messages[4]);
		expect(selected).toContain(messages[5]);
	});

	it('keeps all set_title calls and responses', () => {
		const messages = [
			user('first'),
			toolCall('title-1', 'set_title'),
			result('title-1', 'set_title'),
			assistant('old'),
			toolCall('title-2', 'set_title'),
			result('title-2', 'set_title'),
			user('one'),
			assistant('two'),
			user('three'),
			assistant('four'),
			user('five'),
		];
		const selected = selectThinkContextMessages(messages);
		expect(selected).toContain(messages[1]);
		expect(selected).toContain(messages[2]);
		expect(selected).toContain(messages[4]);
		expect(selected).toContain(messages[5]);
	});

	it('removes orphaned ordinary tool calls from retained assistant text', () => {
		const mixedAssistant: ModelMessage = {
			role: 'assistant',
			content: [
				{ type: 'text', text: 'I updated the file.' },
				{ type: 'tool-call', toolCallId: 'write-18', toolName: 'write', input: {} },
			],
		};
		const messages = [
			user('first'),
			assistant('old'),
			mixedAssistant,
			result('write-18', 'write'),
			user('two'),
			assistant('three'),
			user('four'),
			assistant('five'),
		];
		const selected = selectThinkContextMessages(messages);
		expect(selected).toContainEqual({
			role: 'assistant',
			content: [{ type: 'text', text: 'I updated the file.' }],
		});
		expect(selected).not.toContain(messages[3]);
	});

	it('counts only text messages in the recent five and excludes ordinary tools', () => {
		const messages = [
			user('first'),
			assistant('old'),
			user('recent-1'),
			toolCall('read-1', 'read'),
			result('read-1', 'read'),
			assistant('recent-2'),
			toolCall('write-1', 'write'),
			result('write-1', 'write'),
			user('recent-3'),
			assistant('recent-4'),
			user('recent-5'),
		];
		expect(selectThinkContextMessages(messages)).toEqual([
			messages[0],
			messages[2],
			messages[5],
			messages[8],
			messages[9],
			messages[10],
		]);
	});
});
