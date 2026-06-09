import { describe, expect, it, beforeAll, afterAll } from 'bun:test';
import { spawn, type Subprocess } from 'bun';
import path from 'path';
import fs from 'fs';
import type { FullTestResult } from './test-flow';

function getEnv(name: string, fallback?: string): string | undefined {
	return process.env[name] ?? fallback;
}

const apiKey = getEnv('VIBESDK_API_KEY', getEnv('VIBESDK_INTEGRATION_API_KEY'));
const baseUrl = getEnv(
	'VIBESDK_BASE_URL',
	getEnv('VIBESDK_INTEGRATION_BASE_URL', 'https://build.cloudflare.dev')
);

const describeWorker = apiKey ? describe : describe.skip;

const WORKER_PORT = 8799;
const WORKER_URL = `http://localhost:${WORKER_PORT}`;
const FULL_BUILD_TIMEOUT = 10 * 60 * 1000;

async function waitForServer(url: string, maxAttempts = 30): Promise<boolean> {
	for (let i = 0; i < maxAttempts; i++) {
		try {
			const resp = await fetch(url, { signal: AbortSignal.timeout(1000) });
			if (resp.ok) return true;
		} catch {
			// Server not ready yet
		}
		await new Promise((r) => setTimeout(r, 1000));
	}
	return false;
}

function logStepResults(result: FullTestResult, prefix: string): void {
	for (const step of result.steps) {
		const status = step.success ? 'OK' : 'FAIL';
		const details = step.details ? ` ${JSON.stringify(step.details)}` : '';
		const error = step.error ? ` ERROR: ${step.error}` : '';
		console.log(`${prefix} [${status}] ${step.step} (${step.duration}ms)${details}${error}`);
	}
}

describeWorker('SDK Worker Integration', () => {
	let wranglerProcess: Subprocess | null = null;

	beforeAll(async () => {
		const workerDir = path.join(import.meta.dir, 'worker');
		const devVarsPath = path.join(workerDir, '.dev.vars');

		console.log(`[worker-test] Starting wrangler dev from: ${workerDir}`);
		console.log(`[worker-test] Base URL: ${baseUrl}`);
		console.log(`[worker-test] Worker URL: ${WORKER_URL}`);

		// Create .dev.vars file with secrets for wrangler dev
		const devVarsContent = `VIBESDK_API_KEY=${apiKey}\nVIBESDK_BASE_URL=${baseUrl}\n`;
		fs.writeFileSync(devVarsPath, devVarsContent);
		console.log(`[worker-test] Created .dev.vars file`);

		// Install dependencies first
		const installProc = spawn({
			cmd: ['bun', 'install'],
			cwd: workerDir,
			stdout: 'inherit',
			stderr: 'inherit',
		});
		await installProc.exited;

		// Spawn wrangler dev with explicit config to avoid picking up root wrangler.jsonc
		wranglerProcess = spawn({
			cmd: [
				'bunx',
				'wrangler',
				'dev',
				'--config',
				'wrangler.toml',
				'--port',
				String(WORKER_PORT),
				'--local',
			],
			cwd: workerDir,
			env: {
				...process.env,
				VIBESDK_API_KEY: apiKey!,
				VIBESDK_BASE_URL: baseUrl!,
			},
			stdout: 'inherit',
			stderr: 'inherit',
		});

		const ready = await waitForServer(WORKER_URL);
		if (!ready) {
			throw new Error('Wrangler dev server failed to start');
		}

		console.log('[worker-test] Wrangler dev server ready');
	});

	afterAll(async () => {
		if (wranglerProcess) {
			console.log('[worker-test] Stopping wrangler dev server');
			wranglerProcess.kill();
			await wranglerProcess.exited;
		}

		// Clean up .dev.vars file
		const devVarsPath = path.join(import.meta.dir, 'worker', '.dev.vars');
		if (fs.existsSync(devVarsPath)) {
			fs.unlinkSync(devVarsPath);
			console.log('[worker-test] Cleaned up .dev.vars file');
		}
	});

	it('health check', async () => {
		const resp = await fetch(`${WORKER_URL}/`);
		const text = await resp.text();

		expect(resp.ok).toBe(true);
		expect(text).toBe('SDK Worker Integration Test');
	});

	it('auth: client creation and token exchange', async () => {
		const resp = await fetch(`${WORKER_URL}/test-auth`);
		const result = (await resp.json()) as FullTestResult;

		logStepResults(result, '[worker]');

		expect(result.ok).toBe(true);
	});

	it(
		'build: full flow with step-by-step verification',
		async () => {
			console.log('[worker-test] Starting full SDK build test...');

			const resp = await fetch(`${WORKER_URL}/test-sdk-build`, {
				signal: AbortSignal.timeout(FULL_BUILD_TIMEOUT),
			});
			const result = (await resp.json()) as FullTestResult;

			console.log(`[worker-test] Build completed in ${result.totalDuration}ms`);
			logStepResults(result, '[worker]');

			if (result.agentId) {
				console.log(`[worker-test] Agent ID: ${result.agentId}`);
			}
			if (result.previewUrl) {
				console.log(`[worker-test] Preview URL: ${result.previewUrl}`);
			}

			// Check for rate limit
			if (result.error?.includes('429') || result.error?.includes('rate limit')) {
				console.log('[worker-test] Rate limited - skipping assertion');
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
