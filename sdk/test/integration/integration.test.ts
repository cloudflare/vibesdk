import { describe, expect, it } from 'bun:test';
import { testAuth, testFullBuild, type FullTestResult } from './test-flow';

function getEnv(name: string, fallback?: string): string | undefined {
	return process.env[name] ?? fallback;
}

function requireEnv(name: string, altName?: string): string {
	const v = process.env[name] ?? (altName ? process.env[altName] : undefined);
	if (!v) {
		throw new Error(
			`Missing ${name}. Create an API key in Settings -> API Keys and run: ${name}=<key> bun run test:integration`
		);
	}
	return v;
}

const apiKeyAvailable = !!(process.env.VIBESDK_API_KEY || process.env.VIBESDK_INTEGRATION_API_KEY);
const runIntegration = process.env.VIBESDK_RUN_INTEGRATION_TESTS === '1' || apiKeyAvailable;
const describeIntegration = runIntegration ? describe : describe.skip;

const FULL_BUILD_TIMEOUT = 10 * 60 * 1000;

function logStepResults(result: FullTestResult, prefix: string): void {
	for (const step of result.steps) {
		const status = step.success ? 'OK' : 'FAIL';
		const details = step.details ? ` ${JSON.stringify(step.details)}` : '';
		const error = step.error ? ` ERROR: ${step.error}` : '';
		console.log(`${prefix} [${status}] ${step.step} (${step.duration}ms)${details}${error}`);
	}
}

describeIntegration('SDK integration', () => {
	const apiKey = requireEnv('VIBESDK_API_KEY', 'VIBESDK_INTEGRATION_API_KEY');
	const baseUrl = getEnv(
		'VIBESDK_BASE_URL',
		getEnv('VIBESDK_INTEGRATION_BASE_URL', 'https://build.cloudflare.dev')
	) as string;

	const log = (msg: string) => console.log(`[bun] ${msg}`);

	it('auth: client creation and token exchange', async () => {
		console.log(`[bun] Testing against: ${baseUrl}`);

		const result = await testAuth({ baseUrl, apiKey, log });
		logStepResults(result, '[bun]');

		expect(result.ok).toBe(true);
	});

	it(
		'build: full flow with step-by-step verification',
		async () => {
			console.log(`[bun] Starting full build test against: ${baseUrl}`);

			const result = await testFullBuild({ baseUrl, apiKey, log });
			logStepResults(result, '[bun]');

			if (result.agentId) {
				console.log(`[bun] Agent ID: ${result.agentId}`);
			}
			if (result.previewUrl) {
				console.log(`[bun] Preview URL: ${result.previewUrl}`);
			}

			// Check for rate limit
			if (result.error?.includes('429') || result.error?.includes('rate limit')) {
				console.log('[bun] Rate limited - skipping assertion');
				return;
			}

			expect(result.ok).toBe(true);
			expect(result.agentId).toBeDefined();
			expect(result.previewUrl).toBeDefined();
			expect(result.previewUrl!.startsWith('http')).toBe(true);

			const failedSteps = result.steps.filter((s) => !s.success);
			expect(failedSteps.length).toBe(0);
		},
		FULL_BUILD_TIMEOUT
	);
});
