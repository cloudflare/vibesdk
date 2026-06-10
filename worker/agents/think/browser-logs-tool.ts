/**
 * `get_browser_console_logs` — opens the
 * current preview app in a real headless browser (Cloudflare `BROWSER` binding
 * in prod, local sidecar in dev) and returns console output, uncaught page
 * errors, and failed network requests captured during page load.
 *
 * This runs inside the ThinkAgent DO and calls the shared capture service directly via
 * `getBrowserCaptureClient` — the parent agent is busy awaiting the Think
 * stream, so re-entrant RPC into it would deadlock.
 */
import { tool, type Tool } from 'ai';
import { z } from 'zod';
import { getBrowserCaptureClient } from '../../services/browser-capture/factory';
import { createLogger } from '../../logger';

const DESCRIPTION = [
	'Open the current preview app in a real headless browser and return its console output, uncaught page errors, and failed network requests captured during page load.',
	'',
	"USE THIS FOR client-side bugs invisible to server-side logs: React render/hydration errors, broken client-side fetches, missing assets (4xx/5xx), CSP/CORS violations, JS exceptions in handlers.",
	'',
	"DEFAULTS to the current preview URL. Pass 'url' to inspect a specific route. Pass 'wait_seconds' (default 5, max 25) to allow late-firing logs/network calls after page load. Optional 'interact_script' is a JS string evaluated in the page after load (e.g. 'document.querySelector(\"button\").click()') to trigger interactions before logs are collected.",
	'',
	"OUTPUT is JSON: { url, captured_at, logs:[{level,text,location}], page_errors:[{message,stack}], request_failures:[{url,failure,status}], truncated, totals, warning? }. If 'warning' is set in dev, the browser sidecar wasn't reachable — instruct the user to run 'npm run dev:browser' and retry. Each category is independently capped at max_lines (default 100, -1 = no limit).",
].join('\n');

export function createBrowserConsoleLogsTool(opts: { env: Env; defaultUrl?: string }): Tool {
	const { env, defaultUrl } = opts;
	const logger = createLogger('ThinkBrowserLogs');
	return tool({
		description: DESCRIPTION,
		inputSchema: z.object({
			url: z
				.string()
				.optional()
				.describe('Optional URL to inspect. Defaults to the current preview URL.'),
			wait_seconds: z
				.number()
				.optional()
				.describe('Seconds to wait after page load for late output. Default 5, max 25.'),
			max_lines: z
				.number()
				.optional()
				.describe(
					'Max entries returned per category (logs, page_errors, request_failures). Default 100. Set -1 for no limit.',
				),
			interact_script: z
				.string()
				.optional()
				.describe('Optional JS string evaluated in the page after load to trigger interactions.'),
		}),
		execute: async (args: {
			url?: string;
			wait_seconds?: number;
			max_lines?: number;
			interact_script?: string;
		}) => {
			const targetUrl = args.url ?? defaultUrl;
			if (!targetUrl) {
				return JSON.stringify({
					error:
						'No preview URL available yet. Deploy the app first, or pass an explicit `url`.',
				});
			}

			const client = getBrowserCaptureClient(env, logger);
			let result;
			try {
				result = await client.captureConsoleLogs({
					url: targetUrl,
					waitSeconds: Math.min(Math.max(args.wait_seconds ?? 5, 0), 25),
					viewport: { width: 1280, height: 800 },
					interactScript: args.interact_script,
				});
			} catch (e) {
				return JSON.stringify({
					error: `Browser console capture failed: ${e instanceof Error ? e.message : String(e)}`,
				});
			}

			const cap = args.max_lines ?? 100;
			const trunc = <T>(arr: T[]): T[] => (cap === -1 ? arr : arr.slice(-cap));
			const truncated =
				cap !== -1 &&
				(result.logs.length > cap ||
					result.pageErrors.length > cap ||
					result.requestFailures.length > cap);

			return JSON.stringify(
				{
					url: result.url,
					captured_at: result.capturedAt,
					logs: trunc(result.logs),
					page_errors: trunc(result.pageErrors),
					request_failures: trunc(result.requestFailures),
					truncated,
					totals: {
						logs: result.logs.length,
						page_errors: result.pageErrors.length,
						request_failures: result.requestFailures.length,
					},
					...(result.warning ? { warning: result.warning } : {}),
				},
				null,
				2,
			);
		},
	});
}
