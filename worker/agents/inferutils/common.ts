import { type ChatCompletionMessageToolCall } from 'openai/resources'

// Define allowed message roles for type safety
export type MessageRole = 'system' | 'user' | 'assistant' | 'function' | 'tool';

// Define content types for multi-modal support
export type TextContent = {
	type: 'text';
	text: string;
};

export type ImageContent = {
	type: 'image_url';
	image_url: {
		url: string; // Can be a URL or base64 data URL
		detail?: 'auto' | 'low' | 'high'; // Optional detail level for vision models
	};
};

export type MessageContent = string | (TextContent | ImageContent)[] | null;

// Define a proper message type that matches OpenAI's requirements and supports multi-modal content
export type Message = {
	role: MessageRole;
	content: MessageContent;
	name?: string; // Optional name field required for function messages
	tool_calls?: ChatCompletionMessageToolCall[];
};

export interface ConversationMessage extends Message {
	conversationId: string;
}

/**
 * Create a standard user message with content
 */
export function createUserMessage(content: MessageContent) {
	return {
		role: 'user' as MessageRole,
		content,
	};
}

/**
 * Create a standard system message with content
 */
export function createSystemMessage(content: string) {
	return {
		role: 'system' as MessageRole,
		content,
	};
}

/**
 * Create a standard assistant message with content
 */
export function createAssistantMessage(content: string) {
	return {
		role: 'assistant' as MessageRole,
		content,
	};
}

/**
 * Create a multi-modal user message with text and image content
 */
export function createMultiModalUserMessage(
	text: string,
	imageUrls: string | string[],
	detail?: 'auto' | 'low' | 'high',
): {
	role: MessageRole;
	content: (TextContent | ImageContent)[];
} {
	const urls = Array.isArray(imageUrls) ? imageUrls : [imageUrls];
	
	return {
		role: 'user' as MessageRole,
		content: [
			{
				type: 'text',
				text,
			},
			...urls.map(url => ({
				type: 'image_url' as const,
				image_url: {
					url,
					detail: detail || 'auto',
				},
			})),
		],
	};
}