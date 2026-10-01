import { JWTUtils } from './jwtUtils';

const GIT_CLONE_PURPOSE = 'git_clone';
export const GIT_CLONE_TOKEN_TTL_SECONDS = 60 * 60;

export type GitCloneRepositoryTarget =
	| { kind: 'space'; spaceName: string }
	| { kind: 'agent'; agentId: string };

export interface GitCloneTokenClaims {
	userId: string;
	target: GitCloneRepositoryTarget;
}

export async function signGitCloneToken(
	env: { JWT_SECRET: string },
	claims: GitCloneTokenClaims,
): Promise<string> {
	const jwt = JWTUtils.getInstance(env);
	return jwt.signPayload(
		{ purpose: GIT_CLONE_PURPOSE, userId: claims.userId, target: claims.target },
		GIT_CLONE_TOKEN_TTL_SECONDS,
	);
}

function parseTarget(value: unknown): GitCloneRepositoryTarget | null {
	if (!value || typeof value !== 'object') return null;
	const target = value as Record<string, unknown>;
	if (target.kind === 'space' && typeof target.spaceName === 'string' && target.spaceName.trim() !== '') {
		return { kind: 'space', spaceName: target.spaceName };
	}
	if (target.kind === 'agent' && typeof target.agentId === 'string' && target.agentId.trim() !== '') {
		return { kind: 'agent', agentId: target.agentId };
	}
	return null;
}

function targetsMatch(actual: GitCloneRepositoryTarget, expected: GitCloneRepositoryTarget): boolean {
	if (actual.kind === 'space') {
		return expected.kind === 'space' && actual.spaceName === expected.spaceName;
	}
	return expected.kind === 'agent' && actual.agentId === expected.agentId;
}

export async function verifyGitCloneToken(
	env: { JWT_SECRET: string },
	token: string,
	expectedTarget: GitCloneRepositoryTarget,
): Promise<GitCloneTokenClaims | null> {
	const jwt = JWTUtils.getInstance(env);
	const payload = await jwt.verifyPayload(token);
	if (!payload || payload.purpose !== GIT_CLONE_PURPOSE) return null;
	if (typeof payload.userId !== 'string' || payload.userId.trim() === '') return null;

	const target = parseTarget(payload.target);
	if (!target || !targetsMatch(target, expectedTarget)) return null;

	return { userId: payload.userId, target };
}
