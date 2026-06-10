/**
 * Puppeteer-agnostic console-log capture core.
 *
 * Both the in-worker `BindingCaptureClient` (which uses
 * `@cloudflare/puppeteer` against the `BROWSER` binding) and the
 * out-of-worker dev sidecar (which uses regular `puppeteer`) feed a
 * `Page` here so navigation + listener wiring lives in exactly one
 * place.
 */

import type {
	CapturePage,
	CapturePayload,
	BrowserConsoleCaptureResult,
	BrowserConsoleEntry,
	BrowserConsolePageError,
	BrowserConsoleRequestFailure,
} from './types';

const PAGE_LOAD_TIMEOUT_MS = 30_000;

export async function runCapture(
	page: CapturePage,
	payload: CapturePayload,
): Promise<BrowserConsoleCaptureResult> {
	const logs: BrowserConsoleEntry[] = [];
	const pageErrors: BrowserConsolePageError[] = [];
	const requestFailures: BrowserConsoleRequestFailure[] = [];

	page.on('console', (msg) => {
		try {
			logs.push({
				level: msg.type(),
				text: msg.text(),
				location: msg.location(),
			});
		} catch {
			// best-effort capture; never let a listener crash the page
		}
	});
	page.on('pageerror', (err) => {
		pageErrors.push({ message: err.message, stack: err.stack });
	});
	page.on('requestfailed', (req) => {
		try {
			requestFailures.push({
				url: req.url(),
				method: req.method(),
				failure: req.failure()?.errorText ?? 'unknown',
			});
		} catch {
			// ignore listener errors
		}
	});
	page.on('response', (res) => {
		try {
			const status = res.status();
			if (status >= 400) {
				requestFailures.push({
					url: res.url(),
					method: res.request().method(),
					failure: `HTTP ${status}`,
					status,
				});
			}
		} catch {
			// ignore listener errors
		}
	});

	try {
		await page.setViewport(payload.viewport);
		await page.goto(payload.url, {
			waitUntil: 'networkidle2',
			timeout: PAGE_LOAD_TIMEOUT_MS,
		});
		if (payload.interactScript) {
			await page.evaluate(payload.interactScript);
		}
		const waitMs = Math.max(0, payload.waitSeconds) * 1000;
		if (waitMs > 0) {
			await new Promise((r) => setTimeout(r, waitMs));
		}
	} finally {
		try {
			await page.close();
		} catch {
			// ignore close failures
		}
	}

	return {
		url: payload.url,
		capturedAt: new Date().toISOString(),
		logs,
		pageErrors,
		requestFailures,
	};
}
