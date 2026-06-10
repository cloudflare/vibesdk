import { AppService } from '../../database';
import { authMiddleware } from '../../middleware/auth/auth';
import { verifySpacePreviewToken } from '../../utils/spacePreviewToken';

const SPACE_PREVIEW_ROUTE_PATTERN = /^\/space\/([^/]+)\/preview\/[^/]+(?:\/.*)?$/;

type SpaceNamespace = {
	SPACE_DO?: DurableObjectNamespace;
};

export function matchSpacePreviewPath(pathname: string): string | null {
	const match = pathname.match(SPACE_PREVIEW_ROUTE_PATTERN);
	if (!match) return null;
	return decodeURIComponent(match[1]);
}

function getSpaceNamespace(env: Env): DurableObjectNamespace | null {
	const spaceNamespace = (env as unknown as SpaceNamespace).SPACE_DO;
	return spaceNamespace ?? null;
}

async function forwardToSpacePreview(request: Request, env: Env, spaceName: string): Promise<Response> {
	const namespace = getSpaceNamespace(env);
	if (!namespace) {
		return new Response('Preview unavailable', { status: 404 });
	}
	const stub = namespace.get(namespace.idFromName(spaceName));
	try {
		return await stub.fetch(request);
	} catch (e) {
		// A SpaceDO failure (e.g. no deployment yet, or a build error in the
		// generated app) must not escape as an unhandled exception — that
		// surfaces in dev as a miniflare "Unexpected end of JSON input" flood.
		// Return a graceful 503 the preview iframe can display instead.
		const message = e instanceof Error ? e.message : String(e);
		return new Response(
			`Preview not ready: ${message}. Deploy the app, then reload.`,
			{ status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
		);
	}
}

export function createPreviewAccessResponse(status: 401 | 403, title: string, message: string): Response {
	return new Response(
		`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title><style>body{margin:0;font-family:Inter,system-ui,sans-serif;background:#0b1020;color:#e5e7eb;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px}.card{max-width:480px;background:#111827;border:1px solid #374151;border-radius:12px;padding:24px;box-shadow:0 20px 45px rgba(0,0,0,.35)}h1{margin:0 0 12px;font-size:24px}p{margin:0;color:#cbd5e1;line-height:1.5}</style></head><body><div class="card"><h1>${title}</h1><p>${message}</p></div></body></html>`,
		{
			status,
			headers: {
				'Content-Type': 'text/html; charset=utf-8',
			},
		},
	);
}

export async function handleCookieAuthenticatedSpacePreview(
	request: Request,
	env: Env,
	spaceName: string,
): Promise<Response> {
	const userSession = await authMiddleware(request, env);
	if (!userSession) {
		return createPreviewAccessResponse(401, 'Login required', 'You must be signed in as the app owner to view this preview.');
	}

	const appService = new AppService(env);
	const ownershipResult = await appService.checkAppOwnership(spaceName, userSession.user.id);
	if (!ownershipResult.isOwner) {
		return createPreviewAccessResponse(403, 'Preview access denied', 'Only the owner of this app can view this preview.');
	}

	return forwardToSpacePreview(request, env, spaceName);
}

export async function handleTokenAuthenticatedSpacePreview(
	request: Request,
	env: Env,
	spaceName: string,
): Promise<Response> {
	const token = new URL(request.url).searchParams.get('t') ?? '';
	if (!token) {
		return createPreviewAccessResponse(401, 'Access denied', 'This preview link is missing an access token.');
	}

	const claims = await verifySpacePreviewToken(env, token, spaceName);
	if (!claims) {
		return createPreviewAccessResponse(401, 'Access denied', 'This preview link is invalid or has expired.');
	}

	const forwardedUrl = new URL(request.url);
	forwardedUrl.searchParams.delete('t');
	const forwardedRequest = new Request(forwardedUrl.toString(), request);
	return forwardToSpacePreview(forwardedRequest, env, spaceName);
}
