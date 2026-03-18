/**
 * Base class for all Concurrent Coder specialist agents.
 *
 * Provides:
 * - Abort-flag checking (crash-proof)
 * - Timeline event emission
 * - LLM call helper
 * - Superpower prompt injection
 */

import { DurableObject } from 'cloudflare:workers';
import { llmChat } from '../llm-router';
import { loadSuperpowerPrompts } from '../superpowers';
import type {
	AgentRequest,
	AgentResponse,
	AgentRole,
	LLMRequestOptions,
	LLMResponse,
	TimelineEvent,
} from '../types';

export abstract class BaseAgent extends DurableObject<Env> {
	abstract readonly role: AgentRole;

	/* ---------------------------------------------------------------- */
	/*  Fetch entry-point                                                */
	/* ---------------------------------------------------------------- */

	async fetch(request: Request): Promise<Response> {
		try {
			const body = (await request.json()) as AgentRequest;

			if (await this.isAborted(body.sessionId)) {
				return this.json({ status: 'aborted', agent: this.role });
			}

			await this.emitTimeline(body.sessionId, 'started', `${this.role} agent started`);

			const result = await this.run(body);

			await this.emitTimeline(body.sessionId, 'completed', `${this.role} agent completed`);

			return this.json(result);
		} catch (err: unknown) {
			// Log detailed error information server-side, but do not expose it to the client.
			if (err instanceof Error) {
				console.error('BaseAgent.fetch error:', err.message, err.stack);
			} else {
				console.error('BaseAgent.fetch error:', err);
			}

			// Return a generic error response to avoid leaking internal details.
			return this.json(
				{ status: 'error', agent: this.role, error: 'Internal error' },
				500,
			);
		}
	}

	/* ---------------------------------------------------------------- */
	/*  Abstract – each agent implements this                            */
	/* ---------------------------------------------------------------- */

	protected abstract run(req: AgentRequest): Promise<AgentResponse>;

	/* ---------------------------------------------------------------- */
	/*  Abort checking (crash-proof)                                     */
	/* ---------------------------------------------------------------- */

	protected async isAborted(sessionId: string): Promise<boolean> {
		const flag = await this.env.CACHE.get(`abort:${sessionId}`);
		return flag === '1';
	}

	protected async checkAbortOrThrow(sessionId: string): Promise<void> {
		if (await this.isAborted(sessionId)) {
			throw new Error('Session aborted');
		}
	}

	/* ---------------------------------------------------------------- */
	/*  LLM helpers                                                      */
	/* ---------------------------------------------------------------- */

	protected async callLLM(opts: LLMRequestOptions): Promise<LLMResponse> {
		return llmChat(this.env, opts);
	}

	protected async callLLMSimple(
		systemPrompt: string,
		userPrompt: string,
		complex = false,
	): Promise<string> {
		const res = await this.callLLM({
			model: complex ? this.env.COMPLEX_MODEL : this.env.DEFAULT_MODEL,
			messages: [
				{ role: 'system', content: systemPrompt },
				{ role: 'user', content: userPrompt },
			],
		});
		return res.content;
	}

	/* ---------------------------------------------------------------- */
	/*  Superpowers                                                      */
	/* ---------------------------------------------------------------- */

	protected async getSuperpowerPrompt(filenames?: string[]): Promise<string> {
		if (!filenames || filenames.length === 0) return '';
		return loadSuperpowerPrompts(this.env, filenames);
	}

	/* ---------------------------------------------------------------- */
	/*  Timeline events                                                  */
	/* ---------------------------------------------------------------- */

	protected async emitTimeline(
		sessionId: string,
		action: string,
		detail: string,
	): Promise<void> {
		const event: TimelineEvent = {
			id: crypto.randomUUID(),
			sessionId,
			agent: this.role,
			action,
			detail,
			timestamp: new Date().toISOString(),
		};

		// Store in KV for quick retrieval by the dashboard
		const key = `timeline:${sessionId}`;
		const existing = await this.env.CACHE.get(key);
		const events: TimelineEvent[] = existing ? JSON.parse(existing) : [];
		events.push(event);
		await this.env.CACHE.put(key, JSON.stringify(events), {
			expirationTtl: 86400, // 24 h
		});
	}

	/* ---------------------------------------------------------------- */
	/*  Utilities                                                        */
	/* ---------------------------------------------------------------- */

	protected json(data: unknown, status = 200): Response {
		return new Response(JSON.stringify(data), {
			status,
			headers: { 'Content-Type': 'application/json' },
		});
	}
}
