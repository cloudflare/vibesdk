/**
 * Minimal test worker entry point.
 * Only exports Durable Objects needed for testing to avoid loading
 * problematic dependencies (like MCP SDK) that don't work in workerd test env.
 */
import { DurableObject } from 'cloudflare:workers';

export { UserSecretsStore } from '../worker/services/secrets/UserSecretsStore';

/**
 * Empty Durable Object used only to obtain a real `SqlStorage` inside the
 * workers test pool. FileSystem contract tests construct a `Workspace` on
 * `state.storage.sql` via `runInDurableObject`, so this class needs no methods.
 */
export class FsHarnessDO extends DurableObject {}

export default {
	async fetch() {
		return new Response('Test worker');
	},
};
