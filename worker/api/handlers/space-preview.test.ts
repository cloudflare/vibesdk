import { describe, expect, it } from 'vitest';
import { handleSpacePreview } from './space-preview';
import {
	buildPreviewCookie,
	signSpacePreviewToken,
	SPACE_PREVIEW_COOKIE_NAME,
} from '../../utils/spacePreviewToken';

const JWT_SECRET = 'test-secret-for-space-preview-token-validation-1234567890';

type HandlerEnv = Parameters<typeof handleSpacePreview>[1];

interface ForwardCapture {
	lastRequest: Request | null;
}

function makeEnv(
	overrides: Record<string, unknown> = {},
	capture: ForwardCapture = { lastRequest: null },
): HandlerEnv {
	const stub = {
		fetch: async (req: Request) => {
			capture.lastRequest = req;
			return new Response('<html><body><img src="/logo.png"></body></html>', {
				headers: { 'content-type': 'text/html' },
			});
		},
	};
	const namespace = {
		idFromName: (name: string) => name,
		get: () => stub,
	};
	return {
		JWT_SECRET,
		CUSTOM_DOMAIN: 'example.com',
		CUSTOM_PREVIEW_DOMAIN: '',
		SPACE_DO: namespace,
		...overrides,
	} as unknown as HandlerEnv;
}

function previewRequest(token?: string, cookie?: string): Request {
	const url = token
		? `https://example.com/space/space-a/preview/main/?t=${encodeURIComponent(token)}`
		: 'https://example.com/space/space-a/preview/main/';
	return new Request(url, cookie ? { headers: { Cookie: cookie } } : undefined);
}

describe('handleSpacePreview', () => {
	it('forwards a valid ?t= token and sets the preview cookie (Lax, same-origin)', async () => {
		const env = makeEnv();
		const token = await signSpacePreviewToken(env, {
			spaceName: 'space-a',
			branch: 'main',
			userId: 'user-a',
		});

		const res = await handleSpacePreview(previewRequest(token), env, 'space-a', 'main');
		expect(res.status).toBe(200);
		const setCookie = res.headers.get('Set-Cookie') ?? '';
		expect(setCookie).toContain(`${SPACE_PREVIEW_COOKIE_NAME}=`);
		expect(setCookie).toContain('HttpOnly');
		expect(setCookie).toContain('Path=/space/space-a/preview/main');
		expect(setCookie).toContain('SameSite=Lax');
	});

	it('forwards a request carrying a valid preview cookie (no ?t=)', async () => {
		const env = makeEnv();
		const token = await signSpacePreviewToken(env, {
			spaceName: 'space-a',
			branch: 'main',
			userId: 'user-a',
		});
		const cookie = buildPreviewCookie({
			token,
			spaceName: 'space-a',
			branch: 'main',
			crossSite: false,
			secure: true,
		});

		const res = await handleSpacePreview(
			previewRequest(undefined, cookie),
			env,
			'space-a',
			'main',
		);
		expect(res.status).toBe(200);
	});

	it('returns 401 when neither token nor cookie is present', async () => {
		const env = makeEnv();
		const res = await handleSpacePreview(previewRequest(), env, 'space-a', 'main');
		expect(res.status).toBe(401);
	});

	it('returns 401 for a token minted for a different branch', async () => {
		const env = makeEnv();
		const token = await signSpacePreviewToken(env, {
			spaceName: 'space-a',
			branch: 'feature',
			userId: 'user-a',
		});

		const res = await handleSpacePreview(previewRequest(token), env, 'space-a', 'main');
		expect(res.status).toBe(401);
	});

	it('on a separate preview domain, sets a partitioned cookie and strips ?t= before forwarding', async () => {
		const capture: ForwardCapture = { lastRequest: null };
		const env = makeEnv({ CUSTOM_PREVIEW_DOMAIN: 'preview.example.dev' }, capture);
		const token = await signSpacePreviewToken(env, {
			spaceName: 'space-a',
			branch: 'main',
			userId: 'user-a',
		});

		const res = await handleSpacePreview(previewRequest(token), env, 'space-a', 'main');
		expect(res.status).toBe(200);
		const setCookie = res.headers.get('Set-Cookie') ?? '';
		expect(setCookie).toContain('SameSite=None');
		expect(setCookie).toContain('Secure');
		expect(setCookie).toContain('Partitioned');
		// The generated app never sees the token.
		expect(new URL(capture.lastRequest!.url).searchParams.get('t')).toBeNull();
	});
});
