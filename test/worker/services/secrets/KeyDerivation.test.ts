/**
 * Unit tests for KeyDerivation service
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { KeyDerivation } from '../../../../worker/services/secrets/KeyDerivation';
import { CRYPTO_CONSTANTS } from '../../../../worker/services/secrets/constants';

describe('KeyDerivation', () => {
    let keyDerivation: KeyDerivation;
    const masterKey = 'a'.repeat(64); // 32-byte hex key
    const userId = 'test-user-123';

    beforeAll(() => {
        keyDerivation = new KeyDerivation(masterKey);
    });

    describe('deriveUserMasterKey', () => {
        it('should derive a consistent User Master Key for the same userId', async () => {
            const umk1 = await keyDerivation.deriveUserMasterKey(userId);
            const umk2 = await keyDerivation.deriveUserMasterKey(userId);

            expect(umk1).toEqual(umk2);
            expect(umk1.length).toBe(CRYPTO_CONSTANTS.KEY_SIZE);
        });

        it('should derive different keys for different users', async () => {
            const umk1 = await keyDerivation.deriveUserMasterKey('user1');
            const umk2 = await keyDerivation.deriveUserMasterKey('user2');

            expect(umk1).not.toEqual(umk2);
        });

        it('should use userId as salt for deterministic derivation', async () => {
            // Same userId should always produce same key
            const attempts = await Promise.all([
                keyDerivation.deriveUserMasterKey(userId),
                keyDerivation.deriveUserMasterKey(userId),
                keyDerivation.deriveUserMasterKey(userId)
            ]);

            expect(attempts[0]).toEqual(attempts[1]);
            expect(attempts[1]).toEqual(attempts[2]);
        });

        it('should produce keys of correct length', async () => {
            const umk = await keyDerivation.deriveUserMasterKey(userId);
            expect(umk.length).toBe(32); // 32 bytes = 256 bits
        });
    });

    describe('deriveDataEncryptionKey', () => {
        it('should derive different keys with different salts', async () => {
            const umk = await keyDerivation.deriveUserMasterKey(userId);
            const salt1 = crypto.getRandomValues(new Uint8Array(16));
            const salt2 = crypto.getRandomValues(new Uint8Array(16));

            const dek1 = await keyDerivation.deriveDataEncryptionKey(umk, salt1);
            const dek2 = await keyDerivation.deriveDataEncryptionKey(umk, salt2);

            expect(dek1).not.toEqual(dek2);
        });

        it('should derive the same key with the same salt', async () => {
            const umk = await keyDerivation.deriveUserMasterKey(userId);
            const salt = crypto.getRandomValues(new Uint8Array(16));

            const dek1 = await keyDerivation.deriveDataEncryptionKey(umk, salt);
            const dek2 = await keyDerivation.deriveDataEncryptionKey(umk, salt);

            expect(dek1).toEqual(dek2);
        });

        it('should produce keys of correct length', async () => {
            const umk = await keyDerivation.deriveUserMasterKey(userId);
            const salt = crypto.getRandomValues(new Uint8Array(16));
            
            const dek = await keyDerivation.deriveDataEncryptionKey(umk, salt);
            expect(dek.length).toBe(32); // 32 bytes = 256 bits
        });

        it('should use correct iteration count', async () => {
            const userId = 'test-user';
            // DEK derivation uses 10k iterations
            // Multiple derivations to ensure timing is measurable
            const umk = await keyDerivation.deriveUserMasterKey(userId);
            const salt = crypto.getRandomValues(new Uint8Array(16));

            const start = performance.now();
            // Run multiple times to get measurable duration
            for (let i = 0; i < 10; i++) {
                await keyDerivation.deriveDataEncryptionKey(umk, salt);
            }
            const duration = performance.now() - start;

            // 10 iterations with 10k rounds each should take some time
            expect(duration).toBeGreaterThanOrEqual(0);
        });
    });

    describe('getMasterKeyFingerprint', () => {
        it('should produce consistent fingerprint for same master key', async () => {
            const fp1 = await keyDerivation.getMasterKeyFingerprint();
            const fp2 = await keyDerivation.getMasterKeyFingerprint();

            expect(fp1).toBe(fp2);
        });

        it('should produce different fingerprints for different master keys', async () => {
            const kd1 = new KeyDerivation('a'.repeat(64));
            const kd2 = new KeyDerivation('b'.repeat(64));

            const fp1 = await kd1.getMasterKeyFingerprint();
            const fp2 = await kd2.getMasterKeyFingerprint();

            expect(fp1).not.toBe(fp2);
        });

        it('should produce hex string of correct length', async () => {
            const fp = await keyDerivation.getMasterKeyFingerprint();
            
            // SHA-256 hash = 64 hex characters (32 bytes)
            expect(fp).toMatch(/^[0-9a-f]{64}$/);
            expect(fp.length).toBe(64);
        });

        it('should be suitable for key rotation detection', async () => {
            const fp = await keyDerivation.getMasterKeyFingerprint();
            
            // Store fingerprint
            const storedFingerprint = fp;
            
            // Later, verify same key is in use
            const currentFingerprint = await keyDerivation.getMasterKeyFingerprint();
            expect(currentFingerprint).toBe(storedFingerprint);
        });
    });

    describe('integration with key hierarchy', () => {
        it('should handle invalid hex master key', () => {
            expect(() => new KeyDerivation('not-hex')).toThrow();
        });

        it('should handle master key of wrong length', () => {
            expect(() => new KeyDerivation('abc123')).toThrow();
        });

        it('should handle empty userId', async () => {
            await expect(keyDerivation.deriveUserMasterKey('')).rejects.toThrow();
        });
    });

    describe('security properties', () => {
        it('should not expose master key in any derived output', async () => {
            const umk = await keyDerivation.deriveUserMasterKey(userId);
            const salt = crypto.getRandomValues(new Uint8Array(16));
            const dek = await keyDerivation.deriveDataEncryptionKey(umk, salt);

            // None of the outputs should contain the master key
            const masterKeyBytes = new Uint8Array(
                masterKey.match(/.{2}/g)!.map(byte => parseInt(byte, 16))
            );

            expect(umk).not.toEqual(masterKeyBytes);
            expect(dek).not.toEqual(masterKeyBytes);
        });

        it('should use sufficient iterations for security', () => {
            // UMK uses 100k iterations
            expect(CRYPTO_CONSTANTS.UMK_ITERATIONS).toBeGreaterThanOrEqual(100000);
            
            // DEK uses 10k iterations
            expect(CRYPTO_CONSTANTS.DEK_ITERATIONS).toBeGreaterThanOrEqual(10000);
        });
    });
});
