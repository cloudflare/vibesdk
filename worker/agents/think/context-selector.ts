import type { ModelMessage } from 'ai';

const RECENT_MESSAGE_COUNT = 5;

type MessagePart = {
	type?: string;
	toolName?: string;
	toolCallId?: string;
};

function partsOf(message: ModelMessage): MessagePart[] {
	return Array.isArray(message.content) ? (message.content as MessagePart[]) : [];
}

function toolCallIds(message: ModelMessage): Set<string> {
	if (message.role !== 'assistant') return new Set();
	return new Set(
		partsOf(message)
			.filter((part) => part.type === 'tool-call' && typeof part.toolCallId === 'string')
			.map((part) => part.toolCallId as string),
	);
}

function toolResultIds(message: ModelMessage): Set<string> {
	if (message.role !== 'tool') return new Set();
	return new Set(
		partsOf(message)
			.filter((part) => part.type === 'tool-result' && typeof part.toolCallId === 'string')
			.map((part) => part.toolCallId as string),
	);
}

function containsToolCall(message: ModelMessage, toolName: string): boolean {
	return (
		message.role === 'assistant' &&
		partsOf(message).some(
			(part) => part.type === 'tool-call' && part.toolName === toolName,
		)
	);
}

function hasText(message: ModelMessage): boolean {
	if (message.role !== 'user' && message.role !== 'assistant') return false;
	if (typeof message.content === 'string') return message.content.trim().length > 0;
	return partsOf(message).some(
		(part) => part.type === 'text' && 'text' in part && typeof part.text === 'string' && part.text.trim().length > 0,
	);
}

function includeNamedToolPair(
	messages: ModelMessage[],
	selected: Set<number>,
	protectedToolMessages: Set<number>,
	callIndex: number,
): void {
	selected.add(callIndex);
	protectedToolMessages.add(callIndex);
	const calls = toolCallIds(messages[callIndex]);
	for (let candidate = callIndex + 1; candidate < messages.length; candidate++) {
		if (messages[candidate].role !== 'tool') break;
		const results = toolResultIds(messages[candidate]);
		if ([...results].some((id) => calls.has(id))) {
			selected.add(candidate);
			protectedToolMessages.add(candidate);
		}
	}
}

export function selectThinkContextMessages(messages: ModelMessage[]): ModelMessage[] {
	if (messages.length === 0) return [];

	const selected = new Set<number>([0]);
	const protectedToolMessages = new Set<number>();
	let recentTextCount = 0;
	for (let index = messages.length - 1; index >= 0 && recentTextCount < RECENT_MESSAGE_COUNT; index--) {
		if (!hasText(messages[index])) continue;
		selected.add(index);
		recentTextCount++;
	}

	for (let index = 0; index < messages.length; index++) {
		if (containsToolCall(messages[index], 'ask_questions')) {
			includeNamedToolPair(messages, selected, protectedToolMessages, index);
			for (let candidate = index + 1; candidate < messages.length; candidate++) {
				if (messages[candidate].role === 'user') {
					selected.add(candidate);
					break;
				}
			}
		}
		if (
			containsToolCall(messages[index], 'activate_skill') ||
			containsToolCall(messages[index], 'set_title')
		) {
			includeNamedToolPair(messages, selected, protectedToolMessages, index);
		}
	}

	return messages.flatMap((message, index) => {
		if (!selected.has(index)) return [];
		if (
			message.role !== 'assistant' ||
			protectedToolMessages.has(index) ||
			!Array.isArray(message.content)
		) {
			return [message];
		}
		const textContent = message.content.filter((part) => part.type !== 'tool-call');
		return textContent.length > 0 ? [{ ...message, content: textContent }] : [];
	});
}
