/**
 * Concurrent Coder Controller
 *
 * Handles all CC API endpoints following the adaptController pattern
 * so that authentication is properly enforced.
 */

import { BaseController } from '../baseController';
import type { RouteContext } from '../../types/route-context';
import {
	listSuperpowers,
	uploadSuperpower,
	deleteSuperpower,
} from '../../../concurrent-coder/superpowers';
import type { EraseRequest } from '../../../concurrent-coder/types';

export class ConcurrentCoderController extends BaseController {
	/* ---------------------------------------------------------------- */
	/*  Session management (proxied to Orchestrator DO)                  */
	/* ---------------------------------------------------------------- */

	static async runSession(
		request: Request,
		env: Env,
		_ctx: ExecutionContext,
		_context: RouteContext,
	): Promise<Response> {
		const id = env.ORCHESTRATOR.idFromName('global');
		const stub = env.ORCHESTRATOR.get(id);
		const res = await stub.fetch(
			new Request('https://orchestrator.internal/run', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: await request.text(),
			}),
		);
		const data = await res.json() as Record<string, unknown>;
		if (!res.ok) return ConcurrentCoderController.createErrorResponse((data.error as string) || 'Run failed', res.status);
		return ConcurrentCoderController.createSuccessResponse(data);
	}

	static async stopSession(
		request: Request,
		env: Env,
		_ctx: ExecutionContext,
		_context: RouteContext,
	): Promise<Response> {
		const id = env.ORCHESTRATOR.idFromName('global');
		const stub = env.ORCHESTRATOR.get(id);
		const res = await stub.fetch(
			new Request('https://orchestrator.internal/stop', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: await request.text(),
			}),
		);
		const data = await res.json() as Record<string, unknown>;
		if (!res.ok) return ConcurrentCoderController.createErrorResponse((data.error as string) || 'Stop failed', res.status);
		return ConcurrentCoderController.createSuccessResponse(data);
	}

	static async toggleAuto(
		request: Request,
		env: Env,
		_ctx: ExecutionContext,
		_context: RouteContext,
	): Promise<Response> {
		const id = env.ORCHESTRATOR.idFromName('global');
		const stub = env.ORCHESTRATOR.get(id);
		const res = await stub.fetch(
			new Request('https://orchestrator.internal/auto', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: await request.text(),
			}),
		);
		const data = await res.json() as Record<string, unknown>;
		if (!res.ok) return ConcurrentCoderController.createErrorResponse((data.error as string) || 'Auto toggle failed', res.status);
		return ConcurrentCoderController.createSuccessResponse(data);
	}

	static async getTimeline(
		_request: Request,
		env: Env,
		_ctx: ExecutionContext,
		context: RouteContext,
	): Promise<Response> {
		const sessionId = context.queryParams.get('sessionId');
		if (!sessionId) {
			return ConcurrentCoderController.createErrorResponse('sessionId required', 400);
		}

		const id = env.ORCHESTRATOR.idFromName('global');
		const stub = env.ORCHESTRATOR.get(id);
		const res = await stub.fetch(
			new Request(`https://orchestrator.internal/timeline?sessionId=${sessionId}`),
		);
		const data = await res.json() as Record<string, unknown>;
		if (!res.ok) return ConcurrentCoderController.createErrorResponse((data.error as string) || 'Timeline failed', res.status);
		return ConcurrentCoderController.createSuccessResponse(data);
	}

	static async getStatus(
		_request: Request,
		env: Env,
		_ctx: ExecutionContext,
		context: RouteContext,
	): Promise<Response> {
		const sessionId = context.queryParams.get('sessionId');
		if (!sessionId) {
			return ConcurrentCoderController.createErrorResponse('sessionId required', 400);
		}

		const id = env.ORCHESTRATOR.idFromName('global');
		const stub = env.ORCHESTRATOR.get(id);
		const res = await stub.fetch(
			new Request(`https://orchestrator.internal/status?sessionId=${sessionId}`),
		);
		const data = await res.json() as Record<string, unknown>;
		if (!res.ok) return ConcurrentCoderController.createErrorResponse((data.error as string) || 'Status failed', res.status);
		return ConcurrentCoderController.createSuccessResponse(data);
	}

	/* ---------------------------------------------------------------- */
	/*  History & Erase                                                  */
	/* ---------------------------------------------------------------- */

	static async getHistory(
		_request: Request,
		env: Env,
		_ctx: ExecutionContext,
		_context: RouteContext,
	): Promise<Response> {
		const sessions = await env.DB.prepare(
			'SELECT id, prompt, status, created_at FROM cc_sessions ORDER BY created_at DESC',
		).all();
		return ConcurrentCoderController.createSuccessResponse(sessions.results);
	}

	static async eraseSessions(
		request: Request,
		env: Env,
		_ctx: ExecutionContext,
		_context: RouteContext,
	): Promise<Response> {
		const body = await request.json() as EraseRequest;
		const { sessionIds, eraseLongTerm } = body;

		if (!sessionIds || sessionIds.length === 0) {
			return ConcurrentCoderController.createErrorResponse('No sessions specified', 400);
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

		return ConcurrentCoderController.createSuccessResponse({ status: 'erased', count: sessionIds.length });
	}

	/* ---------------------------------------------------------------- */
	/*  Superpowers / Skills Manager                                     */
	/* ---------------------------------------------------------------- */

	static async listSkills(
		_request: Request,
		env: Env,
		_ctx: ExecutionContext,
		_context: RouteContext,
	): Promise<Response> {
		const powers = await listSuperpowers(env);
		return ConcurrentCoderController.createSuccessResponse(powers);
	}

	static async uploadSkill(
		request: Request,
		env: Env,
		_ctx: ExecutionContext,
		_context: RouteContext,
	): Promise<Response> {
		const { filename, content } = await request.json() as {
			filename: string;
			content: string;
		};
		if (!filename || !content) {
			return ConcurrentCoderController.createErrorResponse('filename and content required', 400);
		}
		await uploadSuperpower(env, filename, content);
		return ConcurrentCoderController.createSuccessResponse({ status: 'uploaded', filename });
	}

	static async deleteSkill(
		_request: Request,
		env: Env,
		_ctx: ExecutionContext,
		context: RouteContext,
	): Promise<Response> {
		const filename = context.pathParams.filename;
		if (!filename) {
			return ConcurrentCoderController.createErrorResponse('filename required', 400);
		}
		await deleteSuperpower(env, filename);
		return ConcurrentCoderController.createSuccessResponse({ status: 'deleted', filename });
	}
}
