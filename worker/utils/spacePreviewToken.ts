import { JWTUtils } from './jwtUtils';

const PREVIEW_PURPOSE = 'space_preview';
export const SPACE_PREVIEW_TOKEN_TTL_SECONDS = 24 * 60 * 60;

export interface SpacePreviewClaims {
	spaceName: string;
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
): Promise<SpacePreviewClaims | null> {
	const jwt = JWTUtils.getInstance(env);
	const payload = await jwt.verifyPayload(token);
	if (!payload) return null;
	if (payload.purpose !== PREVIEW_PURPOSE) return null;
	if (typeof payload.spaceName !== 'string' || payload.spaceName !== expectedSpaceName) return null;
	if (typeof payload.userId !== 'string' || payload.userId.trim() === '') return null;

	return {
		spaceName: payload.spaceName,
		userId: payload.userId,
	};
}
