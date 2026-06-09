/**
 * Vault Types - Session-bound vault architecture
 */

export type KdfAlgorithm = 'argon2id' | 'webauthn-prf';

export type SecretType = 'secret';

/** Standardized metadata for secrets (stored as plaintext JSON) */
export interface SecretMetadata {
	provider?: string; // e.g., "openai", "anthropic", "google"
	envVarName?: string; // e.g., "OPENAI_API_KEY"
	[key: string]: unknown; // Allow extensibility
}

export interface VaultConfig {
	kdfAlgorithm: KdfAlgorithm;
	kdfSalt: Uint8Array<ArrayBuffer>;
	kdfParams?: Argon2Params;
	prfCredentialId?: string;
	prfSalt?: Uint8Array<ArrayBuffer>;
	verificationBlob: Uint8Array<ArrayBuffer>;
	verificationNonce: Uint8Array<ArrayBuffer>;
	hasRecoveryCodes: boolean;
}

export interface Argon2Params {
	time: number;
	mem: number;
	parallelism: number;
}

export interface VaultStatusResponse {
	exists: boolean;
	kdfAlgorithm?: KdfAlgorithm;
	hasRecoveryCodes?: boolean;
}

/** API response type - binary fields are base64-encoded strings */
export interface VaultConfigResponse {
	kdfAlgorithm: KdfAlgorithm;
	kdfSalt: string;
	kdfParams?: Argon2Params;
	prfCredentialId?: string;
	prfSalt?: string;
	verificationBlob: string;
	verificationNonce: string;
	hasRecoveryCodes: boolean;
}

export interface SetupVaultRequest {
	kdfAlgorithm: KdfAlgorithm;
	kdfSalt: ArrayBuffer;
	kdfParams?: Argon2Params;
	prfCredentialId?: string;
	prfSalt?: ArrayBuffer;
	encryptedRecoveryCodes?: ArrayBuffer;
	recoveryCodesNonce?: ArrayBuffer;
	verificationBlob: ArrayBuffer;
	verificationNonce: ArrayBuffer;
}

export interface StoreSecretRequest {
	encryptedValue: ArrayBuffer;
	valueNonce: ArrayBuffer;
	encryptedName: ArrayBuffer;
	nameNonce: ArrayBuffer;
	metadata?: SecretMetadata; // Plaintext metadata
	secretType: SecretType;
}

export interface EncryptedSecret {
	id: string;
	encryptedValue: Uint8Array<ArrayBuffer>;
	valueNonce: Uint8Array<ArrayBuffer>;
	encryptedName: Uint8Array<ArrayBuffer>;
	nameNonce: Uint8Array<ArrayBuffer>;
	metadata?: SecretMetadata; // Plaintext metadata
	secretType: SecretType;
	createdAt: number;
	updatedAt: number;
}

export interface SecretListItem {
	id: string;
	encryptedName: Uint8Array<ArrayBuffer>;
	nameNonce: Uint8Array<ArrayBuffer>;
	metadata?: SecretMetadata; // Plaintext metadata
	secretType: SecretType;
	createdAt: number;
	updatedAt: number;
}

// Session timeout (30 minutes)
export const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

// Cleanup interval (1 hour)
export const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

// Storage limits
export const STORAGE_LIMITS = {
	MAX_SECRET_VALUE_SIZE: 50 * 1024,    // 50 KB
	MAX_SECRET_NAME_LENGTH: 200,
	MAX_METADATA_SIZE: 10 * 1024,        // 10 KB
} as const;
