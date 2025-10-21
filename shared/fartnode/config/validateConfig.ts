import Ajv from 'ajv';
import { fartSchema } from './schema';
import type { FartConfig } from './types';

const ajv = new Ajv({ allErrors: true, strict: false });
const validate = ajv.compile<FartConfig>(fartSchema);

function formatErrors(): string {
	return (validate.errors ?? [])
		.map((error) => {
			const path = error.instancePath || error.schemaPath;
			const message = error.message ?? 'invalid value';
			return `${path} ${message}`.trim();
		})
		.join('; ');
}

export function assertFartConfig(cfg: unknown): FartConfig {
	if (!validate(cfg)) {
		const msg = formatErrors();
		throw new Error(`fart.yaml invalid: ${msg}`);
	}

	return cfg as FartConfig;
}

export type { FartConfig };
