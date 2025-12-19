import { describe, expect, it } from 'bun:test';

import { PhasicClient } from '../../src/phasic';
import { createNodeWebSocketFactory } from '../../src/node';

function requireEnv(name: string): string {
	const v = process.env[name];
	if (!v) {
		throw new Error(
			`Missing ${name}. Create an API key in Settings → API Keys and run: ${name}=<key> bun run test:integration`,
		);
	}
	return v;
}

const describeIntegration =
	process.env.VIBESDK_RUN_INTEGRATION_TESTS === '1' &&
	process.env.VIBESDK_INTEGRATION_API_KEY
		? describe
		: describe.skip;

function previewUrlFromState(state: { previewUrl?: string; preview?: { status: string; previewURL?: string } }): string | undefined {
	if (state.preview?.status === 'complete' && state.preview.previewURL) return state.preview.previewURL;
	return state.previewUrl;
}

describeIntegration('SDK integration (local platform)', () => {
	const apiKey = requireEnv('VIBESDK_INTEGRATION_API_KEY');
	const baseUrl = process.env.VIBESDK_INTEGRATION_BASE_URL ?? 'http://localhost:5173';
	const wsFactory = createNodeWebSocketFactory();

	const fetchFn: typeof fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
		return await fetch(input, init);
	};

	function safeWsType(m: unknown): string {
		const t = (m as { type?: unknown })?.type;
		if (typeof t === 'string') return t.length > 120 ? `${t.slice(0, 120)}…` : t;
		try {
			const s = JSON.stringify(t);
			return s.length > 120 ? `${s.slice(0, 120)}…` : s;
		} catch {
			return String(t);
		}
	}

	it('sanity: dev server reachable', async () => {
		console.log(`[integration] baseUrl=${baseUrl}`);
		const checkResp = await fetch(`${baseUrl}/api/auth/check`, { method: 'GET' });
		console.log(`[integration] GET /api/auth/check -> ${checkResp.status}`);
		expect(checkResp.ok).toBe(true);
	});

	it('build: generation started -> deployable -> preview deployed -> generation complete', async () => {
		const client = new PhasicClient({
			baseUrl,
			apiKey,
			fetchFn,
			webSocketFactory: wsFactory,
		});

		console.log('[integration] build: creating agent');
		const session = await client.build('Build a simple hello world page.', {
			projectType: 'app',
			autoGenerate: true,
			credentials: {},
		});

		// Log every WS message type for debugging.
		session.on('ws:message', (m) => {
			console.log(`[integration] ws: ${safeWsType(m)}`);
		});
		session.on('ws:reconnecting', (e) => {
			console.log(
				`[integration] ws: reconnecting attempt=${e.attempt} delayMs=${e.delayMs} reason=${e.reason}`,
			);
		});
		session.on('ws:close', (e) => {
			console.log(`[integration] ws: close code=${e.code} reason=${e.reason}`);
		});
		session.on('ws:error', (e) => {
			console.log('[integration] ws: error', e.error);
		});

		console.log(`[integration] agentId=${session.agentId}`);
		expect(typeof session.agentId).toBe('string');

		// 1) Generation begins (SDK primitive)
		if (session.state.get().generation.status === 'idle') {
			await session.wait.generationStarted();
		}

		// 2) Deployable (SDK primitive; phasic currently maps to phase_validated internally)
		await session.wait.deployable();

		// 3) Preview deployment completed
		const previewWait = session.wait.previewDeployed();
		session.deployPreview();
		const deployed = await previewWait;
		expect(deployed.previewURL.startsWith('http')).toBe(true);

		// 4) Generation complete (if not already)
		if (session.state.get().generation.status !== 'complete') {
			await session.wait.generationComplete();
		}

		// Basic workspace sync sanity
		const paths = session.files.listPaths();
		console.log(`[integration] workspace files=${paths.length}`);
		expect(paths.length).toBeGreaterThan(0);

		const statePreviewUrl = previewUrlFromState(session.state.get() as any);
		console.log(`[integration] previewUrl=${statePreviewUrl ?? deployed.previewURL}`);

		session.close();
	});
});
