import type { DurableObjectNamespace } from '@cloudflare/workers-types';

declare module 'cloudflare:test' {
	interface ProvidedEnv {
		UserSecretsStore: DurableObjectNamespace;
	}
}
