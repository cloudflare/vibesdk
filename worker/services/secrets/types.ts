/**
 * User Secrets Store - Type Definitions
 * Type-safe interfaces for the DO-backed secrets system
 */

export interface SecretMetadata {
    id: string;
    name: string;
    secretType: string;
    provider?: string;
    keyPreview: string;
    metadata?: Record<string, unknown>;
    expiresAt?: number;
    createdAt: number;
    updatedAt: number;
    lastAccessed?: number;
    accessCount: number;
    isActive: boolean;
}

export interface EncryptedSecretData {
    encryptedValue: Uint8Array;
    nonce: Uint8Array;  // 24 bytes for XChaCha20
    salt: Uint8Array;   // 16 bytes for key derivation
    keyPreview: string;
}

export interface StoreSecretRequest {
    name: string;
    secretType: 'api_key' | 'token' | 'password' | 'config' | 'custom';
    value: string;
    provider?: string;
    metadata?: Record<string, unknown>;
    expiresAt?: number;
}

export interface UpdateSecretRequest {
    name?: string;
    value?: string;
    metadata?: Record<string, unknown>;
    expiresAt?: number;
}

export interface SecretWithValue {
    value: string;
    metadata: SecretMetadata;
}

export interface KeyRotationInfo {
    currentKeyFingerprint: string;
    lastRotationAt: number;
    rotationCount: number;
    totalSecrets: number;
    secretsRotated: number;
}
