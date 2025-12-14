/**
 * Client-side cryptography for the User Secrets Vault.
 * All key derivation and encryption happens in the browser.
 */

import { argon2id } from 'hash-wasm';

// Argon2id parameters (PHC recommendations)
const ARGON2_TIME = 3;
const ARGON2_MEM = 65536; // 64 MB (in KiB)
const ARGON2_PARALLELISM = 4;
const ARGON2_HASH_LEN = 32;

// Session key storage key
const SESSION_KEY_STORAGE = 'vault_session_key';

// Recovery code alphabe
const RECOVERY_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export interface EncryptedData {
	ciphertext: Uint8Array<ArrayBuffer>;
	nonce: Uint8Array<ArrayBuffer>;
}

export interface VaultSession {
	sessionKey: Uint8Array<ArrayBuffer>;
}

/**
 * Derives VMK from password using Argon2id.
 */
export async function deriveVMKFromPassword(
	password: string,
	salt: Uint8Array<ArrayBuffer>,
): Promise<CryptoKey> {
	const hash = await argon2id({
		password,
		salt,
		iterations: ARGON2_TIME,
		memorySize: ARGON2_MEM,
		parallelism: ARGON2_PARALLELISM,
		hashLength: ARGON2_HASH_LEN,
		outputType: 'binary',
	});

	// Create a new ArrayBuffer and copy the hash data to avoid SharedArrayBuffer issues
	const keyBuffer = new ArrayBuffer(hash.length);
	new Uint8Array(keyBuffer).set(hash);

	return crypto.subtle.importKey(
		'raw',
		keyBuffer,
		{ name: 'AES-GCM', length: 256 },
		true, // extractable - needed for encryptVMKForSession
		['encrypt', 'decrypt'],
	);
}

/**
 * Derives VMK from WebAuthn PRF output using HKDF-SHA256.
 */
export async function deriveVMKFromPRF(
	prfOutput: ArrayBuffer,
	salt: Uint8Array<ArrayBuffer>,
): Promise<CryptoKey> {
	const keyMaterial = await crypto.subtle.importKey(
		'raw',
		prfOutput,
		'HKDF',
		false,
		['deriveKey'],
	);

	return crypto.subtle.deriveKey(
		{
			name: 'HKDF',
			hash: 'SHA-256',
			salt: salt,
			info: new TextEncoder().encode('vibesdk-vault-vmk'),
		},
		keyMaterial,
		{ name: 'AES-GCM', length: 256 },
		true, // extractable - needed for encryptVMKForSession
		['encrypt', 'decrypt'],
	);
}

/**
 * Derives VMK from recovery code using Argon2id.
 */
export async function deriveVMKFromRecoveryCode(
	code: string,
	salt: Uint8Array<ArrayBuffer>,
): Promise<CryptoKey> {
	const normalized = code.toUpperCase().replace(/-/g, '');
	return deriveVMKFromPassword(normalized, salt);
}

/**
 * Generates a random 256-bit session key.
 */
export function generateSessionKey(): Uint8Array<ArrayBuffer> {
	return crypto.getRandomValues(new Uint8Array(32));
}

/**
 * Encrypts VMK with session key for server transmission.
 */
export async function encryptVMKForSession(
	vmk: CryptoKey,
	sessionKey: Uint8Array<ArrayBuffer>,
): Promise<EncryptedData> {
	const sk = await crypto.subtle.importKey(
		'raw',
		sessionKey,
		{ name: 'AES-GCM', length: 256 },
		false,
		['encrypt'],
	);

	// Export VMK to encrypt it
	const vmkRaw = await crypto.subtle.exportKey('raw', vmk);
	const nonce = crypto.getRandomValues(new Uint8Array(12));

	const ciphertext = await crypto.subtle.encrypt(
		{ name: 'AES-GCM', iv: nonce },
		sk,
		vmkRaw,
	);

	return {
		ciphertext: new Uint8Array(ciphertext),
		nonce,
	};
}

/**
 * Stores session credentials in sessionStorage.
 */
export function storeSession(session: VaultSession): void {
	sessionStorage.setItem(
		SESSION_KEY_STORAGE,
		uint8ArrayToBase64(session.sessionKey),
	);
}

/**
 * Retrieves session credentials from sessionStorage.
 */
export function getSession(): VaultSession | null {
	const keyStr = sessionStorage.getItem(SESSION_KEY_STORAGE);
	if (!keyStr) return null;

	return {
		sessionKey: base64ToUint8Array(keyStr),
	};
}

/**
 * Clears session from sessionStorage.
 */
export function clearSession(): void {
	sessionStorage.removeItem(SESSION_KEY_STORAGE);
}

/**
 * Encrypts plaintext with AES-256-GCM.
 */
export async function encryptWithKey(
	key: CryptoKey,
	plaintext: string,
): Promise<EncryptedData> {
	const nonce = crypto.getRandomValues(new Uint8Array(12));
	const data = new TextEncoder().encode(plaintext);

	const ciphertext = await crypto.subtle.encrypt(
		{ name: 'AES-GCM', iv: nonce },
		key,
		data,
	);

	return {
		ciphertext: new Uint8Array(ciphertext),
		nonce,
	};
}

/**
 * Decrypts ciphertext with AES-256-GCM.
 */
export async function decryptWithKey(
	key: CryptoKey,
	ciphertext: Uint8Array<ArrayBuffer>,
	nonce: Uint8Array<ArrayBuffer>,
): Promise<string> {
	const plaintext = await crypto.subtle.decrypt(
		{ name: 'AES-GCM', iv: nonce },
		key,
		ciphertext,
	);

	return new TextDecoder().decode(plaintext);
}

/**
 * Generates recovery codes (8 codes, format: XXXXX-XXXXX).
 */
export function generateRecoveryCodes(count = 8): string[] {
	const codes: string[] = [];
	const alphabetLength = RECOVERY_ALPHABET.length;

	if (alphabetLength === 0 || count <= 0) return codes;

	// Use rejection sampling to avoid modulo bias.
	// Supports any alphabet length up to 2^16
	const range = alphabetLength <= 256 ? 256 : 65536;
	const maxUnbiased = range - (range % alphabetLength);

	const bytePool = new Uint8Array(64);
	let bytePoolIndex = bytePool.length;

	const wordPool = new Uint16Array(64);
	let wordPoolIndex = wordPool.length;

	function nextInt(): number {
		if (range === 256) {
			if (bytePoolIndex >= bytePool.length) {
				crypto.getRandomValues(bytePool);
				bytePoolIndex = 0;
			}
			return bytePool[bytePoolIndex++];
		}

		if (wordPoolIndex >= wordPool.length) {
			crypto.getRandomValues(wordPool);
			wordPoolIndex = 0;
		}
		return wordPool[wordPoolIndex++];
	}

	function nextUnbiasedIndex(): number {
		while (true) {
			const n = nextInt();
			if (n < maxUnbiased) return n % alphabetLength;
		}
	}

	for (let i = 0; i < count; i++) {
		let code = '';

		for (let j = 0; j < 10; j++) {
			code += RECOVERY_ALPHABET[nextUnbiasedIndex()];
			if (j === 4) code += '-';
		}

		codes.push(code);
	}

	return codes;
}

/**
 * Encrypts recovery codes with VMK.
 */
export async function encryptRecoveryCodes(
	vmk: CryptoKey,
	codes: string[],
): Promise<EncryptedData> {
	return encryptWithKey(vmk, JSON.stringify(codes));
}

/**
 * Creates verification blob for password/key validation.
 */
export async function createVerificationBlob(
	vmk: CryptoKey,
): Promise<EncryptedData> {
	return encryptWithKey(vmk, 'vault-v1');
}

/**
 * Verifies VMK by decrypting verification blob.
 */
export async function verifyVMK(
	vmk: CryptoKey,
	verificationBlob: Uint8Array<ArrayBuffer>,
	verificationNonce: Uint8Array<ArrayBuffer>,
): Promise<boolean> {
	try {
		const result = await decryptWithKey(vmk, verificationBlob, verificationNonce);
		return result === 'vault-v1';
	} catch {
		return false;
	}
}

/**
 * Generates random salt for KDF.
 */
export function generateSalt(length = 32): Uint8Array<ArrayBuffer> {
	return crypto.getRandomValues(new Uint8Array(length));
}

// Utility functions for base64 conversion
export function uint8ArrayToBase64(arr: Uint8Array<ArrayBuffer>): string {
	let binary = '';
	for (let i = 0; i < arr.length; i++) {
		binary += String.fromCharCode(arr[i]);
	}
	return btoa(binary);
}

export function base64ToUint8Array(str: string): Uint8Array<ArrayBuffer> {
	const binary = atob(str);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes;
}

// URL-safe base64 for headers
export function uint8ArrayToBase64Url(arr: Uint8Array<ArrayBuffer>): string {
	return uint8ArrayToBase64(arr)
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=/g, '');
}

export function base64UrlToUint8Array(str: string): Uint8Array<ArrayBuffer> {
	let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
	while (base64.length % 4) base64 += '=';
	return base64ToUint8Array(base64);
}
