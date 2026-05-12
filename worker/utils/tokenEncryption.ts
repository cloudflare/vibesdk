/**
 * Token Encryption Utilities
 * 
 * Backend-only encryption for Cloudflare OAuth tokens.
 * Uses AES-GCM-256 with PBKDF2 key derivation.
 * 
 * Security: The encryption key (CF_OAUTH_ENCRYPTION_KEY) is stored
 * as a backend secret and never exposed to the frontend.
 */

import { createLogger } from '../logger';

const logger = createLogger('TokenEncryption');

const ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256;
const IV_LENGTH = 12;
const SALT_LENGTH = 16;
const PBKDF2_ITERATIONS = 100_000; // Workers runtime caps PBKDF2 at 100k iterations
// Fallback salt for decrypting blobs produced before per-record salts were introduced.
const LEGACY_SALT = new TextEncoder().encode('cloudflare-oauth-v3');

/**
 * Token data structure for encrypted storage
 */
export interface EncryptedTokenData {
	accessToken: string;
	refreshToken?: string;
	expiresAt: number; // Unix timestamp when access token expires
	tokenType?: string;
	userId: string; // Bound to specific user to prevent token theft/replay
}

/**
 * Derive an AES-GCM encryption key from the secret with a caller-supplied salt.
 * Per-record salts limit the impact of a secret compromise (no single derived key
 * guards every user's tokens).
 */
async function deriveEncryptionKey(env: Env, salt: Uint8Array): Promise<CryptoKey> {
	const secret = env.CF_OAUTH_ENCRYPTION_KEY;
	if (!secret) {
		throw new Error('CF_OAUTH_ENCRYPTION_KEY is not configured');
	}

	const encoder = new TextEncoder();
	const keyMaterial = await crypto.subtle.importKey(
		'raw',
		encoder.encode(secret),
		'PBKDF2',
		false,
		['deriveBits', 'deriveKey']
	);

	return crypto.subtle.deriveKey(
		{ name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
		keyMaterial,
		{ name: ALGORITHM, length: KEY_LENGTH },
		false,
		['encrypt', 'decrypt']
	);
}

/**
 * Encrypt token data for client-side storage.
 * Returns a base64-encoded string containing IV + ciphertext.
 * 
 * @param tokens - Plain token data to encrypt
 * @param env - Worker environment with CF_OAUTH_ENCRYPTION_KEY
 * @returns Base64-encoded encrypted blob
 */
export async function encryptTokens(
	tokens: EncryptedTokenData,
	env: Env
): Promise<string> {
	try {
		const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
		const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
		const key = await deriveEncryptionKey(env, salt);

		const encoder = new TextEncoder();
		const plaintext = encoder.encode(JSON.stringify(tokens));

		const ciphertext = await crypto.subtle.encrypt({ name: ALGORITHM, iv }, key, plaintext);

		// Format: salt (16) | iv (12) | ciphertext
		const combined = new Uint8Array(salt.length + iv.length + ciphertext.byteLength);
		combined.set(salt, 0);
		combined.set(iv, salt.length);
		combined.set(new Uint8Array(ciphertext), salt.length + iv.length);

		return btoa(String.fromCharCode(...combined));
	} catch (error) {
		logger.error('Failed to encrypt tokens', error);
		throw new Error('Token encryption failed');
	}
}

/**
 * Decrypt token data from client-side storage.
 * 
 * @param encryptedBlob - Base64-encoded encrypted blob from client
 * @param env - Worker environment with CF_OAUTH_ENCRYPTION_KEY
 * @returns Decrypted token data or null if decryption fails
 */
export async function decryptTokens(
	encryptedBlob: string,
	env: Env
): Promise<EncryptedTokenData | null> {
	try {
		if (!encryptedBlob) {
			return null;
		}

		const combined = Uint8Array.from(atob(encryptedBlob), (c) => c.charCodeAt(0));

		// New format (salt | iv | ciphertext). Try per-record salt first; if GCM auth fails,
		// fall back to the legacy fixed-salt format so old blobs keep decrypting.
		const attempts: Array<{ salt: Uint8Array; iv: Uint8Array; ciphertext: Uint8Array }> = [];
		if (combined.length > SALT_LENGTH + IV_LENGTH) {
			attempts.push({
				salt: combined.slice(0, SALT_LENGTH),
				iv: combined.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH),
				ciphertext: combined.slice(SALT_LENGTH + IV_LENGTH),
			});
		}
		if (combined.length > IV_LENGTH) {
			attempts.push({
				salt: LEGACY_SALT,
				iv: combined.slice(0, IV_LENGTH),
				ciphertext: combined.slice(IV_LENGTH),
			});
		}

		for (const { salt, iv, ciphertext } of attempts) {
			try {
				const key = await deriveEncryptionKey(env, salt);
				const plaintext = await crypto.subtle.decrypt({ name: ALGORITHM, iv }, key, ciphertext);
				return JSON.parse(new TextDecoder().decode(plaintext)) as EncryptedTokenData;
			} catch {
				// Try next format
			}
		}
		return null;
	} catch (error) {
		logger.error('Failed to decrypt tokens', error);
		return null;
	}
}

/**
 * Check if encrypted tokens are expired without decrypting.
 * This is a quick check based on the expiry timestamp stored alongside the blob.
 * 
 * Note: The actual expiry is inside the encrypted blob, but we also store
 * an unencrypted expiry hint for quick checks without decryption.
 */
export function isTokenExpired(expiryTimestamp: number | null): boolean {
	if (!expiryTimestamp) {
		return true;
	}
	return Date.now() >= expiryTimestamp;
}

/**
 * Extract access token from encrypted blob with user validation.
 * Validates that the token belongs to the expected user to prevent token theft.
 * 
 * @param encryptedBlob - Base64-encoded encrypted blob
 * @param env - Worker environment
 * @param expectedUserId - The userId that should own this token
 * @returns Access token string or null if invalid/expired/wrong user
 */
export async function getAccessTokenFromBlob(
	encryptedBlob: string,
	env: Env,
	expectedUserId: string
): Promise<string | null> {
	const tokens = await decryptTokens(encryptedBlob, env);
	if (!tokens) {
		return null;
	}

	// Validate token belongs to the expected user (prevents token theft/replay)
	if (tokens.userId !== expectedUserId) {
		logger.warn('Token userId mismatch - rejecting', { 
			tokenUserId: tokens.userId, 
			expectedUserId 
		});
		return null;
	}

	// Check if token is expired
	if (tokens.expiresAt && Date.now() >= tokens.expiresAt) {
		logger.debug('Access token is expired');
		return null;
	}

	return tokens.accessToken;
}
