#!/usr/bin/env node
/**
 * Local browser sidecar — drives Chromium with `puppeteer` and exposes
 * an HTTP API the worker calls in dev. Shares `runCapture` with the
 * in-worker `@cloudflare/puppeteer` path so behaviour is identical
 * across dev and prod.
 *
 * Start with `npm run dev:browser`. Binds to 127.0.0.1 only; never
 * exposed to the network. If the worker can't reach this sidecar in
 * dev, the tool returns a structured warning rather than throwing.
 */

import http from 'node:http';
import type { Browser, Page } from 'puppeteer';
import puppeteer from 'puppeteer';

import { runCapture } from '../worker/services/browser-capture/capture-core';
import type {
	CapturePage,
	CapturePayload,
} from '../worker/services/browser-capture/types';

const PORT = Number(process.env.PORT ?? 9223);
const HOST = '127.0.0.1';

let browserPromise: Promise<Browser> | undefined;

async function getBrowser(): Promise<Browser> {
	if (!browserPromise) {
		browserPromise = puppeteer.launch({
			headless: true,
			args: ['--no-sandbox', '--disable-setuid-sandbox'],
		});
		browserPromise.then(
			(b) => {
				b.on('disconnected', () => {
					console.warn('[dev-browser-sidecar] Chromium disconnected; will relaunch on next request');
					browserPromise = undefined;
				});
			},
			(e) => {
				console.error('[dev-browser-sidecar] failed to launch Chromium', e);
				browserPromise = undefined;
			},
		);
	}
	return browserPromise;
}

async function handleCapture(payload: CapturePayload) {
	const browser = await getBrowser();
	const page: Page = await browser.newPage();
	// puppeteer's Page satisfies the CapturePage structural type.
	return runCapture(page as unknown as CapturePage, payload);
}

function readBody(req: http.IncomingMessage): Promise<string> {
	return new Promise((resolve, reject) => {
		const chunks: Buffer[] = [];
		req.on('data', (c: Buffer) => chunks.push(c));
		req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
		req.on('error', reject);
	});
}

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
	res.statusCode = status;
	res.setHeader('content-type', 'application/json');
	res.end(JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
	try {
		if (req.method === 'GET' && req.url === '/health') {
			return sendJson(res, 200, { ok: true, version: 1 });
		}
		if (req.method === 'POST' && req.url === '/capture-console-logs') {
			const raw = await readBody(req);
			let payload: CapturePayload;
			try {
				payload = JSON.parse(raw) as CapturePayload;
			} catch (e) {
				return sendJson(res, 400, {
					error: `invalid JSON body: ${e instanceof Error ? e.message : String(e)}`,
				});
			}
			if (!payload?.url) {
				return sendJson(res, 400, { error: 'missing required field: url' });
			}
			const result = await handleCapture(payload);
			return sendJson(res, 200, result);
		}
		res.statusCode = 404;
		res.end();
	} catch (e) {
		console.error('[dev-browser-sidecar] request failed', e);
		sendJson(res, 500, {
			error: e instanceof Error ? e.message : 'capture failed',
		});
	}
});

server.listen(PORT, HOST, () => {
	console.log(`[dev-browser-sidecar] listening on http://${HOST}:${PORT}`);
	console.log('[dev-browser-sidecar] endpoints: GET /health, POST /capture-console-logs');
});

async function shutdown(signal: string) {
	console.log(`[dev-browser-sidecar] received ${signal}, shutting down`);
	try {
		const b = await browserPromise?.catch(() => undefined);
		await b?.close();
	} catch {
		// best effort
	}
	server.close(() => process.exit(0));
	setTimeout(() => process.exit(1), 5000).unref();
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
