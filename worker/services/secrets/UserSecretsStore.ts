/**
 * UserSecretsStore - Rebuilt from scratch using proven MinimalSecretsStore pattern
 * 
 * Architecture:
 * - One DO per user (userId as DO ID)
 * - Hierarchical key derivation: MEK → UMK → DEK
 * - XChaCha20-Poly1305 encryption
 */

import { DurableObject } from 'cloudflare:workers';
import type { DurableObjectState } from '@cloudflare/workers-types';
import { KeyDerivation } from './KeyDerivation';
import { EncryptionService } from './EncryptionService';
import {
    type SecretMetadata,
    type StoreSecretRequest,
    type UpdateSecretRequest,
    type EncryptedSecretData,
    type SecretWithValue,
    type KeyRotationInfo
} from './types';
import { 
    STORAGE_LIMITS, 
    CLEANUP_INTERVALS
} from './constants';
import type { SqlStorageValue } from '@cloudflare/workers-types';

export class NotFoundError extends Error {
    constructor(message: string = 'Not found') {
        super(message);
        this.name = 'NotFoundError';
    }
}

export class ExpiredSecretError extends Error {
    constructor(message: string = 'Secret has expired') {
        super(message);
        this.name = 'ExpiredSecretError';
    }
}

export class UserSecretsStore extends DurableObject<Env> {
    private userId: string;
    private keyDerivation!: KeyDerivation;
    private encryption!: EncryptionService;
    
    constructor(ctx: DurableObjectState, env: Env) {
        super(ctx, env);
        
        this.userId = ctx.id.name ?? ctx.id.toString();
        
        // Use blockConcurrencyWhile for initialization
        ctx.blockConcurrencyWhile(async () => {
            await this.initialize();
        });
    }
    
    private async initialize(): Promise<void> {
        // 1. Initialize SQLite schema
        await this.initializeSchema();
        
        // 2. Initialize key derivation
        if (!this.env.SECRETS_ENCRYPTION_KEY) {
            throw new Error('SECRETS_ENCRYPTION_KEY environment variable not set');
        }
        this.keyDerivation = new KeyDerivation(this.env.SECRETS_ENCRYPTION_KEY);
        
        // 3. Derive User Master Key
        const userMasterKey = await this.keyDerivation.deriveUserMasterKey(this.userId);
        
        // 4. Initialize encryption service
        this.encryption = new EncryptionService(userMasterKey, this.keyDerivation);
        
        // 5. Check for key rotation and initialize metadata
        await this.initializeKeyRotationMetadata();
        
        // 6. Detect and handle key rotation if needed
        await this.detectAndHandleKeyRotation();
        
        // 7. Set alarm for cleanup
        const currentAlarm = await this.ctx.storage.getAlarm();
        if (currentAlarm === null) {
            await this.ctx.storage.setAlarm(Date.now() + CLEANUP_INTERVALS.EXPIRED_SECRETS_CHECK);
        }
    }
    
    private async initializeSchema(): Promise<void> {
        // Secrets table
        this.ctx.storage.sql.exec(`
            CREATE TABLE IF NOT EXISTS secrets (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                secret_type TEXT NOT NULL,
                provider TEXT,
                encrypted_value BLOB NOT NULL,
                nonce BLOB NOT NULL,
                salt BLOB NOT NULL,
                key_preview TEXT NOT NULL,
                metadata TEXT,
                expires_at INTEGER,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                last_accessed INTEGER,
                access_count INTEGER DEFAULT 0,
                is_active INTEGER DEFAULT 1,
                key_fingerprint TEXT NOT NULL
            )
        `);
        
        // Key rotation metadata table
        this.ctx.storage.sql.exec(`
            CREATE TABLE IF NOT EXISTS key_rotation_metadata (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                current_key_fingerprint TEXT NOT NULL,
                last_rotation_at INTEGER NOT NULL,
                rotation_count INTEGER DEFAULT 0,
                created_at INTEGER NOT NULL
            )
        `);
        
        // Create indexes for performance
        this.ctx.storage.sql.exec(`
            CREATE INDEX IF NOT EXISTS idx_secrets_active 
            ON secrets(is_active, created_at DESC)
        `);
        
        this.ctx.storage.sql.exec(`
            CREATE INDEX IF NOT EXISTS idx_secrets_expires 
            ON secrets(expires_at) 
            WHERE expires_at IS NOT NULL AND is_active = 1
        `);
    }
    
    async alarm(): Promise<void> {
        const now = Date.now();
        
        // Delete expired secrets
        await this.deleteExpiredSecrets(now);
        
        // Cleanup old soft-deleted secrets (90 days)
        await this.cleanupSoftDeleted(now);
        
        // Schedule next alarm
        await this.ctx.storage.setAlarm(Date.now() + CLEANUP_INTERVALS.EXPIRED_SECRETS_CHECK);
    }
    
    // ========== PUBLIC RPC METHODS ==========
    
    isReady(): boolean {
        return !!(this.encryption && this.keyDerivation);
    }
    
    async listSecrets(): Promise<SecretMetadata[]> {
        const result = this.ctx.storage.sql.exec(`
            SELECT 
                id, name, secret_type, provider, key_preview, metadata,
                expires_at, created_at, updated_at, last_accessed, 
                access_count, is_active
            FROM secrets 
            WHERE is_active = 1
            ORDER BY created_at DESC
        `);
        
        const rows = result.toArray();
        return rows.map(row => this.rowToMetadata(row as Record<string, SqlStorageValue>));
    }
    
    async storeSecret(request: StoreSecretRequest): Promise<SecretMetadata | null> {
        // Validate request - returns null on validation failure
        const validationError = this.validateSecretRequest(request);
        if (validationError) {
            return null;
        }
        
        // Encrypt
        const encrypted = await this.encryption.encrypt(request.value);
        const secretId = crypto.randomUUID();
        const now = Date.now();
        const keyFingerprint = await this.keyDerivation.getMasterKeyFingerprint();
        
        // Store
        this.ctx.storage.sql.exec(`
            INSERT INTO secrets (
                id, name, secret_type, provider, encrypted_value, nonce, salt, 
                key_preview, metadata, expires_at, created_at, updated_at, 
                access_count, is_active, key_fingerprint
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
            secretId,
            request.name,
            request.secretType,
            request.provider ?? null,
            encrypted.encryptedValue,
            encrypted.nonce,
            encrypted.salt,
            encrypted.keyPreview,
            request.metadata ? JSON.stringify(request.metadata) : null,
            request.expiresAt ?? null,
            now,
            now,
            0,
            1,
            keyFingerprint
        );
        
        return {
            id: secretId,
            name: request.name,
            secretType: request.secretType,
            provider: request.provider,
            keyPreview: encrypted.keyPreview,
            metadata: request.metadata,
            expiresAt: request.expiresAt,
            createdAt: now,
            updatedAt: now,
            accessCount: 0,
            isActive: true
        };
    }
    
    async getSecretValue(secretId: string): Promise<SecretWithValue | null> {
        const result = this.ctx.storage.sql.exec(`
            SELECT * FROM secrets WHERE id = ? AND is_active = 1
        `, secretId);
        
        const rows = result.toArray();
        if (rows.length === 0) {
            return null;
        }
        
        const row = rows[0] as Record<string, SqlStorageValue>;
        
        // Check expiration BEFORE decryption
        if (row.expires_at && Number(row.expires_at) < Date.now()) {
            return null;
        }
        
        // Get and decrypt data
        const encrypted = await this.getEncryptedData(row);
        const value = await this.encryption.decrypt(encrypted);
        
        // Update access tracking
        const now = Date.now();
        this.ctx.storage.sql.exec(`
            UPDATE secrets 
            SET last_accessed = ?, access_count = access_count + 1, updated_at = ?
            WHERE id = ?
        `, now, now, secretId);
        
        return {
            value,
            metadata: {
                ...this.rowToMetadata(row),
                accessCount: Number(row.access_count) + 1,
                lastAccessed: now,
                updatedAt: now
            }
        };
    }
    
    async updateSecret(secretId: string, request: UpdateSecretRequest): Promise<SecretMetadata | null> {
        // Check exists
        const result = this.ctx.storage.sql.exec(`
            SELECT * FROM secrets WHERE id = ? AND is_active = 1
        `, secretId);
        
        const rows = result.toArray();
        if (rows.length === 0) {
            return null;
        }
        
        const updateFields: string[] = [];
        const updateValues: unknown[] = [];
        
        if (request.name !== undefined) {
            if (!request.name?.trim() || request.name.length > STORAGE_LIMITS.MAX_SECRET_NAME_LENGTH) {
                return null; // Validation failed
            }
            updateFields.push('name = ?');
            updateValues.push(request.name);
        }
        
        if (request.value !== undefined) {
            if (!request.value || request.value.length > STORAGE_LIMITS.MAX_SECRET_VALUE_SIZE) {
                return null; // Validation failed
            }
            const encrypted = await this.encryption.encrypt(request.value);
            updateFields.push('encrypted_value = ?', 'nonce = ?', 'salt = ?', 'key_preview = ?');
            updateValues.push(encrypted.encryptedValue, encrypted.nonce, encrypted.salt, encrypted.keyPreview);
        }
        
        if (request.metadata !== undefined) {
            const metadataSize = JSON.stringify(request.metadata).length;
            if (metadataSize > STORAGE_LIMITS.MAX_METADATA_SIZE) {
                return null; // Validation failed
            }
            updateFields.push('metadata = ?');
            updateValues.push(JSON.stringify(request.metadata));
        }
        
        if (request.expiresAt !== undefined) {
            updateFields.push('expires_at = ?');
            updateValues.push(request.expiresAt);
        }
        
        if (updateFields.length === 0) {
            throw new Error('No fields to update');
        }
        
        const now = Date.now();
        updateFields.push('updated_at = ?');
        updateValues.push(now);
        updateValues.push(secretId);
        
        this.ctx.storage.sql.exec(`
            UPDATE secrets SET ${updateFields.join(', ')} WHERE id = ?
        `, ...updateValues);
        
        // Get updated secret
        const updated = this.ctx.storage.sql.exec(`
            SELECT * FROM secrets WHERE id = ?
        `, secretId);
        const updatedRow = updated.toArray()[0] as Record<string, SqlStorageValue>;
        
        return this.rowToMetadata(updatedRow);
    }
    
    async deleteSecret(secretId: string): Promise<boolean> {
        // Soft delete
        const result = this.ctx.storage.sql.exec(`
            UPDATE secrets SET is_active = 0, updated_at = ? 
            WHERE id = ? AND is_active = 1
            RETURNING id
        `, Date.now(), secretId);
        
        const rows = result.toArray();
        return rows.length > 0;
    }
    
    // ========== PRIVATE HELPERS ==========
    
    /**
     * Convert SQLite row to SecretMetadata (DRY helper)
     */
    private rowToMetadata(row: Record<string, SqlStorageValue>): SecretMetadata {
        return {
            id: String(row.id),
            name: String(row.name),
            secretType: String(row.secret_type) as StoreSecretRequest['secretType'],
            provider: row.provider ? String(row.provider) : undefined,
            keyPreview: String(row.key_preview),
            metadata: row.metadata ? JSON.parse(String(row.metadata)) : undefined,
            expiresAt: row.expires_at ? Number(row.expires_at) : undefined,
            createdAt: Number(row.created_at),
            updatedAt: Number(row.updated_at),
            lastAccessed: row.last_accessed ? Number(row.last_accessed) : undefined,
            accessCount: Number(row.access_count),
            isActive: Boolean(row.is_active)
        };
    }
    
    /**
     * Validate secret request - returns error message or null if valid
     */
    private validateSecretRequest(request: StoreSecretRequest): string | null {
        if (!request.name?.trim()) {
            return 'Secret name is required';
        }
        
        if (request.name.length > STORAGE_LIMITS.MAX_SECRET_NAME_LENGTH) {
            return `Name exceeds ${STORAGE_LIMITS.MAX_SECRET_NAME_LENGTH} characters`;
        }
        
        if (!request.value) {
            return 'Secret value is required';
        }
        
        if (request.value.length > STORAGE_LIMITS.MAX_SECRET_VALUE_SIZE) {
            return `Value exceeds ${STORAGE_LIMITS.MAX_SECRET_VALUE_SIZE} bytes`;
        }
        
        if (request.metadata) {
            const metadataSize = JSON.stringify(request.metadata).length;
            if (metadataSize > STORAGE_LIMITS.MAX_METADATA_SIZE) {
                return `Metadata exceeds ${STORAGE_LIMITS.MAX_METADATA_SIZE} bytes`;
            }
        }
        
        return null; // Valid
    }
    
    /**
     * Extract and validate encrypted data from row
     */
    private async getEncryptedData(row: Record<string, SqlStorageValue>): Promise<EncryptedSecretData> {
        const { encrypted_value, nonce, salt, key_preview } = row;
        
        if (!encrypted_value || !nonce || !salt || !key_preview) {
            throw new Error('Corrupted secret data: missing fields');
        }
        
        if (!(encrypted_value instanceof ArrayBuffer) || 
            !(nonce instanceof ArrayBuffer) || 
            !(salt instanceof ArrayBuffer)) {
            throw new Error('Corrupted secret data: invalid types');
        }
        
        return {
            encryptedValue: new Uint8Array(encrypted_value),
            nonce: new Uint8Array(nonce),
            salt: new Uint8Array(salt),
            keyPreview: String(key_preview)
        };
    }
    
    /**
     * Delete expired secrets (called by alarm)
     */
    private async deleteExpiredSecrets(now: number): Promise<void> {
        this.ctx.storage.transactionSync(() => {
            // Soft delete all expired secrets atomically
            this.ctx.storage.sql.exec(`
                UPDATE secrets 
                SET is_active = 0, updated_at = ? 
                WHERE expires_at IS NOT NULL AND expires_at < ? AND is_active = 1
            `, now, now);
        });
    }
    
    /**
     * Hard delete soft-deleted secrets older than 90 days
     */
    private async cleanupSoftDeleted(now: number): Promise<void> {
        const cutoff = now - (90 * 24 * 60 * 60 * 1000);
        
        this.ctx.storage.transactionSync(() => {
            this.ctx.storage.sql.exec(`
                DELETE FROM secrets 
                WHERE is_active = 0 AND updated_at < ?
            `, cutoff);
        });
    }
    
    /**
     * Initialize key rotation metadata on first use
     */
    private async initializeKeyRotationMetadata(): Promise<void> {
        const fingerprint = await this.keyDerivation.getMasterKeyFingerprint();
        const now = Date.now();
        
        this.ctx.storage.sql.exec(`
            INSERT OR IGNORE INTO key_rotation_metadata 
                (id, current_key_fingerprint, last_rotation_at, rotation_count, created_at)
            VALUES (1, ?, ?, 0, ?)
        `, fingerprint, now, now);
    }
    
    /**
     * Detect if master key has changed and handle rotation
     */
    private async detectAndHandleKeyRotation(): Promise<void> {
        const currentFingerprint = await this.keyDerivation.getMasterKeyFingerprint();
        
        const result = this.ctx.storage.sql.exec(`
            SELECT current_key_fingerprint FROM key_rotation_metadata WHERE id = 1
        `);
        
        const rows = result.toArray();
        if (rows.length === 0) {
            return; // Metadata not initialized yet
        }
        
        const storedFingerprint = String((rows[0] as Record<string, SqlStorageValue>).current_key_fingerprint);
        
        if (currentFingerprint !== storedFingerprint) {
            await this.performKeyRotation(currentFingerprint);
        }
    }
    
    /**
     * Re-encrypt all active secrets with new master key
     * Pre-computes all encrypted values, then applies SQL updates atomically
     */
    private async performKeyRotation(newKeyFingerprint: string): Promise<number> {
        const result = this.ctx.storage.sql.exec(`
            SELECT * FROM secrets WHERE is_active = 1
        `);
        
        const secrets = result.toArray();
        const now = Date.now();
        
        // Phase 1: Pre-compute all encrypted values (async operations)
        const reencryptedSecrets: Array<{
            id: string;
            encryptedValue: Uint8Array;
            nonce: Uint8Array;
            salt: Uint8Array;
        }> = [];
        
        for (const row of secrets) {
            const secretRow = row as Record<string, SqlStorageValue>;
            
            try {
                const encrypted = await this.getEncryptedData(secretRow);
                const plaintext = await this.encryption.decrypt(encrypted);
                const reencrypted = await this.encryption.encrypt(plaintext);
                
                reencryptedSecrets.push({
                    id: String(secretRow.id),
                    encryptedValue: reencrypted.encryptedValue,
                    nonce: reencrypted.nonce,
                    salt: reencrypted.salt
                });
            } catch (error) {
                console.error(`Failed to rotate secret ${String(secretRow.id)}:`, error);
            }
        }
        
        // Phase 2: Apply all SQL updates atomically in transaction
        const rotatedCount = this.ctx.storage.transactionSync(() => {
            let count = 0;
            
            for (const secret of reencryptedSecrets) {
                this.ctx.storage.sql.exec(`
                    UPDATE secrets 
                    SET encrypted_value = ?, nonce = ?, salt = ?, key_fingerprint = ?, updated_at = ?
                    WHERE id = ?
                `,
                    secret.encryptedValue,
                    secret.nonce,
                    secret.salt,
                    newKeyFingerprint,
                    now,
                    secret.id
                );
                count++;
            }
            
            this.ctx.storage.sql.exec(`
                UPDATE key_rotation_metadata 
                SET current_key_fingerprint = ?, 
                    last_rotation_at = ?, 
                    rotation_count = rotation_count + 1
                WHERE id = 1
            `, newKeyFingerprint, now);
            
            return count;
        });
        
        return rotatedCount;
    }
    
    /**
     * Get key rotation statistics
     */
    async getKeyRotationInfo(): Promise<KeyRotationInfo> {
        const metadataResult = this.ctx.storage.sql.exec(`
            SELECT * FROM key_rotation_metadata WHERE id = 1
        `);
        
        const metadataRows = metadataResult.toArray();
        if (metadataRows.length === 0) {
            throw new Error('Key rotation metadata not initialized');
        }
        
        const metadata = metadataRows[0] as Record<string, SqlStorageValue>;
        const currentFingerprint = await this.keyDerivation.getMasterKeyFingerprint();
        
        // Count total active secrets
        const totalResult = this.ctx.storage.sql.exec(`
            SELECT COUNT(*) as count FROM secrets WHERE is_active = 1
        `);
        const totalSecrets = Number((totalResult.toArray()[0] as Record<string, SqlStorageValue>).count);
        
        // Count secrets with current key fingerprint
        const rotatedResult = this.ctx.storage.sql.exec(`
            SELECT COUNT(*) as count FROM secrets WHERE is_active = 1 AND key_fingerprint = ?
        `, currentFingerprint);
        const secretsRotated = Number((rotatedResult.toArray()[0] as Record<string, SqlStorageValue>).count);
        
        return {
            currentKeyFingerprint: String(metadata.current_key_fingerprint),
            lastRotationAt: Number(metadata.last_rotation_at),
            rotationCount: Number(metadata.rotation_count),
            totalSecrets,
            secretsRotated
        };
    }
}
