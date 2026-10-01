import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GitCloneRepositoryTarget } from '../../utils/gitCloneToken';

interface MockApp {
	id: string;
	userId: string;
	visibility: 'public' | 'private';
	createdAt: Date;
}

const APP_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const APP_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const APP_C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const apps = new Map<string, MockApp>();
const targets = new Map<string, GitCloneRepositoryTarget>();
const exportSpaceGitObjects = vi.fn(async (_spaceName: string) => []);
const exportAgentGitObjects = vi.fn(async (_agentId: string) => ({
	gitObjects: [],
	query: '',
	hasCommits: false,
	templateDetails: null,
}));

vi.mock('../../database/services/AppService', () => ({
	AppService: class {
		async getAppDetails(appId: string) {
			return apps.get(appId) ?? null;
		}
	},
}));

vi.mock('../../agents', () => ({
	resolveGitCloneRepositoryTarget: async (_env: unknown, appId: string) => {
		const target = targets.get(appId);
		if (!target) throw new Error(`Missing target for ${appId}`);
		return target;
	},
	getSpaceGitStub: (_env: unknown, spaceName: string) => ({
		exportGitObjects: () => exportSpaceGitObjects(spaceName),
	}),
	getAgentStub: async (_env: unknown, agentId: string) => ({
		exportGitObjects: () => exportAgentGitObjects(agentId),
	}),
}));

const { handleGitProtocolRequest } = await import('./git-protocol');
const { signGitCloneToken } = await import('../../utils/gitCloneToken');
const { JWTUtils } = await import('../../utils/jwtUtils');

type HandlerEnv = Parameters<typeof handleGitProtocolRequest>[1];
type HandlerContext = Parameters<typeof handleGitProtocolRequest>[2];

const env = {
	JWT_SECRET: 'test-secret-for-git-protocol-validation-1234567890',
} as HandlerEnv;

const ctx = {
	waitUntil: vi.fn(),
	passThroughOnException: vi.fn(),
	props: {},
} as unknown as HandlerContext;

function seedApp(id: string, userId: string, target: GitCloneRepositoryTarget, visibility: 'public' | 'private' = 'private'): void {
	apps.set(id, { id, userId, visibility, createdAt: new Date('2026-01-01T00:00:00Z') });
	targets.set(id, target);
}

function gitRequest(appId: string, endpoint: 'info/refs' | 'git-upload-pack', token?: string): Request {
	const headers = token ? { Authorization: `Basic ${btoa(`oauth2:${token}`)}` } : undefined;
	return new Request(`https://example.com/apps/${appId}.git/${endpoint}`, {
		method: endpoint === 'git-upload-pack' ? 'POST' : 'GET',
		headers,
	});
}

beforeEach(() => {
	apps.clear();
	targets.clear();
	exportSpaceGitObjects.mockClear();
	exportAgentGitObjects.mockClear();
	vi.mocked(ctx.waitUntil).mockClear();
});

describe('Git protocol repository authorization', () => {
	it('clones a Think app from its Space repository', async () => {
		const target = { kind: 'space', spaceName: APP_A } as const;
		seedApp(APP_A, 'user-a', target);
		const token = await signGitCloneToken(env, { userId: 'user-a', target });

		const response = await handleGitProtocolRequest(gitRequest(APP_A, 'info/refs', token), env, ctx);

		expect(response.status).toBe(200);
		expect(exportSpaceGitObjects).toHaveBeenCalledWith(APP_A);
		expect(exportAgentGitObjects).not.toHaveBeenCalled();
	});

	it('clones a Phasic app from its agent repository', async () => {
		const target = { kind: 'agent', agentId: APP_A } as const;
		seedApp(APP_A, 'user-a', target);
		const token = await signGitCloneToken(env, { userId: 'user-a', target });

		const response = await handleGitProtocolRequest(gitRequest(APP_A, 'info/refs', token), env, ctx);

		expect(response.status).toBe(200);
		expect(exportAgentGitObjects).toHaveBeenCalledWith(APP_A);
		expect(exportSpaceGitObjects).not.toHaveBeenCalled();
	});

	it.each([
		['Think', { kind: 'space', spaceName: APP_A }, { kind: 'space', spaceName: APP_B }],
		['Phasic', { kind: 'agent', agentId: APP_A }, { kind: 'agent', agentId: APP_B }],
	] as const)('rejects same-owner cross-app reuse for %s repositories', async (_name, sourceTarget, targetTarget) => {
		seedApp(APP_A, 'user-a', sourceTarget);
		seedApp(APP_B, 'user-a', targetTarget);
		const token = await signGitCloneToken(env, { userId: 'user-a', target: sourceTarget });

		for (const endpoint of ['info/refs', 'git-upload-pack'] as const) {
			const response = await handleGitProtocolRequest(gitRequest(APP_B, endpoint, token), env, ctx);
			expect(response.status).toBe(401);
		}
		expect(exportSpaceGitObjects).not.toHaveBeenCalled();
		expect(exportAgentGitObjects).not.toHaveBeenCalled();
	});

	it('rejects cross-backend token reuse', async () => {
		const sourceTarget = { kind: 'space', spaceName: APP_A } as const;
		seedApp(APP_A, 'user-a', sourceTarget);
		seedApp(APP_B, 'user-a', { kind: 'agent', agentId: APP_B });
		const token = await signGitCloneToken(env, { userId: 'user-a', target: sourceTarget });

		const response = await handleGitProtocolRequest(gitRequest(APP_B, 'info/refs', token), env, ctx);

		expect(response.status).toBe(401);
		expect(exportSpaceGitObjects).not.toHaveBeenCalled();
		expect(exportAgentGitObjects).not.toHaveBeenCalled();
	});

	it('rejects a correctly scoped token whose user does not own the app', async () => {
		const target = { kind: 'space', spaceName: APP_C } as const;
		seedApp(APP_C, 'user-c', target);
		const token = await signGitCloneToken(env, { userId: 'user-a', target });

		const response = await handleGitProtocolRequest(gitRequest(APP_C, 'info/refs', token), env, ctx);

		expect(response.status).toBe(401);
	});

	it('rejects generic access tokens', async () => {
		const target = { kind: 'agent', agentId: APP_A } as const;
		seedApp(APP_A, 'user-a', target);
		const token = await JWTUtils.getInstance(env).createToken({
			sub: 'user-a',
			email: 'user@example.com',
			type: 'access',
			sessionId: `git-clone-${APP_A}`,
		});

		const response = await handleGitProtocolRequest(gitRequest(APP_A, 'info/refs', token), env, ctx);

		expect(response.status).toBe(401);
	});

	it('rejects malformed Basic auth headers with 401 instead of 500', async () => {
		seedApp(APP_A, 'user-a', { kind: 'agent', agentId: APP_A });

		const response = await handleGitProtocolRequest(
			new Request(`https://example.com/apps/${APP_A}.git/info/refs`, {
				headers: { Authorization: 'Basic %%%not-base64%%%' },
			}),
			env,
			ctx,
		);

		expect(response.status).toBe(401);
	});

	it('allows public repositories without a token', async () => {
		seedApp(APP_A, 'user-a', { kind: 'space', spaceName: APP_A }, 'public');

		const response = await handleGitProtocolRequest(gitRequest(APP_A, 'info/refs'), env, ctx);

		expect(response.status).toBe(200);
		expect(exportSpaceGitObjects).toHaveBeenCalledWith(APP_A);
	});
});
