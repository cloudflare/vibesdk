// Minimal test entry point - exports only DOs needed for testing
export { UserSecretsStore } from '../worker/services/secrets/UserSecretsStore';

export default {
	async fetch() {
		return new Response('Test worker');
	},
};
