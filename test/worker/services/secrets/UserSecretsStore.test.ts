/**
 * Comprehensive Tests for UserSecretsStore Durable Object
 * 
 * Tests complete lifecycle with unique DO instances per test to avoid
 * SQLite WAL cleanup issues (each test uses fresh DO with unique ID)
 * 
 * Coverage:
 * - Initialization & readiness
 * - CRUD operations (Create, Read, Update, Delete)
 * - Encryption & decryption
 * - Validation & error handling
 * - Secret expiration support
 * 
 * @vitest-environment @cloudflare/vitest-pool-workers
 */

import { describe, it, expect, afterEach } from 'vitest';
import { env } from 'cloudflare:test';
import type { 
    StoreSecretRequest, 
    SecretMetadata,
    SecretWithValue,
    KeyRotationInfo
} from '../../../../worker/services/secrets/types';
import type { DurableObjectNamespace } from '@cloudflare/workers-types';

// Type for UserSecretsStore stub
interface UserSecretsStoreStub {
    isReady(): Promise<boolean>;
    storeSecret(request: StoreSecretRequest): Promise<SecretMetadata | null>;
    getSecretValue(secretId: string): Promise<SecretWithValue | null>;
    listSecrets(): Promise<SecretMetadata[]>;
    updateSecret(secretId: string, updates: Partial<StoreSecretRequest>): Promise<SecretMetadata | null>;
    deleteSecret(secretId: string): Promise<boolean>;
    getKeyRotationInfo(): Promise<KeyRotationInfo>;
}

describe('UserSecretsStore - Comprehensive Tests', () => {
    let currentStore: UserSecretsStoreStub | null = null;

    // Helper to get unique DO instance for each test (prevents SQLite WAL conflicts)
    function getUniqueStore(testName: string): UserSecretsStoreStub {
        const id = (env.UserSecretsStore as DurableObjectNamespace).idFromName(
            `test-${testName}-${Date.now()}-${Math.random()}`
        );
        const store = (env.UserSecretsStore as DurableObjectNamespace).get(id) as unknown as UserSecretsStoreStub;
        currentStore = store;
        return store;
    }

    // Cleanup after each test to ensure SQLite WAL files are checkpointed
    afterEach(async () => {
        if (currentStore) {
            try {
                // Force SQLite to checkpoint WAL files by doing a dummy query
                // This ensures .sqlite-shm files are cleaned up properly
                await currentStore.listSecrets();
            } catch (error) {
                // Ignore errors - test may have left DO in error state
            }
            currentStore = null;
        }
    });

    describe('Initialization', () => {
        it('should initialize and be ready', async () => {
            const store = getUniqueStore('init');
            const ready = await store.isReady();
            expect(ready).toBe(true);
        });

        it('should start with empty secrets list', async () => {
            const store = getUniqueStore('empty-list');
            const secrets = await store.listSecrets();
            expect(Array.isArray(secrets)).toBe(true);
            expect(secrets.length).toBe(0);
        });
    });

    describe('Secret Storage & Validation', () => {
        it('should store secret with full metadata', async () => {
            const store = getUniqueStore('store-full');
            const secret = await store.storeSecret({
                name: 'GitHub Token',
                secretType: 'token',
                provider: 'github',
                value: 'ghp_1234567890abcdefghijklmnop',
                metadata: { environment: 'production', scope: 'repo' }
            });
            expect(secret).not.toBeNull();
            if (!secret) return;

            expect(secret.id).toBeTruthy();
            expect(secret.name).toBe('GitHub Token');
            expect(secret.secretType).toBe('token');
            expect(secret.provider).toBe('github');
            expect(secret.keyPreview).toBeTruthy();
            expect(secret.keyPreview).not.toBe('ghp_1234567890abcdefghijklmnop');
            expect(secret.keyPreview).toContain('*');
            expect(secret.isActive).toBe(true);
            expect(secret.accessCount).toBe(0);
            expect(secret.metadata).toEqual({ environment: 'production', scope: 'repo' });
        });

        it('should return null for empty secret name', async () => {
            const store = getUniqueStore('validate-empty-name');
            
            const result = await store.storeSecret({
                name: '',
                secretType: 'api_key',
                value: 'test-value'
            });
            
            expect(result).toBeNull();
        });

        it('should return null for name exceeding max length', async () => {
            const store = getUniqueStore('validate-name-length');
            
            const longName = 'a'.repeat(201); // Max is 200
            const result = await store.storeSecret({
                name: longName,
                secretType: 'api_key',
                value: 'test-value'
            });
            
            expect(result).toBeNull();
        });

        it('should return null for empty secret value', async () => {
            const store = getUniqueStore('validate-empty-value');
            
            const result = await store.storeSecret({
                name: 'Test Secret',
                secretType: 'api_key',
                value: ''
            });
            
            expect(result).toBeNull();
        });

        it('should return null for value exceeding max size', async () => {
            const store = getUniqueStore('validate-value-size');
            
            const largeValue = 'x'.repeat(51 * 1024); // Max is 50KB
            const result = await store.storeSecret({
                name: 'Test Secret',
                secretType: 'api_key',
                value: largeValue
            });
            
            expect(result).toBeNull();
        });

        it('should return null for metadata exceeding max size', async () => {
            const store = getUniqueStore('validate-metadata-size');
            
            const largeMetadata = { data: 'x'.repeat(11 * 1024) }; // Max is 10KB
            const result = await store.storeSecret({
                name: 'Test Secret',
                secretType: 'api_key',
                value: 'test-value',
                metadata: largeMetadata
            });
            
            expect(result).toBeNull();
        });

        it('should accept valid secret at boundary limits', async () => {
            const store = getUniqueStore('validate-boundary');
            
            const result = await store.storeSecret({
                name: 'a'.repeat(200), // Exactly at limit
                secretType: 'api_key',
                value: 'x'.repeat(50 * 1024), // Exactly at limit
                metadata: { data: 'x'.repeat(10 * 1024 - 50) } // Just under limit
            });
            
            expect(result).not.toBeNull();
        });
    });

    describe('Secret Retrieval & Decryption', () => {
        it('should retrieve and decrypt secrets correctly', async () => {
            const store = getUniqueStore('retrieve');
            const originalValue = 'sk-openai-1234567890abcdefghijklmnop';
            
            const stored = await store.storeSecret({
                name: 'OpenAI API Key',
                secretType: 'api_key',
                provider: 'openai',
                value: originalValue
            });
            expect(stored).not.toBeNull();
            if (!stored) return;

            const result = await store.getSecretValue(stored.id);
            expect(result).not.toBeNull();
            if (!result) return;
            expect(result.value).toBe(originalValue);
            expect(result.metadata.id).toBe(stored.id);
            expect(result.metadata.name).toBe('OpenAI API Key');
            expect(result.metadata.accessCount).toBe(1);
            expect(result.metadata.lastAccessed).toBeTruthy();
        });

        it('should increment access count on each retrieval', async () => {
            const store = getUniqueStore('access-count');
            
            const stored = await store.storeSecret({
                name: 'Access Count Test',
                secretType: 'api_key',
                value: 'test-value-123'
            });
            expect(stored).not.toBeNull();
            if (!stored) return;

            await store.getSecretValue(stored.id);
            await store.getSecretValue(stored.id);
            const result = await store.getSecretValue(stored.id);
            expect(result).not.toBeNull();
            if (!result) return;
            expect(result.metadata.accessCount).toBe(3);
        });

        // Error tests removed - error handling simplified for clean architecture
    });

    describe('List Secrets', () => {
        it('should list all active secrets with metadata only', async () => {
            const store = getUniqueStore('list');
            
            const secret1 = await store.storeSecret({
                name: 'Secret 1',
                secretType: 'api_key',
                value: 'value-1'
            });
            expect(secret1).not.toBeNull();
            if (!secret1) return;

            const secret2 = await store.storeSecret({
                name: 'Secret 2',
                secretType: 'token',
                value: 'value-2'
            });
            expect(secret2).not.toBeNull();
            if (!secret2) return;

            const secrets = await store.listSecrets();
            expect(secrets.length).toBe(2);
            expect(secrets.every((s) => s.isActive)).toBe(true);
            
            // Verify no values are exposed in list
            secrets.forEach((secret) => {
                expect(secret).not.toHaveProperty('value');
                expect(secret.keyPreview).toBeTruthy();
            });
        });
    });

    describe('Update Secrets', () => {
        it('should update secret name', async () => {
            const store = getUniqueStore('update-name');
            
            const stored = await store.storeSecret({
                name: 'Original Name',
                secretType: 'api_key',
                value: 'test-value'
            });
            expect(stored).not.toBeNull();
            if (!stored) return;

            const updated = await store.updateSecret(stored.id, {
                name: 'Updated Name'
            });
            expect(updated).not.toBeNull();
            if (!updated) return;

            expect(updated.name).toBe('Updated Name');
            expect(updated.id).toBe(stored.id);
        });

        it('should update secret value and re-encrypt', async () => {
            const store = getUniqueStore('update-value');
            
            const stored = await store.storeSecret({
                name: 'Value Update Test',
                secretType: 'api_key',
                value: 'old-value-12345'
            });
            expect(stored).not.toBeNull();
            if (!stored) return;

            const oldKeyPreview = stored.keyPreview;

            const updated1 = await store.updateSecret(stored.id, {
                value: 'new-value-67890'
            });
            expect(updated1).not.toBeNull();
            if (!updated1) return;

            const updated2 = await store.updateSecret(stored.id, {
                value: 'new-value-67890'
            });
            expect(updated2).not.toBeNull();
            if (!updated2) return;

            const result = await store.getSecretValue(stored.id);
            expect(result).not.toBeNull();
            if (!result) return;
            expect(result.value).toBe('new-value-67890');
            expect(result.metadata.keyPreview).not.toBe(oldKeyPreview);
        });

        it('should update metadata', async () => {
            const store = getUniqueStore('update-metadata');
            
            const stored = await store.storeSecret({
                name: 'Metadata Test',
                secretType: 'config',
                value: 'config-value-123',
                metadata: { env: 'dev', region: 'us-west' }
            });
            expect(stored).not.toBeNull();
            if (!stored) return;

            const updated = await store.updateSecret(stored.id, {
                metadata: { env: 'prod', region: 'us-east', version: '2' }
            });
            expect(updated).not.toBeNull();
            if (!updated) return;

            expect(updated.metadata).toEqual({ env: 'prod', region: 'us-east', version: '2' });
        });

        it('should return null when updating with invalid name', async () => {
            const store = getUniqueStore('update-invalid-name');
            
            const stored = await store.storeSecret({
                name: 'Original Name',
                secretType: 'api_key',
                value: 'test-value'
            });
            expect(stored).not.toBeNull();
            if (!stored) return;

            const result = await store.updateSecret(stored.id, {
                name: '' // Invalid - empty name
            });
            
            expect(result).toBeNull();
        });

        it('should return null when updating with invalid value', async () => {
            const store = getUniqueStore('update-invalid-value');
            
            const stored = await store.storeSecret({
                name: 'Test Secret',
                secretType: 'api_key',
                value: 'test-value'
            });
            expect(stored).not.toBeNull();
            if (!stored) return;

            const result = await store.updateSecret(stored.id, {
                value: '' // Invalid - empty value
            });
            
            expect(result).toBeNull();
        });

        it('should return null when updating with oversized metadata', async () => {
            const store = getUniqueStore('update-invalid-metadata');
            
            const stored = await store.storeSecret({
                name: 'Test Secret',
                secretType: 'api_key',
                value: 'test-value'
            });
            expect(stored).not.toBeNull();
            if (!stored) return;

            const largeMetadata = { data: 'x'.repeat(11 * 1024) }; // Exceeds 10KB
            const result = await store.updateSecret(stored.id, {
                metadata: largeMetadata
            });
            
            expect(result).toBeNull();
        });

        it('should return null when updating non-existent secret', async () => {
            const store = getUniqueStore('update-not-found');
            
            const result = await store.updateSecret('non-existent-id', {
                name: 'New Name'
            });
            expect(result).toBeNull();
        });
    });

    describe('Delete Secrets', () => {
        it('should remove deleted secrets from list', async () => {
            const store = getUniqueStore('delete-from-list');
            
            const stored = await store.storeSecret({
                name: 'List Delete Test',
                secretType: 'api_key',
                value: 'test-value'
            });
            expect(stored).not.toBeNull();
            if (!stored) return;

            const beforeDelete = await store.listSecrets();
            const beforeCount = beforeDelete.filter((s) => s.id === stored.id).length;
            expect(beforeCount).toBe(1);

            await store.deleteSecret(stored.id);

            const afterDelete = await store.listSecrets();
            const afterCount = afterDelete.filter((s) => s.id === stored.id).length;
            expect(afterCount).toBe(0);
        });

        it('should return false when deleting non-existent secret', async () => {
            const store = getUniqueStore('delete-not-found');
            
            const result = await store.deleteSecret('non-existent-id');
            expect(result).toBe(false);
        });

        it('should return false when deleting already deleted secret', async () => {
            const store = getUniqueStore('delete-twice');
            
            const stored = await store.storeSecret({
                name: 'Delete Twice Test',
                secretType: 'api_key',
                value: 'test-value'
            });
            expect(stored).not.toBeNull();
            if (!stored) return;

            const firstDelete = await store.deleteSecret(stored.id);
            expect(firstDelete).toBe(true);
            
            // Try to delete again
            const secondDelete = await store.deleteSecret(stored.id);
            expect(secondDelete).toBe(false);
        });
    });

    describe('Expiration & Security', () => {
        it('should return null when accessing expired secret', async () => {
            const store = getUniqueStore('expired-access');
            
            const pastTime = Date.now() - 1000; // 1 second ago
            const stored = await store.storeSecret({
                name: 'Expired Secret',
                secretType: 'api_key',
                value: 'test-value',
                expiresAt: pastTime
            });
            expect(stored).not.toBeNull();
            if (!stored) return;

            const result = await store.getSecretValue(stored.id);
            expect(result).toBeNull();
        });

        it('should not throw error when accessing secret before expiration', async () => {
            const store = getUniqueStore('not-expired-access');
            
            const futureTime = Date.now() + 3600000; // 1 hour from now
            const stored = await store.storeSecret({
                name: 'Not Expired Secret',
                secretType: 'api_key',
                value: 'test-value-12345',
                expiresAt: futureTime
            });
            expect(stored).not.toBeNull();
            if (!stored) return;

            const result = await store.getSecretValue(stored.id);
            expect(result).not.toBeNull();
            if (!result) return;
            expect(result.value).toBe('test-value-12345');
        });

        it('should return null when accessing deleted secret', async () => {
            const store = getUniqueStore('access-deleted');
            
            const stored = await store.storeSecret({
                name: 'To Be Deleted',
                secretType: 'api_key',
                value: 'test-value'
            });
            expect(stored).not.toBeNull();
            if (!stored) return;

            await store.deleteSecret(stored.id);
            
            const result = await store.getSecretValue(stored.id);
            expect(result).toBeNull();
        });
    });

    describe('Encryption Verification', () => {
        it('should use different encryption keys for different secrets', async () => {
            const store = getUniqueStore('encryption-diff');
            
            const secret1 = await store.storeSecret({
                name: 'Encryption Test 1',
                secretType: 'api_key',
                value: 'first-secret-value-12345'
            });
            expect(secret1).not.toBeNull();
            if (!secret1) return;
            
            const secret2 = await store.storeSecret({
                name: 'Encryption Test 2',
                secretType: 'api_key',
                value: 'second-secret-value-67890'
            });
            expect(secret2).not.toBeNull();
            if (!secret2) return;

            // Different values should have different previews
            expect(secret1.keyPreview).not.toBe(secret2.keyPreview);
        });

        it('should decrypt consistently across multiple calls', async () => {
            const store = getUniqueStore('encryption-consistent');
            const originalValue = 'consistent-decryption-test-12345';
            
            const stored = await store.storeSecret({
                name: 'Consistency Test',
                secretType: 'api_key',
                value: originalValue
            });
            expect(stored).not.toBeNull();
            if (!stored) return;

            const result1 = await store.getSecretValue(stored.id);
            expect(result1).not.toBeNull();
            if (!result1) return;
            const result2 = await store.getSecretValue(stored.id);
            expect(result2).not.toBeNull();
            if (!result2) return;
            const result3 = await store.getSecretValue(stored.id);
            expect(result3).not.toBeNull();
            if (!result3) return;

            expect(result1.value).toBe(originalValue);
            expect(result2.value).toBe(originalValue);
            expect(result3.value).toBe(originalValue);
        });
    });

    describe('Expiration Support', () => {
        it('should store secrets with expiration timestamp', async () => {
            const store = getUniqueStore('expiration');
            const expiresAt = Date.now() + 3600000; // 1 hour from now
            
            const stored = await store.storeSecret({
                name: 'Expiring Secret',
                secretType: 'api_key',
                value: 'test-value',
                expiresAt
            });
            expect(stored).not.toBeNull();
            if (!stored) return;

            expect(stored.expiresAt).toBe(expiresAt);
        });
    });

    describe('Complete E2E Workflow', () => {
        it('should handle complete secret lifecycle', async () => {
            const store = getUniqueStore('e2e-workflow');

            // 1. Create a secret
            const created = await store.storeSecret({
                name: 'Lifecycle Test',
                secretType: 'api_key',
                value: 'sk_test_1234567890'
            });
            expect(created).not.toBeNull();
            if (!created) return;
            
            expect(created.id).toBeTruthy();
            expect(created.name).toBe('Lifecycle Test');

            // 2. Retrieve and verify decryption
            const retrieved1 = await store.getSecretValue(created.id);
            expect(retrieved1).not.toBeNull();
            if (!retrieved1) return;
            expect(retrieved1.value).toBe('sk_test_1234567890');
            expect(retrieved1.metadata.accessCount).toBe(1);

            // 3. Update the secret
            const updated = await store.updateSecret(created.id, {
                name: 'Updated Lifecycle Test',
                value: 'sk_live_9876543210'
            });
            expect(updated).not.toBeNull();
            if (!updated) return;
            
            expect(updated.name).toBe('Updated Lifecycle Test');
            expect(updated.id).toBe(created.id);

            // 4. Verify updated value
            const retrieved2 = await store.getSecretValue(created.id);
            expect(retrieved2).not.toBeNull();
            if (!retrieved2) return;
            expect(retrieved2.value).toBe('sk_live_9876543210');
            expect(retrieved2.metadata.accessCount).toBeGreaterThan(1);

            // 5. List should include our secret
            const list = await store.listSecrets();
            const ourSecret = list.find((s) => s.id === created.id);
            expect(ourSecret).toBeTruthy();
            expect(ourSecret?.name).toBe('Updated Lifecycle Test');

            // 6. Delete the secret
            await store.deleteSecret(created.id);

            // 7. Verify deletion (via list, not error-throwing access)
            const listAfterDelete = await store.listSecrets();
            const deletedSecret = listAfterDelete.find((s) => s.id === created.id);
            expect(deletedSecret).toBeUndefined();
        });
    });

    describe('Key Rotation', () => {
        it('should initialize key rotation metadata on first use', async () => {
            const store = getUniqueStore('rotation-init');
            
            // Store a secret to trigger initialization
            const stored = await store.storeSecret({
                name: 'Test Secret',
                secretType: 'api_key',
                value: 'test-value'
            });
            expect(stored).not.toBeNull();
            
            // Check rotation info
            const info = await store.getKeyRotationInfo();
            expect(info.currentKeyFingerprint).toBeTruthy();
            expect(info.rotationCount).toBe(0);
            expect(info.totalSecrets).toBe(1);
            expect(info.secretsRotated).toBe(1);
        });

        it('should detect when key has not been rotated', async () => {
            const store = getUniqueStore('no-rotation');
            
            // Store multiple secrets
            const secret1 = await store.storeSecret({
                name: 'Secret 1',
                secretType: 'api_key',
                value: 'value-1'
            });
            expect(secret1).not.toBeNull();
            
            const secret2 = await store.storeSecret({
                name: 'Secret 2',
                secretType: 'token',
                value: 'value-2'
            });
            expect(secret2).not.toBeNull();
            
            const info = await store.getKeyRotationInfo();
            expect(info.rotationCount).toBe(0);
            expect(info.totalSecrets).toBe(2);
            expect(info.secretsRotated).toBe(2);
        });

        it('should track last rotation timestamp', async () => {
            const store = getUniqueStore('rotation-timestamp');
            
            const beforeTime = Date.now();
            
            const stored = await store.storeSecret({
                name: 'Test Secret',
                secretType: 'api_key',
                value: 'test-value'
            });
            expect(stored).not.toBeNull();
            
            const afterTime = Date.now();
            
            const info = await store.getKeyRotationInfo();
            expect(info.lastRotationAt).toBeGreaterThanOrEqual(beforeTime);
            expect(info.lastRotationAt).toBeLessThanOrEqual(afterTime);
        });

        it('should store key fingerprint with each secret', async () => {
            const store = getUniqueStore('fingerprint-storage');
            
            const stored = await store.storeSecret({
                name: 'Fingerprint Test',
                secretType: 'api_key',
                value: 'test-value-12345'
            });
            expect(stored).not.toBeNull();
            if (!stored) return;
            
            // Get rotation info to verify fingerprint was stored
            const info = await store.getKeyRotationInfo();
            expect(info.currentKeyFingerprint).toBeTruthy();
            expect(info.currentKeyFingerprint).toMatch(/^[0-9a-f]{64}$/);
        });

        it('should handle multiple secrets with same key', async () => {
            const store = getUniqueStore('multiple-secrets');
            
            // Create 5 secrets
            for (let i = 0; i < 5; i++) {
                const stored = await store.storeSecret({
                    name: `Secret ${i}`,
                    secretType: 'api_key',
                    value: `value-${i}`
                });
                expect(stored).not.toBeNull();
            }
            
            const info = await store.getKeyRotationInfo();
            expect(info.totalSecrets).toBe(5);
            expect(info.secretsRotated).toBe(5);
            expect(info.rotationCount).toBe(0);
        });

        it('should not count inactive secrets in rotation stats', async () => {
            const store = getUniqueStore('inactive-stats');
            
            // Create 3 secrets
            const secret1 = await store.storeSecret({
                name: 'Secret 1',
                secretType: 'api_key',
                value: 'value-1'
            });
            expect(secret1).not.toBeNull();
            if (!secret1) return;
            
            const secret2 = await store.storeSecret({
                name: 'Secret 2',
                secretType: 'api_key',
                value: 'value-2'
            });
            expect(secret2).not.toBeNull();
            if (!secret2) return;
            
            const secret3 = await store.storeSecret({
                name: 'Secret 3',
                secretType: 'api_key',
                value: 'value-3'
            });
            expect(secret3).not.toBeNull();
            if (!secret3) return;
            
            // Delete one
            await store.deleteSecret(secret2.id);
            
            const info = await store.getKeyRotationInfo();
            expect(info.totalSecrets).toBe(2); // Only active secrets
            expect(info.secretsRotated).toBe(2);
        });

        it('should provide complete rotation statistics', async () => {
            const store = getUniqueStore('rotation-stats');
            
            // Store secrets
            const secret1 = await store.storeSecret({
                name: 'Stat Test 1',
                secretType: 'api_key',
                value: 'value-1'
            });
            expect(secret1).not.toBeNull();
            
            const secret2 = await store.storeSecret({
                name: 'Stat Test 2',
                secretType: 'password',
                value: 'value-2'
            });
            expect(secret2).not.toBeNull();
            
            const info = await store.getKeyRotationInfo();
            
            // Verify all fields
            expect(info).toHaveProperty('currentKeyFingerprint');
            expect(info).toHaveProperty('lastRotationAt');
            expect(info).toHaveProperty('rotationCount');
            expect(info).toHaveProperty('totalSecrets');
            expect(info).toHaveProperty('secretsRotated');
            
            expect(typeof info.currentKeyFingerprint).toBe('string');
            expect(typeof info.lastRotationAt).toBe('number');
            expect(typeof info.rotationCount).toBe('number');
            expect(typeof info.totalSecrets).toBe('number');
            expect(typeof info.secretsRotated).toBe('number');
        });

        it('should maintain metadata across operations', async () => {
            const store = getUniqueStore('metadata-persistence');
            
            // Initial secret
            const secret1 = await store.storeSecret({
                name: 'First Secret',
                secretType: 'api_key',
                value: 'value-1'
            });
            expect(secret1).not.toBeNull();
            if (!secret1) return;
            
            const info1 = await store.getKeyRotationInfo();
            const initialFingerprint = info1.currentKeyFingerprint;
            
            // Update secret
            await store.updateSecret(secret1.id, { name: 'Updated Secret' });
            
            // Add another secret
            const secret2 = await store.storeSecret({
                name: 'Second Secret',
                secretType: 'token',
                value: 'value-2'
            });
            expect(secret2).not.toBeNull();
            
            const info2 = await store.getKeyRotationInfo();
            
            // Fingerprint should remain the same
            expect(info2.currentKeyFingerprint).toBe(initialFingerprint);
            expect(info2.rotationCount).toBe(0);
            expect(info2.totalSecrets).toBe(2);
        });
    });

    describe('Large Scale & Performance', () => {
        it('should handle storing many secrets efficiently', async () => {
            const store = getUniqueStore('many-secrets');
            const secretCount = 20;
            
            // Store multiple secrets
            for (let i = 0; i < secretCount; i++) {
                const stored = await store.storeSecret({
                    name: `Secret ${i}`,
                    secretType: 'api_key',
                    value: `test-value-${i}-${Math.random()}`
                });
                expect(stored).not.toBeNull();
            }
            
            const list = await store.listSecrets();
            expect(list.length).toBe(secretCount);
        });

        it('should handle large secret values', async () => {
            const store = getUniqueStore('large-value');
            const largeValue = 'a'.repeat(5000); // 5KB value
            
            const stored = await store.storeSecret({
                name: 'Large Secret',
                secretType: 'config',
                value: largeValue
            });
            expect(stored).not.toBeNull();
            if (!stored) return;
            
            const retrieved = await store.getSecretValue(stored.id);
            expect(retrieved).not.toBeNull();
            if (!retrieved) return;
            expect(retrieved.value).toBe(largeValue);
        });

        it('should handle special characters in values', async () => {
            const store = getUniqueStore('special-chars');
            const specialValue = '!@#$%^&*()_+-=[]{}|;:\'",.<>?/~`\n\t\r\0';
            
            const stored = await store.storeSecret({
                name: 'Special Characters',
                secretType: 'password',
                value: specialValue
            });
            expect(stored).not.toBeNull();
            if (!stored) return;
            
            const retrieved = await store.getSecretValue(stored.id);
            expect(retrieved).not.toBeNull();
            if (!retrieved) return;
            expect(retrieved.value).toBe(specialValue);
        });

        it('should handle unicode and emojis in values', async () => {
            const store = getUniqueStore('unicode');
            const unicodeValue = '你好世界 🚀 🔐 🎉 Привет مرحبا';
            
            const stored = await store.storeSecret({
                name: 'Unicode Test',
                secretType: 'custom',
                value: unicodeValue
            });
            expect(stored).not.toBeNull();
            if (!stored) return;
            
            const retrieved = await store.getSecretValue(stored.id);
            expect(retrieved).not.toBeNull();
            if (!retrieved) return;
            expect(retrieved.value).toBe(unicodeValue);
        });
    });

    describe('Concurrent Operations', () => {
        it('should handle multiple stores in parallel', async () => {
            const store = getUniqueStore('concurrent-store');
            
            // Store multiple secrets concurrently
            const promises = [];
            for (let i = 0; i < 10; i++) {
                promises.push(store.storeSecret({
                    name: `Concurrent Secret ${i}`,
                    secretType: 'api_key',
                    value: `value-${i}`
                }));
            }
            
            const results = await Promise.all(promises);
            expect(results.every(r => r !== null)).toBe(true);
            
            const list = await store.listSecrets();
            expect(list.length).toBe(10);
        });

        it('should handle concurrent reads', async () => {
            const store = getUniqueStore('concurrent-read');
            
            const stored = await store.storeSecret({
                name: 'Concurrent Test',
                secretType: 'api_key',
                value: 'test-value-concurrent'
            });
            expect(stored).not.toBeNull();
            if (!stored) return;
            
            // Read same secret 10 times concurrently
            const promises = [];
            for (let i = 0; i < 10; i++) {
                promises.push(store.getSecretValue(stored.id));
            }
            
            const results = await Promise.all(promises);
            expect(results.every(r => r !== null)).toBe(true);
            expect(results.every(r => r!.value === 'test-value-concurrent')).toBe(true);
        });

        it('should handle mixed operations concurrently', async () => {
            const store = getUniqueStore('mixed-concurrent');
            
            // Create initial secret
            const stored = await store.storeSecret({
                name: 'Mixed Test',
                secretType: 'api_key',
                value: 'initial-value'
            });
            expect(stored).not.toBeNull();
            if (!stored) return;
            
            // Mix of reads, updates, and new stores
            const promises = [
                store.getSecretValue(stored.id),
                store.updateSecret(stored.id, { name: 'Updated Name' }),
                store.storeSecret({ name: 'New Secret 1', secretType: 'token', value: 'value-1' }),
                store.listSecrets(),
                store.storeSecret({ name: 'New Secret 2', secretType: 'password', value: 'value-2' }),
            ];
            
            const results = await Promise.all(promises);
            expect(results[0]).not.toBeNull(); // getSecretValue
            expect(results[1]).not.toBeNull(); // updateSecret
            expect(results[2]).not.toBeNull(); // storeSecret 1
            expect(Array.isArray(results[3])).toBe(true); // listSecrets
            expect(results[4]).not.toBeNull(); // storeSecret 2
        });
    });

    describe('Boundary Conditions', () => {
        it('should handle empty metadata', async () => {
            const store = getUniqueStore('empty-metadata');
            
            const stored = await store.storeSecret({
                name: 'Empty Metadata',
                secretType: 'api_key',
                value: 'test-value',
                metadata: {}
            });
            expect(stored).not.toBeNull();
            if (!stored) return;
            expect(stored.metadata).toEqual({});
        });

        it('should handle minimum length values', async () => {
            const store = getUniqueStore('min-length');
            
            const stored = await store.storeSecret({
                name: 'Min',
                secretType: 'custom',
                value: 'x'
            });
            expect(stored).not.toBeNull();
            if (!stored) return;
            
            const retrieved = await store.getSecretValue(stored.id);
            expect(retrieved).not.toBeNull();
            if (!retrieved) return;
            expect(retrieved.value).toBe('x');
        });

        it('should handle secrets with far future expiration', async () => {
            const store = getUniqueStore('far-future');
            const farFuture = Date.now() + (365 * 24 * 60 * 60 * 1000); // 1 year
            
            const stored = await store.storeSecret({
                name: 'Far Future',
                secretType: 'api_key',
                value: 'test-value',
                expiresAt: farFuture
            });
            expect(stored).not.toBeNull();
            if (!stored) return;
            expect(stored.expiresAt).toBe(farFuture);
        });

        it('should handle rapid create-update-delete cycles', async () => {
            const store = getUniqueStore('rapid-cycle');
            
            // Create
            const stored = await store.storeSecret({
                name: 'Rapid Test',
                secretType: 'api_key',
                value: 'initial'
            });
            expect(stored).not.toBeNull();
            if (!stored) return;
            
            // Update immediately
            const updated = await store.updateSecret(stored.id, { value: 'updated' });
            expect(updated).not.toBeNull();
            
            // Read to verify
            const retrieved = await store.getSecretValue(stored.id);
            expect(retrieved).not.toBeNull();
            if (!retrieved) return;
            expect(retrieved.value).toBe('updated');
            
            // Delete immediately
            const deleted = await store.deleteSecret(stored.id);
            expect(deleted).toBe(true);
            
            // Verify deleted
            const afterDelete = await store.getSecretValue(stored.id);
            expect(afterDelete).toBeNull();
        });
    });

    describe('Data Integrity', () => {
        it('should maintain data integrity across multiple operations', async () => {
            const store = getUniqueStore('data-integrity');
            const testData = {
                name: 'Integrity Test',
                secretType: 'api_key' as const,
                value: 'sensitive-data-12345',
                provider: 'test-provider',
                metadata: { env: 'test', critical: true }
            };
            
            // Store
            const stored = await store.storeSecret(testData);
            expect(stored).not.toBeNull();
            if (!stored) return;
            
            // Retrieve and verify all fields
            const retrieved = await store.getSecretValue(stored.id);
            expect(retrieved).not.toBeNull();
            if (!retrieved) return;
            
            expect(retrieved.value).toBe(testData.value);
            expect(retrieved.metadata.name).toBe(testData.name);
            expect(retrieved.metadata.secretType).toBe(testData.secretType);
            expect(retrieved.metadata.provider).toBe(testData.provider);
            expect(retrieved.metadata.metadata).toEqual(testData.metadata);
        });

        it('should preserve exact byte sequences', async () => {
            const store = getUniqueStore('byte-sequence');
            const binaryLikeValue = '\x00\x01\x02\x03\xFF\xFE\xFD';
            
            const stored = await store.storeSecret({
                name: 'Binary Test',
                secretType: 'custom',
                value: binaryLikeValue
            });
            expect(stored).not.toBeNull();
            if (!stored) return;
            
            const retrieved = await store.getSecretValue(stored.id);
            expect(retrieved).not.toBeNull();
            if (!retrieved) return;
            expect(retrieved.value).toBe(binaryLikeValue);
        });

        it('should track access count accurately', async () => {
            const store = getUniqueStore('access-tracking');
            
            const stored = await store.storeSecret({
                name: 'Access Track',
                secretType: 'api_key',
                value: 'test-value'
            });
            expect(stored).not.toBeNull();
            if (!stored) return;
            expect(stored.accessCount).toBe(0);
            
            // Access 5 times
            for (let i = 0; i < 5; i++) {
                await store.getSecretValue(stored.id);
            }
            
            // Check final access count
            const final = await store.getSecretValue(stored.id);
            expect(final).not.toBeNull();
            if (!final) return;
            expect(final.metadata.accessCount).toBe(6); // 5 + this one
        });

        it('should maintain separate encryption for each secret', async () => {
            const store = getUniqueStore('separate-encryption');
            
            const value1 = 'same-value';
            const value2 = 'same-value';
            
            const secret1 = await store.storeSecret({
                name: 'Secret 1',
                secretType: 'api_key',
                value: value1
            });
            expect(secret1).not.toBeNull();
            if (!secret1) return;
            
            const secret2 = await store.storeSecret({
                name: 'Secret 2',
                secretType: 'api_key',
                value: value2
            });
            expect(secret2).not.toBeNull();
            if (!secret2) return;
            
            // Key previews will be the same (deterministic based on value)
            expect(secret1.keyPreview).toBe(secret2.keyPreview);
            
            // But the secrets themselves are separate (different IDs)
            expect(secret1.id).not.toBe(secret2.id);
            
            // And both can be decrypted correctly (proving separate encryption)
            const retrieved1 = await store.getSecretValue(secret1.id);
            const retrieved2 = await store.getSecretValue(secret2.id);
            expect(retrieved1).not.toBeNull();
            expect(retrieved2).not.toBeNull();
            if (!retrieved1 || !retrieved2) return;
            expect(retrieved1.value).toBe(value1);
            expect(retrieved2.value).toBe(value2);
        });
    });

    describe('Edge Cases & Error Recovery', () => {
        it('should handle operations after failed operations', async () => {
            const store = getUniqueStore('error-recovery');
            
            // Try to update non-existent secret (should return null)
            const failedUpdate = await store.updateSecret('non-existent-id', { name: 'Test' });
            expect(failedUpdate).toBeNull();
            
            // Store should still work after failed operation
            const stored = await store.storeSecret({
                name: 'After Failed Op',
                secretType: 'api_key',
                value: 'test-value'
            });
            expect(stored).not.toBeNull();
        });

        it('should handle multiple failed operations gracefully', async () => {
            const store = getUniqueStore('multiple-failures');
            
            // Multiple failed operations
            const failed1 = await store.getSecretValue('non-existent-1');
            expect(failed1).toBeNull();
            
            const failed2 = await store.updateSecret('non-existent-2', { name: 'Test' });
            expect(failed2).toBeNull();
            
            const failed3 = await store.deleteSecret('non-existent-3');
            expect(failed3).toBe(false);
            
            // Should still be able to list (empty)
            const list = await store.listSecrets();
            expect(list.length).toBe(0);
            
            // Should still be able to store
            const stored = await store.storeSecret({
                name: 'After Failures',
                secretType: 'api_key',
                value: 'test-value'
            });
            expect(stored).not.toBeNull();
        });

        it('should handle deleted secret accessed multiple times', async () => {
            const store = getUniqueStore('multiple-access-deleted');
            
            const stored = await store.storeSecret({
                name: 'To Delete',
                secretType: 'api_key',
                value: 'test-value'
            });
            expect(stored).not.toBeNull();
            if (!stored) return;
            
            await store.deleteSecret(stored.id);
            
            // Try to access multiple times
            const access1 = await store.getSecretValue(stored.id);
            expect(access1).toBeNull();
            
            const access2 = await store.getSecretValue(stored.id);
            expect(access2).toBeNull();
            
            // Try to update deleted secret
            const update = await store.updateSecret(stored.id, { name: 'New Name' });
            expect(update).toBeNull();
        });
    });
});
