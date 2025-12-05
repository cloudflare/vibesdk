import { z } from 'zod';

import { mergeResources, type Resources } from './resources';

export interface Type<T> {
	schema: z.ZodType<T>;
	resources: ResourceResolver<T>;
	describe(desc: string): Type<T>;
	optional(): Type<T | undefined>;
	default(defaultValue: T): Type<T>;
}

type ResourceResolver<T> = (value: T) => Resources;

function buildType<T>(
	schema: z.ZodTypeAny,
	resources: ResourceResolver<T>
): Type<T> {
	return {
		schema,
		resources,
		describe: (desc) => buildType(schema.describe(desc), resources),
		optional: () => buildType(schema.optional(), (value) =>
			value === undefined ? {} : resources(value)
		),
		default: (defaultValue) => buildType(schema.default(defaultValue), resources),
	};
}

export function type<S extends z.ZodTypeAny>(
	schema: S,
	resources: ResourceResolver<z.output<S>>
): Type<z.output<S>> {
	return buildType(schema, resources);
}

const primitive = {
	string: () => type(z.string(), () => ({})),
	number: () => type(z.number(), () => ({})),
	boolean: () => type(z.boolean(), () => ({})),

	array<T>(itemType: Type<T>) {
		return type(z.array(itemType.schema), (items) => {
			const merged: Resources = {};
			items.forEach((item) => mergeResources(merged, itemType.resources(item)));
			return merged;
		});
	},

	enum<T extends readonly [string, ...string[]]>(values: T) {
		return type(z.enum(values), () => ({}));
	},
};

export const t = {
	string: primitive.string,
	number: primitive.number,
	boolean: primitive.boolean,
	array: primitive.array,
	enum: primitive.enum,

	file: {
		read: () =>
			type(z.string(), (path) => ({ files: { mode: 'read', paths: [path] } })),
		write: () =>
			type(z.string(), (path) => ({ files: { mode: 'write', paths: [path] } })),
	},

	files: {
		read: () =>
			type(z.array(z.string()), (paths) => ({ files: { mode: 'read', paths } })),
		write: () =>
			type(z.array(z.string()), (paths) => ({ files: { mode: 'write', paths } })),
	},

	generation: () =>
		type(
			z.array(
				z.object({
					path: z.string().describe('Relative file path from project root'),
					description: z.string().describe('Brief description of what this file should do and its purpose in the project'),
				})
			),
			(specs) => ({ files: { mode: 'write', paths: specs.map((s) => s.path) } })
		),

	commands: () =>
		type(z.array(z.string()), () => ({ sandbox: { operation: 'exec' } })),

	analysis: {
		files: () => type(z.array(z.string()).optional(), () => ({ sandbox: { operation: 'analysis' } })),
	},

	deployment: {
		force: () => type(z.boolean().optional(), () => ({
			sandbox: { operation: 'deploy' },
			files: { mode: 'read', paths: [] },
		})),
	},

	logs: {
		reset: () => type(z.boolean().optional(), () => ({ sandbox: { operation: 'read' } })),
		durationSeconds: () => type(z.number().optional(), () => ({ sandbox: { operation: 'read' } })),
		maxLines: () => type(z.number().optional(), () => ({ sandbox: { operation: 'read' } })),
	},

	runtimeErrors: () =>
		type(z.literal(true).optional(), () => ({ sandbox: { operation: 'read' } })),

	blueprint: () => type(z.string(), () => ({ blueprint: true })),
};
