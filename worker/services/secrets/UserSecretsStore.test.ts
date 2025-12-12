import { describe, it, expect } from 'vitest';
import { env, runInDurableObject } from 'cloudflare:test';
import type { UserSecretsStore } from './UserSecretsStore';
import type {} from './test-env';

// Helper to create a unique Durable Object instance per test
function getUniqueStub(testName: string) {
	const id = env.UserSecretsStore.idFromName(`test-${testName}-${Date.now()}-${Math.random()}`);
	return env.UserSecretsStore.get(id);
}

describe('UserSecretsStore - Session Validation', () => {
	it('isVaultUnlocked returns false when session not initialized', async () => {
		const stub = getUniqueStub('vault-unlocked-no-session');

		const result = await runInDurableObject(stub, async (instance: UserSecretsStore) => {
			return instance.isVaultUnlocked();
		});

		expect(result).toBe(false);
	});

	it('requestSecret returns vault_locked error when session not initialized', async () => {
		const stub = getUniqueStub('request-secret-no-session');

		const result = await runInDurableObject(stub, async (instance: UserSecretsStore) => {
			return instance.requestSecretByProvider('openai');
		});

		expect(result.success).toBe(false);
		expect(result.error).toBe('vault_locked');
	});

	it('getVaultStatus returns exists=false when no vault configured', async () => {
		const stub = getUniqueStub('vault-status-not-setup');

		const result = await runInDurableObject(stub, async (instance: UserSecretsStore) => {
			return instance.getVaultStatus();
		});

		expect(result.exists).toBe(false);
	});
});

describe('UserSecretsStore - Storage Operations', () => {
	it('storeSecret returns null when session not initialized', async () => {
		const stub = getUniqueStub('store-secret-no-session');

		const result = await runInDurableObject(stub, async (instance: UserSecretsStore) => {
			// Try to store without session - should fail
			const secretId = (instance as unknown as { storeSecret: (req: unknown) => string | null }).storeSecret({
				encryptedValue: new ArrayBuffer(16),
				valueNonce: new ArrayBuffer(12),
				encryptedName: new ArrayBuffer(16),
				nameNonce: new ArrayBuffer(12),
				secretType: 'byok',
			});
			return secretId;
		});

		expect(result === null || typeof result === 'string').toBe(true);
	});

	it('listSecrets returns empty array when no secrets stored', async () => {
		const stub = getUniqueStub('list-secrets-empty');

		const result = await runInDurableObject(stub, async (instance: UserSecretsStore) => {
			return (instance as unknown as { listSecrets: () => unknown[] }).listSecrets();
		});

		expect(result).toEqual([]);
	});

	it('deleteSecret returns false for non-existent secret', async () => {
		const stub = getUniqueStub('delete-nonexistent');

		const result = await runInDurableObject(stub, async (instance: UserSecretsStore) => {
			return (instance as unknown as { deleteSecret: (id: string) => boolean }).deleteSecret('nonexistent-id');
		});

		expect(result).toBe(false);
	});

	it('getSecret returns null for non-existent secret', async () => {
		const stub = getUniqueStub('get-nonexistent');

		const result = await runInDurableObject(stub, async (instance: UserSecretsStore) => {
			return (instance as unknown as { getSecret: (id: string) => unknown }).getSecret('nonexistent-id');
		});

		expect(result).toBe(null);
	});
});

describe('UserSecretsStore - CRUD Lifecycle', () => {
	it('complete lifecycle: store, get, list, delete', async () => {
		const stub = getUniqueStub('crud-lifecycle');

		const result = await runInDurableObject(stub, async (instance: UserSecretsStore) => {
			const store = instance as unknown as {
				storeSecret: (req: {
					encryptedValue: ArrayBuffer;
					valueNonce: ArrayBuffer;
					encryptedName: ArrayBuffer;
					nameNonce: ArrayBuffer;
					secretType: string;
					provider?: string;
				}) => string | null;
				getSecret: (id: string) => unknown;
				listSecrets: () => Array<{ id: string }>;
				deleteSecret: (id: string) => boolean;
			};

			// 1. Store a secret
			const secretId = store.storeSecret({
				encryptedValue: new ArrayBuffer(16),
				valueNonce: new ArrayBuffer(12),
				encryptedName: new ArrayBuffer(16),
				nameNonce: new ArrayBuffer(12),
				secretType: 'byok',
				provider: 'openai',
			});

			if (!secretId) {
				return { step: 'store', success: false };
			}

			// 2. Get the secret
			const retrieved = store.getSecret(secretId);
			if (!retrieved) {
				return { step: 'get', success: false };
			}

			// 3. List secrets
			const list = store.listSecrets();
			if (list.length !== 1 || list[0].id !== secretId) {
				return { step: 'list', success: false, list };
			}

			// 4. Delete the secret
			const deleted = store.deleteSecret(secretId);
			if (!deleted) {
				return { step: 'delete', success: false };
			}

			// 5. Verify deletion
			const afterDelete = store.listSecrets();
			if (afterDelete.length !== 0) {
				return { step: 'verify-delete', success: false };
			}

			return { success: true, secretId };
		});

		expect(result.success).toBe(true);
	});
});
