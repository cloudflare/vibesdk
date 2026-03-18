/**
 * API routes for the Concurrent Coder feature.
 *
 * Proxies requests to the Orchestrator DO and provides
 * history / erase / superpowers management endpoints.
 */

import { Hono } from 'hono';
import type { AppEnv } from '../../types/appenv';
import {
	listSuperpowers,
	uploadSuperpower,
	deleteSuperpower,
} from '../../concurrent-coder/superpowers';
import type { EraseRequest } from '../../concurrent-coder/types';

export function setupConcurrentCoderRoutes(app: Hono<AppEnv>): void {
	const base = '/api/cc';

	/* -------------------------------------------------------------- */
	/*  Session management (proxied to Orchestrator DO)                */
	/* -------------------------------------------------------------- */

	// Start a new coding session
	app.post(`${base}/run`, async (c) => {
		const env = c.env as unknown as Env;
		const id = env.ORCHESTRATOR.idFromName('global');
		const stub = env.ORCHESTRATOR.get(id);
		const res = await stub.fetch(
			new Request('https://orchestrator.internal/run', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: await c.req.text(),
			}),
		);
		return new Response(res.body, { status: res.status, headers: res.headers });
	});

	// Stop (abort) a session
	app.post(`${base}/stop`, async (c) => {
		const env = c.env as unknown as Env;
		const id = env.ORCHESTRATOR.idFromName('global');
		const stub = env.ORCHESTRATOR.get(id);
		const res = await stub.fetch(
			new Request('https://orchestrator.internal/stop', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: await c.req.text(),
			}),
		);
		return new Response(res.body, { status: res.status, headers: res.headers });
	});

	// Toggle AUTO mode
	app.post(`${base}/auto`, async (c) => {
		const env = c.env as unknown as Env;
		const id = env.ORCHESTRATOR.idFromName('global');
		const stub = env.ORCHESTRATOR.get(id);
		const res = await stub.fetch(
			new Request('https://orchestrator.internal/auto', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: await c.req.text(),
			}),
		);
		return new Response(res.body, { status: res.status, headers: res.headers });
	});

	// Get timeline events for a session
	app.get(`${base}/timeline`, async (c) => {
		const env = c.env as unknown as Env;
		const sessionId = c.req.query('sessionId');
		if (!sessionId) return c.json({ error: 'sessionId required' }, 400);

		const id = env.ORCHESTRATOR.idFromName('global');
		const stub = env.ORCHESTRATOR.get(id);
		const res = await stub.fetch(
			new Request(`https://orchestrator.internal/timeline?sessionId=${sessionId}`),
		);
		return new Response(res.body, { status: res.status, headers: res.headers });
	});

	// Get session status
	app.get(`${base}/status`, async (c) => {
		const env = c.env as unknown as Env;
		const sessionId = c.req.query('sessionId');
		if (!sessionId) return c.json({ error: 'sessionId required' }, 400);

		const id = env.ORCHESTRATOR.idFromName('global');
		const stub = env.ORCHESTRATOR.get(id);
		const res = await stub.fetch(
			new Request(`https://orchestrator.internal/status?sessionId=${sessionId}`),
		);
		return new Response(res.body, { status: res.status, headers: res.headers });
	});

	/* -------------------------------------------------------------- */
	/*  History & Erase                                                 */
	/* -------------------------------------------------------------- */

	app.get(`${base}/history`, async (c) => {
		const env = c.env as unknown as Env;
		const sessions = await env.DB.prepare(
			'SELECT id, prompt, status, created_at FROM cc_sessions ORDER BY created_at DESC',
		).all();
		return c.json(sessions.results);
	});

	app.post(`${base}/erase`, async (c) => {
		const env = c.env as unknown as Env;
		const { sessionIds, eraseLongTerm } = (await c.req.json()) as EraseRequest;

		if (!sessionIds || sessionIds.length === 0) {
			return c.json({ error: 'No sessions specified' }, 400);
		}

		// Delete from D1
		const placeholders = sessionIds.map(() => '?').join(',');
		await env.DB.prepare(
			`DELETE FROM cc_sessions WHERE id IN (${placeholders})`,
		)
			.bind(...sessionIds)
			.run();

		// Clean up KV
		for (const sid of sessionIds) {
			await env.CACHE.delete(`abort:${sid}`);
			await env.CACHE.delete(`auto:${sid}`);
			await env.CACHE.delete(`timeline:${sid}`);
		}

		// Optionally erase long-term memory (Vectorize embeddings)
		if (eraseLongTerm) {
			try {
				await env.VECTORIZE_INDEX.deleteByIds(sessionIds);
			} catch {
				// Vectorize may not be available in dev
			}
		}

		return c.json({ status: 'erased', count: sessionIds.length });
	});

	/* -------------------------------------------------------------- */
	/*  Superpowers / Skills Manager                                    */
	/* -------------------------------------------------------------- */

	app.get(`${base}/superpowers`, async (c) => {
		const env = c.env as unknown as Env;
		const powers = await listSuperpowers(env);
		return c.json(powers);
	});

	app.post(`${base}/superpowers`, async (c) => {
		const env = c.env as unknown as Env;
		const { filename, content } = (await c.req.json()) as {
			filename: string;
			content: string;
		};
		if (!filename || !content) {
			return c.json({ error: 'filename and content required' }, 400);
		}
		await uploadSuperpower(env, filename, content);
		return c.json({ status: 'uploaded', filename });
	});

	app.delete(`${base}/superpowers/:filename`, async (c) => {
		const env = c.env as unknown as Env;
		const filename = c.req.param('filename');
		await deleteSuperpower(env, filename);
		return c.json({ status: 'deleted', filename });
	});
}
