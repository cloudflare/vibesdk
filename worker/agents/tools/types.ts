import { ChatCompletionFunctionTool, ChatCompletionMessageFunctionToolCall } from 'openai/resources';
import { z } from 'zod';
import { mergeResources, type Resources } from './resources';
import { Type } from './resource-types';

export { t, type } from './resource-types';
export type { Type } from './resource-types';
export type { Resources as ResourceAccess } from './resources';

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

export interface ToolDefinition<TArgs = unknown, TResult = unknown> {
	name: string;
	description: string;
	schema: z.ZodTypeAny;
	implementation: (args: TArgs) => Promise<TResult>;
	resources: (args: TArgs) => Resources;
	onStart?: (toolCall: ChatCompletionMessageFunctionToolCall, args: TArgs) => Promise<void>;
	onComplete?: (toolCall: ChatCompletionMessageFunctionToolCall, args: TArgs, result: TResult) => Promise<void>;
	openAISchema: ChatCompletionFunctionTool;
}

interface JSONSchema {
	type?: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'null';
	description?: string;
	properties?: Record<string, JSONSchema>;
	items?: JSONSchema;
	required?: string[];
	enum?: unknown[];
	default?: unknown;
	[key: string]: unknown;
}

function zodToOpenAIParameters(schema: z.ZodType<unknown>): JSONSchema {
	if (schema instanceof z.ZodObject) {
		const shape = schema._def.shape();
		const properties: Record<string, JSONSchema> = {};
		const required: string[] = [];

		for (const [key, value] of Object.entries(shape)) {
			const zodField = value as z.ZodTypeAny;
			properties[key] = zodTypeToJsonSchema(zodField);

			if (!zodField.isOptional()) {
				required.push(key);
			}
		}

		return {
			type: 'object' as const,
			properties,
			required: required.length > 0 ? required : undefined,
		};
	}

	return zodTypeToJsonSchema(schema);
}

function zodTypeToJsonSchema(schema: z.ZodTypeAny): JSONSchema {
	const description = schema.description;

	if (schema instanceof z.ZodString) {
		return { type: 'string' as const, description };
	}

	if (schema instanceof z.ZodNumber) {
		return { type: 'number' as const, description };
	}

	if (schema instanceof z.ZodBoolean) {
		return { type: 'boolean' as const, description };
	}

	if (schema instanceof z.ZodArray) {
		return {
			type: 'array' as const,
			items: zodTypeToJsonSchema(schema._def.type),
			description,
		};
	}

	if (schema instanceof z.ZodObject) {
		const shape = schema._def.shape();
		const properties: Record<string, JSONSchema> = {};
		const required: string[] = [];

		for (const [key, value] of Object.entries(shape)) {
			const zodField = value as z.ZodTypeAny;
			properties[key] = zodTypeToJsonSchema(zodField);

			if (!zodField.isOptional()) {
				required.push(key);
			}
		}

		return {
			type: 'object' as const,
			properties,
			required: required.length > 0 ? required : undefined,
			description,
		};
	}

	if (schema instanceof z.ZodOptional) {
		return zodTypeToJsonSchema(schema._def.innerType);
	}

	if (schema instanceof z.ZodDefault) {
		const innerSchema = zodTypeToJsonSchema(schema._def.innerType);
		return {
			...innerSchema,
			default: schema._def.defaultValue(),
		};
	}

	if (schema instanceof z.ZodEnum) {
		return {
			type: 'string' as const,
			enum: schema._def.values,
			description,
		};
	}

	return { type: 'string' as const, description };
}

function buildTool<TArgs, TResult>(
	name: string,
	description: string,
	schema: z.ZodObject<z.ZodRawShape>,
	implementation: (args: TArgs) => Promise<TResult>,
	resources: (args: TArgs) => Resources,
	onStart?: (toolCall: ChatCompletionMessageFunctionToolCall, args: TArgs) => Promise<void>,
	onComplete?: (toolCall: ChatCompletionMessageFunctionToolCall, args: TArgs, result: TResult) => Promise<void>
): ToolDefinition<TArgs, TResult> {
	return {
		name,
		description,
		schema,
		implementation,
		resources,
		onStart,
		onComplete,
		openAISchema: {
			type: 'function' as const,
			function: {
				name,
				description,
				parameters: zodToOpenAIParameters(schema),
			},
		},
	};
}

export function tool<TArgs extends Record<string, unknown>, TResult>(config: {
	name: string;
	description: string;
	args: { [K in keyof TArgs]: Type<TArgs[K]> };
	run: (args: TArgs) => Promise<TResult>;
	onStart?: (toolCall: ChatCompletionMessageFunctionToolCall, args: TArgs) => Promise<void>;
	onComplete?: (toolCall: ChatCompletionMessageFunctionToolCall, args: TArgs, result: TResult) => Promise<void>;
}): ToolDefinition<TArgs, TResult> {
	const zodSchemaShape: Record<string, z.ZodTypeAny> = {};
	for (const key in config.args) {
		zodSchemaShape[key] = config.args[key].schema;
	}
	const zodSchema = z.object(zodSchemaShape);

	const extractResources = (args: TArgs): Resources => {
		const merged: Resources = {};
		for (const key in config.args) {
			mergeResources(merged, config.args[key].resources(args[key]));
		}
		return merged;
	};

	return buildTool(
		config.name,
		config.description,
		zodSchema,
		config.run,
		extractResources,
		config.onStart,
		config.onComplete
	);
}

export function toOpenAITool(tool: ToolDefinition<unknown, unknown>): ChatCompletionFunctionTool {
	return tool.openAISchema;
}
