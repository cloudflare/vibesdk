import { describe, expect, it } from 'vitest';
import {
	GIT_CLONE_TOKEN_TTL_SECONDS,
	signGitCloneToken,
	verifyGitCloneToken,
	type GitCloneRepositoryTarget,
} from './gitCloneToken';
import { JWTUtils } from './jwtUtils';

const testEnv = {
	JWT_SECRET: 'test-secret-for-git-clone-token-validation-1234567890',
};

const spaceTarget: GitCloneRepositoryTarget = { kind: 'space', spaceName: 'app-a' };
const agentTarget: GitCloneRepositoryTarget = { kind: 'agent', agentId: 'app-a' };

describe('gitCloneToken', () => {
	it.each([
		['Space', spaceTarget],
		['agent', agentTarget],
	] as const)('verifies a valid %s repository token', async (_name, target) => {
		const token = await signGitCloneToken(testEnv, { userId: 'user-a', target });

		expect(await verifyGitCloneToken(testEnv, token, target)).toEqual({
			userId: 'user-a',
			target,
		});
	});

	it('rejects same-owner reuse against another Space or agent repository', async () => {
		const spaceToken = await signGitCloneToken(testEnv, { userId: 'user-a', target: spaceTarget });
		const agentToken = await signGitCloneToken(testEnv, { userId: 'user-a', target: agentTarget });

		await expect(verifyGitCloneToken(testEnv, spaceToken, { kind: 'space', spaceName: 'app-b' })).resolves.toBeNull();
		await expect(verifyGitCloneToken(testEnv, agentToken, { kind: 'agent', agentId: 'app-b' })).resolves.toBeNull();
	});

	it('rejects repository-kind confusion for the same identifier', async () => {
		const token = await signGitCloneToken(testEnv, { userId: 'user-a', target: spaceTarget });

		await expect(verifyGitCloneToken(testEnv, token, agentTarget)).resolves.toBeNull();
	});

	it('rejects malformed claims and the wrong purpose', async () => {
		const jwt = JWTUtils.getInstance(testEnv);
		const wrongPurpose = await jwt.signPayload(
			{ purpose: 'space_preview', userId: 'user-a', target: spaceTarget },
			GIT_CLONE_TOKEN_TTL_SECONDS,
		);
		const malformed = await jwt.signPayload(
			{ purpose: 'git_clone', userId: '', target: { kind: 'space', spaceName: '' } },
			GIT_CLONE_TOKEN_TTL_SECONDS,
		);

		await expect(verifyGitCloneToken(testEnv, wrongPurpose, spaceTarget)).resolves.toBeNull();
		await expect(verifyGitCloneToken(testEnv, malformed, spaceTarget)).resolves.toBeNull();
	});

	it('rejects expired tokens', async () => {
		const jwt = JWTUtils.getInstance(testEnv);
		const token = await jwt.signPayload(
			{ purpose: 'git_clone', userId: 'user-a', target: spaceTarget },
			-1,
		);

		await expect(verifyGitCloneToken(testEnv, token, spaceTarget)).resolves.toBeNull();
	});

	it('does not accept generic access tokens, including legacy git-clone sessions', async () => {
		const jwt = JWTUtils.getInstance(testEnv);
		const token = await jwt.createToken({
			sub: 'user-a',
			email: 'user@example.com',
			type: 'access',
			sessionId: 'git-clone-app-a',
		});

		await expect(verifyGitCloneToken(testEnv, token, agentTarget)).resolves.toBeNull();
	});

	it('cannot be parsed as a normal API access token', async () => {
		const token = await signGitCloneToken(testEnv, { userId: 'user-a', target: agentTarget });

		await expect(JWTUtils.getInstance(testEnv).verifyToken(token)).resolves.toBeNull();
	});

	it('does not copy access-token fields from a widened claims object', async () => {
		const claims = {
			userId: 'user-a',
			target: agentTarget,
			sub: 'user-a',
			email: 'user@example.com',
			type: 'access' as const,
			sessionId: 'session-a',
		};
		const token = await signGitCloneToken(testEnv, claims);
		const payload = await JWTUtils.getInstance(testEnv).verifyPayload(token);

		expect(payload).not.toHaveProperty('sub');
		expect(payload).not.toHaveProperty('email');
		expect(payload).not.toHaveProperty('type');
		expect(payload).not.toHaveProperty('sessionId');
		await expect(JWTUtils.getInstance(testEnv).verifyToken(token)).resolves.toBeNull();
	});
});
