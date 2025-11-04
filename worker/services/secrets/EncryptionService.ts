/**
 * Encryption Service
 * Implements XChaCha20-Poly1305 AEAD encryption for secrets
 * 
 * Security features:
 * - Authenticated encryption (integrity + confidentiality)
 * - Unique key per secret (via random salt → DEK)
 * - Random nonces (no reuse)
 * - Constant-time operations
 */

import { xchacha20poly1305 } from '@noble/ciphers/chacha';
import { KeyDerivation } from './KeyDerivation';
import { CRYPTO_CONSTANTS } from './constants';
import type { EncryptedSecretData } from './types';

export class EncryptionService {
    private userMasterKey: Uint8Array;
    private keyDerivation: KeyDerivation;

    constructor(userMasterKey: Uint8Array, keyDerivation: KeyDerivation) {
        if (!userMasterKey || userMasterKey.length !== CRYPTO_CONSTANTS.KEY_SIZE) {
            throw new Error(`Invalid user master key: expected ${CRYPTO_CONSTANTS.KEY_SIZE} bytes`);
        }
        this.userMasterKey = userMasterKey;
        this.keyDerivation = keyDerivation;
    }

    /**
     * Encrypt a secret value using XChaCha20-Poly1305
     * Returns encrypted data with nonce and salt for decryption
     */
    async encrypt(value: string): Promise<EncryptedSecretData> {
        // Generate random salt and derive DEK
        const salt = crypto.getRandomValues(new Uint8Array(CRYPTO_CONSTANTS.SALT_SIZE));
        const dek = await this.keyDerivation.deriveDataEncryptionKey(this.userMasterKey, salt);
        
        // Encrypt with XChaCha20-Poly1305
        const nonce = crypto.getRandomValues(new Uint8Array(CRYPTO_CONSTANTS.NONCE_SIZE));
        const cipher = xchacha20poly1305(dek, nonce);
        const plaintext = new TextEncoder().encode(value);
        const ciphertext = cipher.encrypt(plaintext);
        
        const keyPreview = this.createKeyPreview(value);
        
        // Zero out DEK from memory (security best practice)
        dek.fill(0);
        
        return {
            encryptedValue: ciphertext,
            nonce,
            salt,
            keyPreview
        };
    }

    /**
     * Decrypt a secret value using XChaCha20-Poly1305
     * Verifies integrity via authentication tag
     */
    async decrypt(encrypted: EncryptedSecretData): Promise<string> {
        try {
            // Derive same DEK from stored salt
            const dek = await this.keyDerivation.deriveDataEncryptionKey(
                this.userMasterKey, 
                encrypted.salt
            );
            
            // Decrypt (throws if authentication tag doesn't match)
            const cipher = xchacha20poly1305(dek, encrypted.nonce);
            const plaintext = cipher.decrypt(encrypted.encryptedValue);
            
            // Zero out DEK from memory (security best practice)
            dek.fill(0);
            
            return new TextDecoder().decode(plaintext);
        } catch (error) {
            throw new Error('Failed to decrypt secret: invalid data or tampering detected');
        }
    }

    /**
     * Create a preview of the secret value for display
     * Format: "abcd****efgh" for values > 8 chars
     */
    private createKeyPreview(value: string): string {
        if (value.length <= 8) {
            return '*'.repeat(value.length);
        }
        
        const start = value.slice(0, 4);
        const end = value.slice(-4);
        const middleLength = Math.max(0, value.length - 8);
        
        return `${start}${'*'.repeat(middleLength)}${end}`;
    }
}
