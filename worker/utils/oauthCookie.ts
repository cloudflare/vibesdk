/**
 * HttpOnly cookie helpers for the Cloudflare OAuth encrypted token blob.
 *
 * The blob is the same base64 payload produced by `encryptTokens()`; this module
 * just centralises the cookie name and attributes so every call site agrees.
 * Prod uses the `__Host-` prefix (requires Secure + Path=/ + no Domain). Dev
 * (HTTP) drops the prefix and `Secure` because browsers reject Secure cookies
 * on plain http.
 */

import { isDev } from './envs';
import { parseCookies } from './authUtils';

const PROD_COOKIE = '__Host-cf_oauth_token';
const DEV_COOKIE = 'cf_oauth_token';

/** Short-lived PKCE verifier cookie set during /oauth/login and cleared on callback. */
const VERIFIER_COOKIE = '__cf_oauth_verifier';
export const VERIFIER_COOKIE_TTL_SECONDS = 10 * 60;

/** Default to 30 days; callers can override based on the refresh-token lifetime. */
const DEFAULT_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

function tokenCookieName(env: Env): string {
	return isDev(env) ? DEV_COOKIE : PROD_COOKIE;
}

function baseAttributes(env: Env): string {
	// SameSite=Lax so the cookie rides top-level redirects back from the OAuth provider.
	return isDev(env)
		? 'Path=/; HttpOnly; SameSite=Lax'
		: 'Path=/; HttpOnly; Secure; SameSite=Lax';
}

/** Build a Set-Cookie header value that installs the encrypted blob. */
export function buildTokenCookie(env: Env, blob: string, maxAgeSeconds: number = DEFAULT_MAX_AGE_SECONDS): string {
	return `${tokenCookieName(env)}=${encodeURIComponent(blob)}; ${baseAttributes(env)}; Max-Age=${maxAgeSeconds}`;
}

/** Build a Set-Cookie header value that clears the token cookie. */
export function buildClearTokenCookie(env: Env): string {
	return `${tokenCookieName(env)}=; ${baseAttributes(env)}; Max-Age=0`;
}

/** Read a named cookie value from the request's Cookie header, if present. */
export function readRequestCookie(request: Request | undefined | null, name: string): string | null {
	const header = request?.headers.get('Cookie');
	if (!header) return null;
	const cookies = parseCookies(header);
	return cookies[name] ?? null;
}

/** Read the encrypted token blob from the request's Cookie header, if present. */
export function readTokenCookie(request: Request | undefined | null, env: Env): string | null {
	return readRequestCookie(request, tokenCookieName(env));
}

/** Build a Set-Cookie header value for the short-lived PKCE verifier. */
export function buildVerifierCookie(env: Env, value: string, maxAgeSeconds: number = VERIFIER_COOKIE_TTL_SECONDS): string {
	return `${VERIFIER_COOKIE}=${encodeURIComponent(value)}; ${baseAttributes(env)}; Max-Age=${maxAgeSeconds}`;
}

/** Build a Set-Cookie header value that clears the PKCE verifier cookie. */
export function buildClearVerifierCookie(env: Env): string {
	return `${VERIFIER_COOKIE}=; ${baseAttributes(env)}; Max-Age=0`;
}

/** Read the PKCE verifier cookie value, if present. */
export function readVerifierCookie(request: Request | undefined | null): string | null {
	return readRequestCookie(request, VERIFIER_COOKIE);
}
