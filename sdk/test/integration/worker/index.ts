import { testAuth, testFullBuild, type FullTestResult } from '../test-flow';

interface Env {
	VIBESDK_API_KEY: string;
	VIBESDK_BASE_URL: string;
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);
		const log = (msg: string) => console.log(`[worker] ${msg}`);

		// Health check
		if (url.pathname === '/') {
			return new Response('SDK Worker Integration Test', { status: 200 });
		}

		// Auth test
		if (url.pathname === '/test-auth') {
			const result = await testAuth({
				baseUrl: env.VIBESDK_BASE_URL,
				apiKey: env.VIBESDK_API_KEY,
				log,
			});
			return Response.json(result);
		}

		// Full SDK build test
		if (url.pathname === '/test-sdk-build') {
			const result = await testFullBuild({
				baseUrl: env.VIBESDK_BASE_URL,
				apiKey: env.VIBESDK_API_KEY,
				log,
			});
			return Response.json(result);
		}

		return new Response('Not Found', { status: 404 });
	},
};
