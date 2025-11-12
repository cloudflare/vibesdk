import { ChatCompletionFunctionTool, ChatCompletionMessageFunctionToolCall } from 'openai/resources';
export interface MCPServerConfig {
	name: string;
	sseUrl: string;
}
export interface MCPResult {
	content: string;
}

export interface ErrorResult {
	error: string;
}

export interface ToolCallResult {
	id: string;
	name: string;
	arguments: Record<string, unknown>;
	result?: unknown;
}

export type ToolImplementation<TArgs = Record<string, unknown>, TResult = unknown> = 
	(args: TArgs) => Promise<TResult>;

export type ToolDefinition<
    TArgs = Record<string, unknown>,
    TResult = unknown
> = ChatCompletionFunctionTool & {
    implementation: ToolImplementation<TArgs, TResult>;
    onStart?: (toolCall: ChatCompletionMessageFunctionToolCall, args: TArgs) => Promise<void>;
    onComplete?: (toolCall: ChatCompletionMessageFunctionToolCall, args: TArgs, result: TResult) => Promise<void>;
};

export type ExtractToolArgs<T> = T extends ToolImplementation<infer A, any> ? A : never;

export type ExtractToolResult<T> = T extends ToolImplementation<any, infer R> ? R : never;