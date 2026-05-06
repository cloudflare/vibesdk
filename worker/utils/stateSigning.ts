/**
 * HMAC state signing for OAuth flows.
 *
 * OAuth `state` parameters travel through the browser and must resist tampering,
 * identity swapping, and replay. We sign the JSON payload with HMAC-SHA256 using
 * a key derived from CF_OAUTH_ENCRYPTION_KEY, then base64url-encode `payload.sig`.
 *
 * The signing key is derived via HKDF with a distinct "info" context so it cannot
 * collide with the AES key used for token encryption.
 */

import { base64url, base64urlDecode } from './cryptoUtils';

const SIG_INFO = 'cloudflare-oauth-state-signing-v1';
const STATE_MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes

function toBytes(buf: ArrayBuffer | Uint8Array): Uint8Array {
	return buf instanceof Uint8Array ? buf : new Uint8Array(buf);
}

/** Derive a dedicated HMAC-SHA256 signing key from the shared encryption secret. */
async function getSigningKey(env: Env): Promise<CryptoKey> {
	const secret = env.CF_OAUTH_ENCRYPTION_KEY;
	if (!secret) throw new Error('CF_OAUTH_ENCRYPTION_KEY is not configured');

	const encoder = new TextEncoder();
	const ikm = await crypto.subtle.importKey('raw', encoder.encode(secret), 'HKDF', false, ['deriveKey']);
	return crypto.subtle.deriveKey(
		{ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: encoder.encode(SIG_INFO) },
		ikm,
		{ name: 'HMAC', hash: 'SHA-256', length: 256 },
		false,
		['sign', 'verify'],
	);
}

/** Sign an arbitrary payload; returns a base64url(payload).base64url(signature) string. */
export async function signState<T>(payload: T, env: Env): Promise<string> {
	const key = await getSigningKey(env);
	const encoder = new TextEncoder();
	const payloadBytes = encoder.encode(JSON.stringify(payload));
	const sig = await crypto.subtle.sign('HMAC', key, payloadBytes);
	return `${base64url(payloadBytes)}.${base64url(toBytes(sig))}`;
}

/**
 * Verify a signed state string and return the parsed payload, or null if the
 * signature is invalid, the payload is malformed, or the `timestamp` field is
 * older than STATE_MAX_AGE_MS.
 */
export async function verifyState<T extends { timestamp?: number }>(
	signed: string,
	env: Env,
): Promise<T | null> {
	try {
		const dot = signed.indexOf('.');
		if (dot <= 0 || dot === signed.length - 1) return null;
		const payloadPart = signed.slice(0, dot);
		const sigPart = signed.slice(dot + 1);

		const key = await getSigningKey(env);
		const payloadBytes = base64urlDecode(payloadPart);
		const sigBytes = base64urlDecode(sigPart);
		const ok = await crypto.subtle.verify('HMAC', key, sigBytes, payloadBytes);
		if (!ok) return null;

		const payload = JSON.parse(new TextDecoder().decode(payloadBytes)) as T;
		if (payload.timestamp !== undefined && Date.now() - payload.timestamp > STATE_MAX_AGE_MS) {
			return null;
		}
		return payload;
	} catch {
		return null;
	}
}
