import { JWTUtils } from './jwtUtils';

const PREVIEW_PURPOSE = 'space_preview';
export const SPACE_PREVIEW_TOKEN_TTL_SECONDS = 30 * 60;
export const SPACE_PREVIEW_COOKIE_NAME = '__space_preview';

export interface SpacePreviewClaims {
	spaceName: string;
	branch: string;
	userId: string;
}

export async function signSpacePreviewToken(
	env: { JWT_SECRET: string },
	claims: SpacePreviewClaims,
): Promise<string> {
	const jwt = JWTUtils.getInstance(env);
	return jwt.signPayload({ ...claims, purpose: PREVIEW_PURPOSE }, SPACE_PREVIEW_TOKEN_TTL_SECONDS);
}

export async function verifySpacePreviewToken(
	env: { JWT_SECRET: string },
	token: string,
	expectedSpaceName: string,
	expectedBranch: string,
): Promise<SpacePreviewClaims | null> {
	const jwt = JWTUtils.getInstance(env);
	const payload = await jwt.verifyPayload(token);
	if (!payload) return null;
	if (payload.purpose !== PREVIEW_PURPOSE) return null;
	if (typeof payload.spaceName !== 'string' || payload.spaceName !== expectedSpaceName) return null;
	if (typeof payload.branch !== 'string' || payload.branch !== expectedBranch) return null;
	if (typeof payload.userId !== 'string' || payload.userId.trim() === '') return null;

	return {
		spaceName: payload.spaceName,
		branch: payload.branch,
		userId: payload.userId,
	};
}

/**
 * Path the preview cookie is scoped to. No trailing slash so it prefix-matches
 * `/space/<name>/preview/<branch>/...` but not a sibling like `<branch>2`.
 */
export function buildSpacePreviewCookiePath(spaceName: string, branch: string): string {
	return `/space/${encodeURIComponent(spaceName)}/preview/${encodeURIComponent(branch)}`;
}

/**
 * Build the `Set-Cookie` value for the path-scoped HttpOnly preview cookie.
 * - Separate preview domain (cross-site iframe): `SameSite=None; Secure; Partitioned`.
 * - Same-origin (dev/main domain): `SameSite=Lax` (+ `Secure` when served over https).
 */
export function buildPreviewCookie(opts: {
	token: string;
	spaceName: string;
	branch: string;
	crossSite: boolean;
	secure: boolean;
	ttlSeconds?: number;
}): string {
	const { token, spaceName, branch, crossSite, secure } = opts;
	const maxAge = opts.ttlSeconds ?? SPACE_PREVIEW_TOKEN_TTL_SECONDS;
	const path = buildSpacePreviewCookiePath(spaceName, branch);
	const parts = [
		`${SPACE_PREVIEW_COOKIE_NAME}=${token}`,
		`Path=${path}`,
		`Max-Age=${maxAge}`,
		'HttpOnly',
	];
	if (crossSite) {
		parts.push('SameSite=None', 'Secure', 'Partitioned');
	} else {
		parts.push('SameSite=Lax');
		if (secure) parts.push('Secure');
	}
	return parts.join('; ');
}

/** Read the raw preview-cookie value from a request's `Cookie` header. */
export function readPreviewCookie(request: Request): string | null {
	const header = request.headers.get('Cookie');
	if (!header) return null;
	for (const pair of header.split(';')) {
		const idx = pair.indexOf('=');
		if (idx === -1) continue;
		const name = pair.slice(0, idx).trim();
		if (name === SPACE_PREVIEW_COOKIE_NAME) {
			return pair.slice(idx + 1).trim();
		}
	}
	return null;
}
