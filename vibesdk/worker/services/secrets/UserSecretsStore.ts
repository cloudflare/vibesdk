/**
 * UserSecretsStore - Session-bound vault architecture
 *
 * Security Model:
 * - VMK (Vault Master Key): Derived client-side, never stored on server
 * - SK (Session Key): Random per-session, sent via WebSocket
 * - encryptedVMK: AES-GCM(SK, VMK), stored in DO memory only
 *
 * Single session design - one active vault session per user at a time.
 * DB dump = useless encrypted blobs. Server memory = needs client SK.
 */

import { DurableObject } from 'cloudflare:workers';
import type { DurableObjectState, SqlStorageValue } from '@cloudflare/workers-types';
import {
	type VaultConfig,
	type VaultStatusResponse,
	type SetupVaultRequest,
	type StoreSecretRequest,
	type EncryptedSecret,
	type SecretListItem,
	type SecretMetadata,
	SESSION_TIMEOUT_MS,
	CLEANUP_INTERVAL_MS,
	STORAGE_LIMITS,
} from './vault-types';
import { PendingWsTicket, TicketConsumptionResult } from '../../types/auth-types';
import { WsTicketManager } from '../../utils/wsTicketManager';

interface VaultSession {
	encryptedVMK: ArrayBuffer;
	nonce: ArrayBuffer;
	sk: Uint8Array;
	createdAt: number;
	lastAccessedAt: number;
}

export class UserSecretsStore extends DurableObject<Env> {
	private session: VaultSession | null = null;
	
	/** Ticket manager for WebSocket authentication */
	private ticketManager = new WsTicketManager();

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		ctx.blockConcurrencyWhile(async () => {
			await this.initializeSchema();
			await this.scheduleCleanup();
		});
	}

	async fetch(request: Request): Promise<Response> {
		if (request.headers.get('Upgrade') !== 'websocket') {
			return new Response('Expected WebSocket', { status: 426 });
		}

		const pair = new WebSocketPair();
		this.ctx.acceptWebSocket(pair[1]);
		return new Response(null, { status: 101, webSocket: pair[0] });
	}

	async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
		try {
			const data = JSON.parse(message as string);
			switch (data.type) {
				case 'vault_session_init':
					this.handleSessionInit(ws, data);
					break;
				case 'vault_session_close':
					this.handleSessionClose(ws);
					break;
				case 'vault_store_secret':
					this.handleStoreSecret(ws, data);
					break;
				case 'vault_list_secrets':
					this.handleListSecrets(ws, data);
					break;
				case 'vault_get_secret':
					this.handleGetSecret(ws, data);
					break;
				case 'vault_delete_secret':
					this.handleDeleteSecret(ws, data);
					break;
				case 'vault_update_secret':
					this.handleUpdateSecret(ws, data);
					break;
				default:
					this.sendWs(ws, { type: 'vault_ws_error', error: 'Unknown message type' });
			}
		} catch {
			this.sendWs(ws, { type: 'vault_ws_error', error: 'Invalid message' });
		}
	}

	async webSocketClose(_ws: WebSocket): Promise<void> {
		this.clearSession();
	}

	async webSocketError(ws: WebSocket): Promise<void> {
		this.clearSession();
		ws.close(1011, 'WebSocket error');
	}

	private handleSessionInit(
		ws: WebSocket,
		data: { encryptedVMK: string; nonce: string; sessionKey: string }
	): void {
		this.clearSession();

		const now = Date.now();
		this.session = {
			encryptedVMK: this.base64ToArrayBuffer(data.encryptedVMK),
			nonce: this.base64ToArrayBuffer(data.nonce),
			sk: this.base64ToUint8Array(data.sessionKey),
			createdAt: now,
			lastAccessedAt: now,
		};

		this.sendWs(ws, { type: 'vault_session_ready' });
	}

	private handleSessionClose(ws: WebSocket): void {
		this.clearSession();
		this.sendWs(ws, { type: 'vault_session_closed' });
	}

	// ========== WEBSOCKET CRUD HANDLERS ==========

	private handleStoreSecret(
		ws: WebSocket,
		data: {
			requestId: string;
			name: string;
			encryptedValue: string;
			secretType: 'secret';
			encryptedNameForStorage: string;
			metadata?: SecretMetadata; // Plaintext metadata
		}
	): void {
		// Validate session
		const sessionCheck = this.validateAndRefreshSession();
		if (!sessionCheck.valid) {
			this.sendWs(ws, {
				type: 'vault_secret_stored',
				requestId: data.requestId,
				success: false,
				error: sessionCheck.error,
				errorType: sessionCheck.errorType,
			});
			return;
		}

		try {
			// Parse encrypted data from base64
			const encryptedValueParts = this.parseEncryptedData(data.encryptedValue);
			const encryptedNameParts = this.parseEncryptedData(data.encryptedNameForStorage);

			// Validate storage limits
			const limitError = this.validateStorageLimits(
				encryptedValueParts.ciphertext,
				encryptedNameParts.ciphertext
			);
			if (limitError) {
				this.sendWs(ws, {
					type: 'vault_secret_stored',
					requestId: data.requestId,
					success: false,
					error: limitError,
					errorType: 'validation_error',
				});
				return;
			}

			const secretId = this.storeSecret({
				encryptedValue: encryptedValueParts.ciphertext,
				valueNonce: encryptedValueParts.nonce,
				encryptedName: encryptedNameParts.ciphertext,
				nameNonce: encryptedNameParts.nonce,
				secretType: data.secretType,
				metadata: data.metadata,
			});

			this.sendWs(ws, {
				type: 'vault_secret_stored',
				requestId: data.requestId,
				success: true,
				secretId,
			});
		} catch (error) {
			console.error('Vault store secret failed', {
				error: error instanceof Error ? error.message : String(error),
			});
			this.sendWs(ws, {
				type: 'vault_secret_stored',
				requestId: data.requestId,
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error',
			});
		}
	}

	private handleListSecrets(ws: WebSocket, data: { requestId: string }): void {
		// Validate session
		const sessionCheck = this.validateAndRefreshSession();
		if (!sessionCheck.valid) {
			this.sendWs(ws, {
				type: 'vault_secrets_list',
				requestId: data.requestId,
				secrets: [],
				error: sessionCheck.error,
				errorType: sessionCheck.errorType,
			});
			return;
		}

		try {
			const secrets = this.listSecrets();

			// Convert to response format with base64 encoded names and plaintext metadata
			const responseSecrets = secrets.map((s) => ({
				id: s.id,
				encryptedName: this.uint8ArrayToBase64(s.encryptedName) + ':' + this.uint8ArrayToBase64(s.nameNonce),
				metadata: s.metadata,
				secretType: s.secretType,
				createdAt: new Date(s.createdAt).toISOString(),
				updatedAt: new Date(s.updatedAt).toISOString(),
			}));

			this.sendWs(ws, {
				type: 'vault_secrets_list',
				requestId: data.requestId,
				secrets: responseSecrets,
			});
		} catch {
			this.sendWs(ws, {
				type: 'vault_secrets_list',
				requestId: data.requestId,
				secrets: [],
			});
		}
	}

	private handleGetSecret(ws: WebSocket, data: { requestId: string; secretId: string }): void {
		// Validate session
		const sessionCheck = this.validateAndRefreshSession();
		if (!sessionCheck.valid) {
			this.sendWs(ws, {
				type: 'vault_secret_value',
				requestId: data.requestId,
				success: false,
				error: sessionCheck.error,
				errorType: sessionCheck.errorType,
			});
			return;
		}

		try {
			const secret = this.getSecret(data.secretId);

			if (!secret) {
				this.sendWs(ws, {
					type: 'vault_secret_value',
					requestId: data.requestId,
					success: false,
					error: 'Secret not found',
				});
				return;
			}

			// Return encrypted value (client decrypts with VMK) and plaintext metadata
			const encryptedValue =
				this.uint8ArrayToBase64(secret.encryptedValue) +
				':' +
				this.uint8ArrayToBase64(secret.valueNonce);

			this.sendWs(ws, {
				type: 'vault_secret_value',
				requestId: data.requestId,
				success: true,
				encryptedValue,
				metadata: secret.metadata,
			});
		} catch (error) {
			this.sendWs(ws, {
				type: 'vault_secret_value',
				requestId: data.requestId,
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error',
			});
		}
	}

	private handleDeleteSecret(ws: WebSocket, data: { requestId: string; secretId: string }): void {
		// Validate session
		const sessionCheck = this.validateAndRefreshSession();
		if (!sessionCheck.valid) {
			this.sendWs(ws, {
				type: 'vault_secret_deleted',
				requestId: data.requestId,
				success: false,
				error: sessionCheck.error,
				errorType: sessionCheck.errorType,
			});
			return;
		}

		try {
			const success = this.deleteSecret(data.secretId);

			this.sendWs(ws, {
				type: 'vault_secret_deleted',
				requestId: data.requestId,
				success,
				error: success ? undefined : 'Secret not found',
			});
		} catch (error) {
			this.sendWs(ws, {
				type: 'vault_secret_deleted',
				requestId: data.requestId,
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error',
			});
		}
	}

	private handleUpdateSecret(
		ws: WebSocket,
		data: {
			requestId: string;
			secretId: string;
			encryptedValue?: string;
			encryptedName?: string;
			metadata?: SecretMetadata;
		}
	): void {
		// Validate session
		const sessionCheck = this.validateAndRefreshSession();
		if (!sessionCheck.valid) {
			this.sendWs(ws, {
				type: 'vault_secret_updated',
				requestId: data.requestId,
				success: false,
				error: sessionCheck.error,
				errorType: sessionCheck.errorType,
			});
			return;
		}

		try {
			const update: {
				encryptedValue?: ArrayBuffer;
				valueNonce?: ArrayBuffer;
				encryptedName?: ArrayBuffer;
				nameNonce?: ArrayBuffer;
				metadata?: SecretMetadata;
			} = {};

			if (data.encryptedValue) {
				const parts = this.parseEncryptedData(data.encryptedValue);
				update.encryptedValue = parts.ciphertext;
				update.valueNonce = parts.nonce;
			}

			if (data.encryptedName) {
				const parts = this.parseEncryptedData(data.encryptedName);
				update.encryptedName = parts.ciphertext;
				update.nameNonce = parts.nonce;
			}

			if (data.metadata !== undefined) {
				update.metadata = data.metadata;
			}

			// Validate storage limits
			const limitError = this.validateStorageLimits(update.encryptedValue, update.encryptedName);
			if (limitError) {
				this.sendWs(ws, {
					type: 'vault_secret_updated',
					requestId: data.requestId,
					success: false,
					error: limitError,
					errorType: 'validation_error',
				});
				return;
			}

			const success = this.updateSecret(data.secretId, update);

			this.sendWs(ws, {
				type: 'vault_secret_updated',
				requestId: data.requestId,
				success,
				error: success ? undefined : 'Secret not found or update failed',
			});
		} catch (error) {
			this.sendWs(ws, {
				type: 'vault_secret_updated',
				requestId: data.requestId,
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error',
			});
		}
	}

	// ========== SESSION AND VALIDATION HELPERS ==========

	/**
	 * Validates session exists and is not expired.
	 * Returns error response if invalid, or updates lastAccessedAt and returns valid.
	 */
	private validateAndRefreshSession():
		| { valid: true }
		| { valid: false; error: string; errorType: 'vault_locked' | 'session_expired' } {
		if (!this.session) {
			return { valid: false, error: 'Vault is locked', errorType: 'vault_locked' };
		}
		if (Date.now() - this.session.lastAccessedAt > SESSION_TIMEOUT_MS) {
			this.clearSession();
			return { valid: false, error: 'Session expired', errorType: 'session_expired' };
		}
		this.session.lastAccessedAt = Date.now();
		return { valid: true };
	}

	/**
	 * Validates storage limits for secret data.
	 * Returns error message if validation fails, null if valid.
	 */
	private validateStorageLimits(encryptedValue?: ArrayBuffer, encryptedName?: ArrayBuffer): string | null {
		if (encryptedValue && encryptedValue.byteLength > STORAGE_LIMITS.MAX_SECRET_VALUE_SIZE) {
			return `Secret value exceeds maximum size of ${STORAGE_LIMITS.MAX_SECRET_VALUE_SIZE / 1024}KB`;
		}
		if (encryptedName && encryptedName.byteLength > STORAGE_LIMITS.MAX_SECRET_NAME_LENGTH) {
			return `Secret name exceeds maximum length of ${STORAGE_LIMITS.MAX_SECRET_NAME_LENGTH} characters`;
		}
		return null;
	}

	// ========== WEBSOCKET HELPERS ==========

	private parseEncryptedData(base64Data: string): { ciphertext: ArrayBuffer; nonce: ArrayBuffer } {
		// Format: base64Ciphertext:base64Nonce
		const parts = base64Data.split(':');
		if (parts.length !== 2) {
			throw new Error('Invalid encrypted data format');
		}
		return {
			ciphertext: this.base64ToArrayBuffer(parts[0]),
			nonce: this.base64ToArrayBuffer(parts[1]),
		};
	}

	private uint8ArrayToBase64(arr: Uint8Array): string {
		let binary = '';
		for (let i = 0; i < arr.length; i++) {
			binary += String.fromCharCode(arr[i]);
		}
		return btoa(binary);
	}

	private clearSession(): void {
		if (this.session?.sk) {
			this.session.sk.fill(0);
		}
		this.session = null;
	}

	private sendWs(ws: WebSocket, data: Record<string, unknown>): void {
		ws.send(JSON.stringify(data));
	}

	private base64ToUint8Array(str: string): Uint8Array {
		const binary = atob(str);
		const bytes = new Uint8Array(binary.length);
		for (let i = 0; i < binary.length; i++) {
			bytes[i] = binary.charCodeAt(i);
		}
		return bytes;
	}

	private base64ToArrayBuffer(str: string): ArrayBuffer {
		const uint8 = this.base64ToUint8Array(str);
		const buffer = new ArrayBuffer(uint8.length);
		new Uint8Array(buffer).set(uint8);
		return buffer;
	}

	private async initializeSchema(): Promise<void> {
		this.ctx.storage.sql.exec(`
			CREATE TABLE IF NOT EXISTS vault_config (
				id INTEGER PRIMARY KEY CHECK (id = 1),
				kdf_algorithm TEXT NOT NULL,
				kdf_salt BLOB NOT NULL,
				kdf_params TEXT,
				prf_credential_id TEXT,
				prf_salt BLOB,
				encrypted_recovery_codes BLOB,
				recovery_codes_nonce BLOB,
				verification_blob BLOB NOT NULL,
				verification_nonce BLOB NOT NULL,
				created_at INTEGER NOT NULL,
				updated_at INTEGER NOT NULL
			)
		`);

		this.ctx.storage.sql.exec(`
			CREATE TABLE IF NOT EXISTS secrets (
				id TEXT PRIMARY KEY,
				encrypted_value BLOB NOT NULL,
				value_nonce BLOB NOT NULL,
				encrypted_name BLOB NOT NULL,
				name_nonce BLOB NOT NULL,
				metadata TEXT,
				secret_type TEXT NOT NULL,
				created_at INTEGER NOT NULL,
				updated_at INTEGER NOT NULL,
				is_deleted INTEGER DEFAULT 0
			)
		`);

		this.ctx.storage.sql.exec(`
			CREATE INDEX IF NOT EXISTS idx_secrets_type
			ON secrets(secret_type) WHERE is_deleted = 0
		`);
	}

	private async scheduleCleanup(): Promise<void> {
		const alarm = await this.ctx.storage.getAlarm();
		if (alarm === null) {
			await this.ctx.storage.setAlarm(Date.now() + CLEANUP_INTERVAL_MS);
		}
	}

	async alarm(): Promise<void> {
		this.cleanupExpiredSession();
		await this.ctx.storage.setAlarm(Date.now() + CLEANUP_INTERVAL_MS);
	}

	private cleanupExpiredSession(): void {
		if (this.session && Date.now() - this.session.lastAccessedAt > SESSION_TIMEOUT_MS) {
			this.clearSession();
		}
	}

	// ========== VAULT LIFECYCLE ==========

	getVaultStatus(): VaultStatusResponse {
		const result = this.ctx.storage.sql.exec(`
			SELECT kdf_algorithm, encrypted_recovery_codes FROM vault_config WHERE id = 1
		`);
		const rows = result.toArray();

		if (rows.length === 0) {
			return { exists: false };
		}

		const row = rows[0] as Record<string, SqlStorageValue>;
		return {
			exists: true,
			kdfAlgorithm: String(row.kdf_algorithm) as VaultConfig['kdfAlgorithm'],
			hasRecoveryCodes: row.encrypted_recovery_codes !== null,
		};
	}

	getVaultConfig(): VaultConfig | null {
		const result = this.ctx.storage.sql.exec(`SELECT * FROM vault_config WHERE id = 1`);
		const rows = result.toArray();

		if (rows.length === 0) return null;

		const row = rows[0] as Record<string, SqlStorageValue>;
		return {
			kdfAlgorithm: String(row.kdf_algorithm) as VaultConfig['kdfAlgorithm'],
			kdfSalt: new Uint8Array(row.kdf_salt as ArrayBuffer),
			kdfParams: row.kdf_params ? JSON.parse(String(row.kdf_params)) : undefined,
			prfCredentialId: row.prf_credential_id ? String(row.prf_credential_id) : undefined,
			prfSalt: row.prf_salt ? new Uint8Array(row.prf_salt as ArrayBuffer) : undefined,
			verificationBlob: new Uint8Array(row.verification_blob as ArrayBuffer),
			verificationNonce: new Uint8Array(row.verification_nonce as ArrayBuffer),
			hasRecoveryCodes: row.encrypted_recovery_codes !== null,
		};
	}

	setupVault(request: SetupVaultRequest): boolean {
		const existing = this.ctx.storage.sql.exec(`SELECT id FROM vault_config WHERE id = 1`);
		if (existing.toArray().length > 0) {
			return false; // Vault already exists
		}

		const now = Date.now();
		this.ctx.storage.sql.exec(
			`
			INSERT INTO vault_config (
				id, kdf_algorithm, kdf_salt, kdf_params, prf_credential_id, prf_salt,
				encrypted_recovery_codes, recovery_codes_nonce,
				verification_blob, verification_nonce, created_at, updated_at
			) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`,
			request.kdfAlgorithm,
			new Uint8Array(request.kdfSalt),
			request.kdfParams ? JSON.stringify(request.kdfParams) : null,
			request.prfCredentialId ?? null,
			request.prfSalt ? new Uint8Array(request.prfSalt) : null,
			request.encryptedRecoveryCodes ? new Uint8Array(request.encryptedRecoveryCodes) : null,
			request.recoveryCodesNonce ? new Uint8Array(request.recoveryCodesNonce) : null,
			new Uint8Array(request.verificationBlob),
			new Uint8Array(request.verificationNonce),
			now,
			now
		);

		return true;
	}

	// ========== SESSION MANAGEMENT ==========

	lockVault(): void {
		this.clearSession();
	}

	isVaultUnlocked(): boolean {
		if (!this.session) return false;

		if (Date.now() - this.session.lastAccessedAt > SESSION_TIMEOUT_MS) {
			this.clearSession();
			return false;
		}

		return true;
	}

	// ========== SECRET OPERATIONS ==========

	storeSecret(request: StoreSecretRequest): string {
		const id = crypto.randomUUID();
		const now = Date.now();

		this.ctx.storage.sql.exec(
			`
			INSERT INTO secrets (
				id, encrypted_value, value_nonce, encrypted_name, name_nonce,
				metadata, secret_type,
				created_at, updated_at, is_deleted
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
		`,
			id,
			new Uint8Array(request.encryptedValue),
			new Uint8Array(request.valueNonce),
			new Uint8Array(request.encryptedName),
			new Uint8Array(request.nameNonce),
			request.metadata ? JSON.stringify(request.metadata) : null,
			request.secretType,
			now,
			now
		);
		return id;
	}

	getSecret(secretId: string): EncryptedSecret | null {
		const result = this.ctx.storage.sql.exec(
			`SELECT * FROM secrets WHERE id = ? AND is_deleted = 0`,
			secretId
		);
		const rows = result.toArray();

		if (rows.length === 0) return null;

		return this.rowToEncryptedSecret(rows[0] as Record<string, SqlStorageValue>);
	}

	listSecrets(): SecretListItem[] {
		const result = this.ctx.storage.sql.exec(`
			SELECT id, encrypted_name, name_nonce, metadata, secret_type, created_at, updated_at
			FROM secrets WHERE is_deleted = 0 ORDER BY created_at DESC
		`);

		return result.toArray().map((row) => {
			const r = row as Record<string, SqlStorageValue>;
			return {
				id: String(r.id),
				encryptedName: new Uint8Array(r.encrypted_name as ArrayBuffer),
				nameNonce: new Uint8Array(r.name_nonce as ArrayBuffer),
				metadata: r.metadata ? (JSON.parse(String(r.metadata)) as SecretMetadata) : undefined,
				secretType: String(r.secret_type) as SecretListItem['secretType'],
				createdAt: Number(r.created_at),
				updatedAt: Number(r.updated_at),
			};
		});
	}

	deleteSecret(secretId: string): boolean {
		const result = this.ctx.storage.sql.exec(
			`
			UPDATE secrets SET is_deleted = 1, updated_at = ?
			WHERE id = ? AND is_deleted = 0
			RETURNING id
		`,
			Date.now(),
			secretId
		);
		return result.toArray().length > 0;
	}

	/**
	 * Gets secrets by provider from metadata.
	 * Used by agents to fetch BYOK API keys.
	 */
	getSecretsByProvider(provider: string): SecretListItem[] {
		const result = this.ctx.storage.sql.exec(
			`SELECT id, encrypted_name, name_nonce, metadata, secret_type, created_at, updated_at
			 FROM secrets
			 WHERE is_deleted = 0
			 ORDER BY created_at DESC`
		);

		return result
			.toArray()
			.map((row) => {
				const r = row as Record<string, SqlStorageValue>;
				const metadata = r.metadata ? (JSON.parse(String(r.metadata)) as SecretMetadata) : undefined;
				return {
					id: String(r.id),
					encryptedName: new Uint8Array(r.encrypted_name as ArrayBuffer),
					nameNonce: new Uint8Array(r.name_nonce as ArrayBuffer),
					metadata,
					secretType: String(r.secret_type) as SecretListItem['secretType'],
					createdAt: Number(r.created_at),
					updatedAt: Number(r.updated_at),
				};
			})
			.filter((s) => s.metadata?.provider === provider);
	}

	updateSecret(
		secretId: string,
		update: {
			encryptedValue?: ArrayBuffer;
			valueNonce?: ArrayBuffer;
			encryptedName?: ArrayBuffer;
			nameNonce?: ArrayBuffer;
			metadata?: SecretMetadata;
		}
	): boolean {
		const fields: string[] = [];
		const values: unknown[] = [];

		if (update.encryptedValue && update.valueNonce) {
			fields.push('encrypted_value = ?', 'value_nonce = ?');
			values.push(new Uint8Array(update.encryptedValue), new Uint8Array(update.valueNonce));
		}

		if (update.encryptedName && update.nameNonce) {
			fields.push('encrypted_name = ?', 'name_nonce = ?');
			values.push(new Uint8Array(update.encryptedName), new Uint8Array(update.nameNonce));
		}

		if (update.metadata !== undefined) {
			fields.push('metadata = ?');
			values.push(update.metadata ? JSON.stringify(update.metadata) : null);
		}

		if (fields.length === 0) return false;

		fields.push('updated_at = ?');
		values.push(Date.now(), secretId);

		const result = this.ctx.storage.sql.exec(
			`UPDATE secrets SET ${fields.join(', ')} WHERE id = ? AND is_deleted = 0 RETURNING id`,
			...values
		);
		return result.toArray().length > 0;
	}

	// ========== RECOVERY CODES ==========

	getEncryptedRecoveryCodes(): { encrypted: Uint8Array; nonce: Uint8Array } | null {
		const result = this.ctx.storage.sql.exec(`
			SELECT encrypted_recovery_codes, recovery_codes_nonce
			FROM vault_config WHERE id = 1
		`);
		const rows = result.toArray();

		if (rows.length === 0) return null;

		const row = rows[0] as Record<string, SqlStorageValue>;
		if (!row.encrypted_recovery_codes || !row.recovery_codes_nonce) return null;

		return {
			encrypted: new Uint8Array(row.encrypted_recovery_codes as ArrayBuffer),
			nonce: new Uint8Array(row.recovery_codes_nonce as ArrayBuffer),
		};
	}

	updateRecoveryCodes(encrypted: ArrayBuffer, nonce: ArrayBuffer): boolean {
		const result = this.ctx.storage.sql.exec(
			`
			UPDATE vault_config
			SET encrypted_recovery_codes = ?, recovery_codes_nonce = ?, updated_at = ?
			WHERE id = 1
			RETURNING id
		`,
			new Uint8Array(encrypted),
			new Uint8Array(nonce),
			Date.now()
		);
		return result.toArray().length > 0;
	}

	// ========== HELPERS ==========

	private rowToEncryptedSecret(row: Record<string, SqlStorageValue>): EncryptedSecret {
		return {
			id: String(row.id),
			encryptedValue: new Uint8Array(row.encrypted_value as ArrayBuffer),
			valueNonce: new Uint8Array(row.value_nonce as ArrayBuffer),
			encryptedName: new Uint8Array(row.encrypted_name as ArrayBuffer),
			nameNonce: new Uint8Array(row.name_nonce as ArrayBuffer),
			metadata: row.metadata ? (JSON.parse(String(row.metadata)) as SecretMetadata) : undefined,
			secretType: String(row.secret_type) as EncryptedSecret['secretType'],
			createdAt: Number(row.created_at),
			updatedAt: Number(row.updated_at),
		};
	}

	async resetVault(): Promise<void> {
		this.clearSession();
		this.ctx.storage.sql.exec(`DROP TABLE IF EXISTS secrets`);
		this.ctx.storage.sql.exec(`DROP TABLE IF EXISTS vault_config`);
		await this.initializeSchema();
	}

	// ========== RPC FOR AGENT DO ==========

	async requestSecret(query: {
		provider?: string;
		envVarName?: string;
		secretId?: string;
	}): Promise<{ success: boolean; value?: string; error?: string }> {
		if (!query.provider && !query.envVarName && !query.secretId) {
			return { success: false, error: 'invalid_request' };
		}

		if (!this.session) {
			return { success: false, error: 'vault_locked' };
		}

		if (Date.now() - this.session.lastAccessedAt > SESSION_TIMEOUT_MS) {
			this.clearSession();
			return { success: false, error: 'session_expired' };
		}

		this.session.lastAccessedAt = Date.now();

		let secretId = query.secretId;
		if (!secretId) {
			const matches = this.listSecrets().filter((s) => {
				if (query.provider && s.metadata?.provider !== query.provider) return false;
				if (query.envVarName && s.metadata?.envVarName !== query.envVarName) return false;
				return true;
			});

			if (matches.length === 0) {
				return { success: false, error: 'secret_not_found' };
			}
			secretId = matches[0].id;
		}

		const secret = this.getSecret(secretId);
		if (!secret) {
			return { success: false, error: 'secret_not_found' };
		}

		try {
			const vmk = await this.decryptVMK(
				new Uint8Array(this.session.encryptedVMK),
				new Uint8Array(this.session.nonce),
				this.session.sk
			);
			const value = await this.decryptSecretValue(secret.encryptedValue, secret.valueNonce, vmk);
			return { success: true, value };
		} catch {
			return { success: false, error: 'decryption_failed' };
		}
	}

	async requestSecretByProvider(provider: string): Promise<{ success: boolean; value?: string; error?: string }> {
		return this.requestSecret({ provider });
	}

	private async decryptVMK(encryptedVMK: Uint8Array, nonce: Uint8Array, sessionKey: Uint8Array): Promise<CryptoKey> {
		const sk = await crypto.subtle.importKey('raw', sessionKey, { name: 'AES-GCM' }, false, ['decrypt']);
		const vmkRaw = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, sk, encryptedVMK);
		const vmkArray = new Uint8Array(vmkRaw);
		const vmk = await crypto.subtle.importKey('raw', vmkArray, { name: 'AES-GCM' }, false, ['decrypt']);
		vmkArray.fill(0);
		return vmk;
	}

	private async decryptSecretValue(encryptedValue: Uint8Array, nonce: Uint8Array, vmk: CryptoKey): Promise<string> {
		const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, vmk, encryptedValue);
		const arr = new Uint8Array(plaintext);
		const result = new TextDecoder().decode(arr);
		arr.fill(0);
		return result;
	}

	// ========== WEBSOCKET TICKET MANAGEMENT ==========

	/**
	 * Store a WebSocket ticket for later consumption
	 */
	storeWsTicket(ticket: PendingWsTicket): void {
		this.ticketManager.store(ticket);
	}

	/**
	 * Consume a WebSocket ticket (one-time use)
	 * Returns user session if valid, null otherwise
	 */
	consumeWsTicket(token: string): TicketConsumptionResult | null {
		return this.ticketManager.consume(token);
	}
}
