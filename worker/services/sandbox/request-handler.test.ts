import { afterEach, describe, expect, it, vi } from 'vitest';

const validatePortToken = vi.fn();
const containerFetch = vi.fn();
const sandboxFetch = vi.fn();

vi.mock('@cloudflare/sandbox', () => ({
	getSandbox: () => ({
		validatePortToken,
		containerFetch,
		fetch: sandboxFetch,
	}),
	Sandbox: class {},
}));

// Imported after the mock so the module under test picks up the mocked getSandbox.
const { proxyToSandbox } = await import('./request-handler');

const env = { Sandbox: {} } as unknown as Parameters<typeof proxyToSandbox>[1];

function req(hostname: string, init?: RequestInit): Request {
	return new Request(`https://${hostname}/`, init);
}

// port-sandboxId-token.domain — token is exactly 16 chars.
const TOKEN = 'abcdef0123456789';

afterEach(() => {
	vi.clearAllMocks();
});

describe('proxyToSandbox', () => {
	it('returns null for a hostname that is not a sandbox route', async () => {
		const res = await proxyToSandbox(req('example.com'), env);
		expect(res).toBeNull();
		expect(validatePortToken).not.toHaveBeenCalled();
	});

	it('proxies through when the port token is valid', async () => {
		validatePortToken.mockResolvedValue(true);
		containerFetch.mockResolvedValue(new Response('ok'));

		const res = await proxyToSandbox(req(`8001-mysandbox-${TOKEN}.preview.example.dev`), env);

		expect(validatePortToken).toHaveBeenCalledWith(8001, TOKEN);
		expect(containerFetch).toHaveBeenCalledTimes(1);
		expect(res?.status).toBe(200);
	});

	it('returns 404 for a syntactically valid but unissued token (never reaches container)', async () => {
		validatePortToken.mockResolvedValue(false);

		const res = await proxyToSandbox(req(`8001-mysandbox-${TOKEN}.preview.example.dev`), env);

		expect(res?.status).toBe(404);
		expect(containerFetch).not.toHaveBeenCalled();
		expect(sandboxFetch).not.toHaveBeenCalled();
	});

	it('blocks control-plane port 3000 with 404 even with a token, before any token check', async () => {
		const res = await proxyToSandbox(req(`3000-mysandbox-${TOKEN}.preview.example.dev`), env);

		expect(res?.status).toBe(404);
		expect(validatePortToken).not.toHaveBeenCalled();
		expect(containerFetch).not.toHaveBeenCalled();
	});

	it('strips Cookie/Authorization but forwards safe headers to the container', async () => {
		validatePortToken.mockResolvedValue(true);
		containerFetch.mockResolvedValue(new Response('ok'));

		await proxyToSandbox(
			req(`8001-mysandbox-${TOKEN}.preview.example.dev`, {
				headers: {
					Cookie: 'session=secret',
					Authorization: 'Bearer secret',
					'X-Csrf-Token': 'secret',
					'X-Api-Key': 'secret',
					Accept: 'text/html',
					'Content-Type': 'application/json',
				},
			}),
			env,
		);

		const proxied = containerFetch.mock.calls[0][0] as Request;
		expect(proxied.headers.get('Cookie')).toBeNull();
		expect(proxied.headers.get('Authorization')).toBeNull();
		expect(proxied.headers.get('X-Csrf-Token')).toBeNull();
		expect(proxied.headers.get('X-Api-Key')).toBeNull();
		expect(proxied.headers.get('Accept')).toBe('text/html');
		expect(proxied.headers.get('Content-Type')).toBe('application/json');
	});

	it('adds proxy X-* headers on the container request', async () => {
		validatePortToken.mockResolvedValue(true);
		containerFetch.mockResolvedValue(new Response('ok'));

		await proxyToSandbox(req(`8001-mysandbox-${TOKEN}.preview.example.dev`), env);

		const proxied = containerFetch.mock.calls[0][0] as Request;
		expect(proxied.headers.get('X-Sandbox-Name')).toBe('mysandbox');
		expect(proxied.headers.get('X-Forwarded-Host')).toBe(
			`8001-mysandbox-${TOKEN}.preview.example.dev`,
		);
		expect(proxied.headers.get('X-Forwarded-Proto')).toBe('https');
	});

	it('forwards WebSocket handshake headers but strips Cookie on a valid upgrade', async () => {
		validatePortToken.mockResolvedValue(true);
		sandboxFetch.mockResolvedValue(new Response('ok'));

		await proxyToSandbox(
			req(`8001-mysandbox-${TOKEN}.preview.example.dev`, {
				headers: {
					Upgrade: 'websocket',
					Connection: 'Upgrade',
					'Sec-WebSocket-Version': '13',
					Cookie: 'session=secret',
					Authorization: 'Bearer secret',
				},
			}),
			env,
		);

		const forwarded = sandboxFetch.mock.calls[0][0] as Request;
		expect(forwarded.headers.get('Upgrade')).toBe('websocket');
		expect(forwarded.headers.get('Sec-WebSocket-Version')).toBe('13');
		expect(forwarded.headers.get('Cookie')).toBeNull();
		expect(forwarded.headers.get('Authorization')).toBeNull();
	});

	it('rejects a WebSocket upgrade with a bad token (no sandbox.fetch)', async () => {
		validatePortToken.mockResolvedValue(false);

		const res = await proxyToSandbox(
			req(`8001-mysandbox-${TOKEN}.preview.example.dev`, {
				headers: { Upgrade: 'websocket' },
			}),
			env,
		);

		expect(res?.status).toBe(404);
		expect(sandboxFetch).not.toHaveBeenCalled();
	});
});
