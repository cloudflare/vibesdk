/**
 * Unit tests for EncryptionService
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { EncryptionService } from '../../../../worker/services/secrets/EncryptionService';
import { KeyDerivation } from '../../../../worker/services/secrets/KeyDerivation';
import { CRYPTO_CONSTANTS } from '../../../../worker/services/secrets/constants';

describe('EncryptionService', () => {
    let encryptionService: EncryptionService;
    let keyDerivation: KeyDerivation;
    let userMasterKey: Uint8Array;

    const masterKey = 'a'.repeat(64); // 32-byte hex key
    const userId = 'test-user-123';

    beforeAll(async () => {
        keyDerivation = new KeyDerivation(masterKey);
        userMasterKey = await keyDerivation.deriveUserMasterKey(userId);
        encryptionService = new EncryptionService(userMasterKey, keyDerivation);
    });

    describe('encrypt', () => {
        it('should encrypt a secret value', async () => {
            const secretValue = 'my-secret-api-key-12345';

            const encrypted = await encryptionService.encrypt(secretValue);

            expect(encrypted.encryptedValue).toBeDefined();
            expect(encrypted.nonce).toBeDefined();
            expect(encrypted.salt).toBeDefined();
            expect(encrypted.keyPreview).toBeDefined();

            expect(encrypted.encryptedValue.length).toBeGreaterThan(0);
            expect(encrypted.nonce.length).toBe(CRYPTO_CONSTANTS.NONCE_SIZE);
            expect(encrypted.salt.length).toBe(CRYPTO_CONSTANTS.SALT_SIZE);
        });

        it('should produce different ciphertext for same plaintext', async () => {
            const secretValue = 'same-secret';

            const encrypted1 = await encryptionService.encrypt(secretValue);
            const encrypted2 = await encryptionService.encrypt(secretValue);

            // Different random salt and nonce should produce different ciphertext
            expect(encrypted1.encryptedValue).not.toEqual(encrypted2.encryptedValue);
            expect(encrypted1.nonce).not.toEqual(encrypted2.nonce);
            expect(encrypted1.salt).not.toEqual(encrypted2.salt);
        });

        it('should use unique salt for each encryption', async () => {
            const secretValue = 'test-secret';
            
            const results = await Promise.all([
                encryptionService.encrypt(secretValue),
                encryptionService.encrypt(secretValue),
                encryptionService.encrypt(secretValue)
            ]);

            // All salts should be unique
            expect(results[0].salt).not.toEqual(results[1].salt);
            expect(results[1].salt).not.toEqual(results[2].salt);
            expect(results[0].salt).not.toEqual(results[2].salt);
        });

        it('should not expose plaintext in encrypted data', async () => {
            const secretValue = 'super-secret-key';

            const encrypted = await encryptionService.encrypt(secretValue);

            // Convert to strings for search
            const encryptedStr = Buffer.from(encrypted.encryptedValue).toString('hex');
            const nonceStr = Buffer.from(encrypted.nonce).toString('hex');
            const saltStr = Buffer.from(encrypted.salt).toString('hex');

            expect(encryptedStr).not.toContain(secretValue);
            expect(nonceStr).not.toContain(secretValue);
            expect(saltStr).not.toContain(secretValue);
        });

        it('should create valid key preview', async () => {
            const secretValue = 'sk-1234567890abcdef';

            const encrypted = await encryptionService.encrypt(secretValue);

            expect(encrypted.keyPreview).toBeTruthy();
            expect(encrypted.keyPreview.length).toBeGreaterThan(0);
            expect(encrypted.keyPreview).not.toBe(secretValue);
            // Preview should be masked
            expect(encrypted.keyPreview).toContain('*');
        });
    });

    describe('decrypt', () => {
        it('should correctly decrypt encrypted data', async () => {
            const originalValue = 'my-api-key-xyz';

            const encrypted = await encryptionService.encrypt(originalValue);
            const decrypted = await encryptionService.decrypt(encrypted);

            expect(decrypted).toBe(originalValue);
        });

        it('should decrypt multiple times with same result', async () => {
            const originalValue = 'test-secret-123';

            const encrypted = await encryptionService.encrypt(originalValue);
            
            const decrypted1 = await encryptionService.decrypt(encrypted);
            const decrypted2 = await encryptionService.decrypt(encrypted);
            const decrypted3 = await encryptionService.decrypt(encrypted);

            expect(decrypted1).toBe(originalValue);
            expect(decrypted2).toBe(originalValue);
            expect(decrypted3).toBe(originalValue);
        });

        it('should handle empty string', async () => {
            const originalValue = '';

            const encrypted = await encryptionService.encrypt(originalValue);
            const decrypted = await encryptionService.decrypt(encrypted);

            expect(decrypted).toBe(originalValue);
        });

        it('should handle unicode characters', async () => {
            const originalValue = '你好世界 🔐 مفتاح';

            const encrypted = await encryptionService.encrypt(originalValue);
            const decrypted = await encryptionService.decrypt(encrypted);

            expect(decrypted).toBe(originalValue);
        });

        it('should handle long secrets', async () => {
            const originalValue = 'x'.repeat(10000); // 10KB

            const encrypted = await encryptionService.encrypt(originalValue);
            const decrypted = await encryptionService.decrypt(encrypted);

            expect(decrypted).toBe(originalValue);
            expect(decrypted.length).toBe(10000);
        });

        it('should fail with tampered ciphertext', async () => {
            const originalValue = 'secret-value';

            const encrypted = await encryptionService.encrypt(originalValue);
            
            // Tamper with ciphertext
            encrypted.encryptedValue[0] ^= 1;

            await expect(encryptionService.decrypt(encrypted)).rejects.toThrow();
        });

        it('should fail with wrong nonce', async () => {
            const originalValue = 'secret-value';

            const encrypted = await encryptionService.encrypt(originalValue);
            
            // Replace nonce with random one
            encrypted.nonce = crypto.getRandomValues(new Uint8Array(CRYPTO_CONSTANTS.NONCE_SIZE));

            await expect(encryptionService.decrypt(encrypted)).rejects.toThrow();
        });

        it('should fail with wrong salt', async () => {
            const originalValue = 'secret-value';

            const encrypted = await encryptionService.encrypt(originalValue);
            
            // Replace salt with random one
            encrypted.salt = crypto.getRandomValues(new Uint8Array(CRYPTO_CONSTANTS.SALT_SIZE));

            await expect(encryptionService.decrypt(encrypted)).rejects.toThrow();
        });
    });


    describe('security properties', () => {
        it('should use authenticated encryption (AEAD)', async () => {
            // XChaCha20-Poly1305 provides authentication
            // Verify by testing that tampering fails
            const encrypted = await encryptionService.encrypt('test');
            encrypted.encryptedValue[encrypted.encryptedValue.length - 1] ^= 1;
            
            await expect(encryptionService.decrypt(encrypted)).rejects.toThrow();
        });

        it('should use unique nonces', async () => {
            const results = await Promise.all(
                Array.from({ length: 100 }, (_) => 
                    encryptionService.encrypt('test')
                )
            );

            const nonces = results.map(r => Buffer.from(r.nonce).toString('hex'));
            const uniqueNonces = new Set(nonces);

            expect(uniqueNonces.size).toBe(100);
        });

        it('should derive unique keys per secret', async () => {
            // Different salts should result in different DEKs
            const secret1 = await encryptionService.encrypt('value');
            const secret2 = await encryptionService.encrypt('value');

            // Same plaintext encrypted with different keys should produce different ciphertext
            expect(secret1.encryptedValue).not.toEqual(secret2.encryptedValue);
        });
    });

    describe('end-to-end workflow', () => {
        it('should handle complete encrypt-decrypt cycle', async () => {
            const secrets = [
                { value: 'sk-1234567890' },
                { value: 'sk-ant-abcdef' },
                { value: 'ghp_token123' }
            ];

            // Encrypt all
            const encrypted = await Promise.all(
                secrets.map(s => encryptionService.encrypt(s.value))
            );

            // Decrypt all
            const decrypted = await Promise.all(
                encrypted.map(e => encryptionService.decrypt(e))
            );

            // Verify all match
            secrets.forEach((secret, i) => {
                expect(decrypted[i]).toBe(secret.value);
            });
        });

        it('should support secret rotation', async () => {
            const oldValue = 'old-api-key';
            const newValue = 'new-api-key';

            // Encrypt old value
            const oldEncrypted = await encryptionService.encrypt(oldValue);
            const decryptedOld = await encryptionService.decrypt(oldEncrypted);
            expect(decryptedOld).toBe(oldValue);

            // "Rotate" by encrypting new value
            const newEncrypted = await encryptionService.encrypt(newValue);
            const decryptedNew = await encryptionService.decrypt(newEncrypted);
            expect(decryptedNew).toBe(newValue);

            // Old and new are different
            expect(oldEncrypted.encryptedValue).not.toEqual(newEncrypted.encryptedValue);
        });
    });
});
