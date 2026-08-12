/**
 * ArtifactsController
 *
 * Owner-gated, read-only proxy to the app's Cloudflare Artifacts repository.
 * Powers the "Repo" tab in the chat UI, which renders the vendored
 * `artifacts-viewer` React components against this origin.
 *
 * The vendored `routeArtifactRequest` (packages/artifacts-viewer) reads from
 * Cloudflare's Artifacts REST API server-side, injecting a bearer token. That
 * must be a Cloudflare API token with Artifacts read scope: the `ARTIFACTS`
 * binding's repo tokens authenticate the git remote, not the REST API, so they
 * are rejected here (verified: REST returns 401 for a binding-minted token).
 * We prefer a dedicated `ARTIFACTS_API_TOKEN` and fall back to the shared
 * `CLOUDFLARE_API_TOKEN`. The browser never sees the token, the account id, or
 * the namespace — it only ever addresses repositories by name under
 * `/api/artifacts`.
 *
 * Each app's Artifacts repo is named after its SpaceDO instance, which is the
 * agent id (== the app id). Authorization reduces to: does the session user own
 * the app whose id equals the repo name in the path? That runs in
 * `beforeRequest`, before any cache or upstream access.
 */
import { routeArtifactRequest } from 'artifacts-viewer';
import { createCacheApiAdapter } from 'artifacts-viewer/server/cache';
import { BaseController } from '../baseController';
import { createLogger } from '../../../logger';
import { RouteContext } from '../../types/route-context';
import { ApiResponse, ControllerResponse } from '../types';
import { AppService } from '../../../database/services/AppService';
import type { ListAppBranchesResponse } from './types';

/** Mount point for the read-only Artifacts proxy. */
const ARTIFACTS_API_PATH = '/api/artifacts';

/** Minimal SpaceDO surface needed to list branches. */
interface SpaceGitStub extends DurableObjectStub {
	gitBranch(opts?: {
		name?: string;
		list?: boolean;
		delete?: string;
	}): Promise<{ branches?: string[]; current?: string } | string[]>;
}

export class ArtifactsController extends BaseController {
	static logger = createLogger('ArtifactsController');

	static async proxy(
		request: Request,
		env: Env,
		ctx: ExecutionContext,
		context: RouteContext,
	): Promise<Response> {
		const userId = context.user?.id;
		if (!userId) {
			return new Response('Unauthorized', { status: 401 });
		}

		const accountId = env.CLOUDFLARE_ACCOUNT_ID;
		const namespace = env.ARTIFACTS_NAMESPACE;
		// Prefer a dedicated read-scoped Artifacts token; fall back to the shared
		// account token. Both must carry Cloudflare Artifacts read permission.
		const apiToken =
			(env as { ARTIFACTS_API_TOKEN?: string }).ARTIFACTS_API_TOKEN ||
			env.CLOUDFLARE_API_TOKEN;
		if (!accountId || !namespace || !apiToken) {
			this.logger.warn('Artifacts proxy is not configured', {
				hasAccountId: !!accountId,
				hasNamespace: !!namespace,
				hasApiToken: !!apiToken,
			});
			return new Response('Artifacts viewer is not configured', { status: 503 });
		}

		const appService = new AppService(env);

		const handled = await routeArtifactRequest(request, {
			accountId,
			namespace,
			apiToken,
			apiPath: ARTIFACTS_API_PATH,
			// Authorization: only the app owner may read its repository. The repo
			// name is the app id (== agent id == SpaceDO instance name).
			beforeRequest: async ({ read }) => {
				const ownership = await appService.checkAppOwnership(read.repoName, userId);
				if (!ownership.isOwner) {
					return new Response('Forbidden', { status: 403 });
				}
			},
			cache: createCacheApiAdapter({
				cache: caches.default,
				baseUrl: new URL(request.url).origin,
			}),
			waitUntil: (promise) => ctx.waitUntil(promise),
		});

		return handled ?? new Response('Not found', { status: 404 });
	}

	/**
	 * List the branches of the app's workspace repo, for the Repo tab's branch
	 * selector. Branch listing is a SpaceDO git operation (the Artifacts REST
	 * proxy has no branches endpoint). Owner-gated at the route layer.
	 */
	static async listBranches(
		_request: Request,
		env: Env,
		_ctx: ExecutionContext,
		context: RouteContext,
	): Promise<ControllerResponse<ApiResponse<ListAppBranchesResponse>>> {
		try {
			const agentId = context.pathParams.agentId;
			if (!agentId) {
				return this.createErrorResponse<ListAppBranchesResponse>('Missing agent ID', 400);
			}
			const ns = (env as unknown as { SPACE_DO?: DurableObjectNamespace }).SPACE_DO;
			if (!ns) {
				return this.createErrorResponse<ListAppBranchesResponse>(
					'SPACE_DO binding is not configured',
					503,
				);
			}
			// One space per session: the space is always the agent id.
			const stub = ns.get(ns.idFromName(agentId)) as unknown as SpaceGitStub;
			const result = await stub.gitBranch({ list: true });
			const branches = Array.isArray(result) ? result : (result.branches ?? []);
			const current = Array.isArray(result) ? null : (result.current ?? null);
			return this.createSuccessResponse<ListAppBranchesResponse>({ current, branches });
		} catch (e) {
			return this.handleError(e, 'list app branches') as ControllerResponse<
				ApiResponse<ListAppBranchesResponse>
			>;
		}
	}
}
