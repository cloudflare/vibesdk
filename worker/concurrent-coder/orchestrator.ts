/**
 * ConcurrentCoderOrchestrator – the brain of the swarm.
 *
 * Coordinates the 6 specialist agents through a pipeline:
 *   Architect → Coder → Tester → (Debugger loop) → Reviewer → Deployer
 *
 * Supports:
 * - Crash-proof abort flag checking before every step
 * - AUTO mode (continuous iteration until review threshold met)
 * - Queue offloading for heavy work
 * - Timeline event streaming for the dashboard
 */

import { DurableObject } from 'cloudflare:workers';
import type {
	AgentRequest,
	AgentResponse,
	QueueJob,
	ReviewResult,
	SessionStatus,
	TimelineEvent,
} from './types';

export class ConcurrentCoderOrchestrator extends DurableObject<Env> {
	/* ---------------------------------------------------------------- */
	/*  Fetch – API entry-point                                          */
	/* ---------------------------------------------------------------- */

	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);
		const method = request.method.toUpperCase();

		// POST /run – start a new coding session
		if (url.pathname === '/run' && method === 'POST') {
			return this.handleRun(request);
		}

		// POST /stop – abort a running session
		if (url.pathname === '/stop' && method === 'POST') {
			return this.handleStop(request);
		}

		// POST /auto – toggle auto mode
		if (url.pathname === '/auto' && method === 'POST') {
			return this.handleAuto(request);
		}

		// GET /timeline – get timeline events
		if (url.pathname === '/timeline' && method === 'GET') {
			const sessionId = url.searchParams.get('sessionId');
			if (!sessionId) return this.json({ error: 'sessionId required' }, 400);
			return this.getTimeline(sessionId);
		}

		// GET /status – get session status
		if (url.pathname === '/status' && method === 'GET') {
			const sessionId = url.searchParams.get('sessionId');
			if (!sessionId) return this.json({ error: 'sessionId required' }, 400);
			return this.getStatus(sessionId);
		}

		// POST /pipeline-step – called by queue consumer
		if (url.pathname === '/pipeline-step' && method === 'POST') {
			const job = (await request.json()) as QueueJob;
			await this.runPipelineStep(job);
			return this.json({ status: 'ok' });
		}

		return this.json({ error: 'Not found' }, 404);
	}

	/* ---------------------------------------------------------------- */
	/*  /run – kick off the full pipeline                                */
	/* ---------------------------------------------------------------- */

	private async handleRun(request: Request): Promise<Response> {
		const { prompt, superpowers } = (await request.json()) as {
			prompt: string;
			superpowers?: string[];
		};

		const sessionId = crypto.randomUUID();

		// Persist session in D1
		await this.env.DB.prepare(
			'INSERT INTO coder_sessions (id, prompt, status, created_at) VALUES (?, ?, ?, ?)',
		)
			.bind(sessionId, prompt, 'running', new Date().toISOString())
			.run();

		// Clear any stale abort/auto flags
		await this.env.CACHE.delete(`abort:${sessionId}`);
		await this.env.CACHE.put(`auto:${sessionId}`, '0');

		// Emit start event
		await this.emitTimeline(sessionId, 'orchestrator', 'session-started', `Session started for: ${prompt.substring(0, 100)}`);

		// Enqueue the pipeline as a background job
		const job: QueueJob = {
			type: 'agent-task',
			sessionId,
			agent: 'architect', // first step
			payload: { sessionId, spec: prompt, superpowers },
		};

		await this.env.BG_QUEUE.send(job);

		return this.json({ sessionId, status: 'running' });
	}

	/* ---------------------------------------------------------------- */
	/*  /stop – set abort flag                                           */
	/* ---------------------------------------------------------------- */

	private async handleStop(request: Request): Promise<Response> {
		const { sessionId } = (await request.json()) as { sessionId: string };
		await this.env.CACHE.put(`abort:${sessionId}`, '1', { expirationTtl: 3600 });
		await this.updateSessionStatus(sessionId, 'aborted');
		await this.emitTimeline(sessionId, 'orchestrator', 'aborted', 'Session aborted by user');
		return this.json({ status: 'aborted' });
	}

	/* ---------------------------------------------------------------- */
	/*  /auto – toggle auto-continue                                     */
	/* ---------------------------------------------------------------- */

	private async handleAuto(request: Request): Promise<Response> {
		const { sessionId, enabled } = (await request.json()) as {
			sessionId: string;
			enabled: boolean;
		};
		await this.env.CACHE.put(`auto:${sessionId}`, enabled ? '1' : '0', {
			expirationTtl: 3600,
		});
		return this.json({ auto: enabled });
	}

	/* ---------------------------------------------------------------- */
	/*  Pipeline step dispatcher (called from queue consumer)            */
	/* ---------------------------------------------------------------- */

	async runPipelineStep(job: QueueJob): Promise<void> {
		const { sessionId, agent, payload } = job;

		// Abort check
		const aborted = await this.env.CACHE.get(`abort:${sessionId}`);
		if (aborted === '1') {
			await this.updateSessionStatus(sessionId, 'aborted');
			return;
		}

		// Call the agent DO
		const result = await this.callAgent(agent, payload);
		if (result.status === 'aborted') {
			await this.updateSessionStatus(sessionId, 'aborted');
			return;
		}
		if (result.status === 'error') {
			await this.emitTimeline(sessionId, 'orchestrator', 'error', `${agent} failed: ${result.error}`);
			await this.updateSessionStatus(sessionId, 'failed');
			return;
		}

		// Determine next step
		const nextJob = await this.getNextStep(agent, sessionId, payload, result);
		if (nextJob) {
			await this.env.BG_QUEUE.send(nextJob);
		} else {
			await this.updateSessionStatus(sessionId, 'completed');
			await this.emitTimeline(sessionId, 'orchestrator', 'completed', 'Pipeline completed');
		}
	}

	/* ---------------------------------------------------------------- */
	/*  Pipeline logic – determine next step                             */
	/* ---------------------------------------------------------------- */

	private async getNextStep(
		currentAgent: string,
		sessionId: string,
		prevPayload: AgentRequest,
		result: AgentResponse,
	): Promise<QueueJob | null> {
		const data = result.result as Record<string, unknown>;

		switch (currentAgent) {
			case 'architect':
				return {
					type: 'agent-task',
					sessionId,
					agent: 'coder',
					payload: {
						...prevPayload,
						architecture: data.architecture as string,
					},
				};

			case 'coder':
				return {
					type: 'agent-task',
					sessionId,
					agent: 'tester',
					payload: {
						...prevPayload,
						code: data.code as string,
					},
				};

			case 'tester': {
				// Parse test results to check for failures
				const testResultStr = data.testResults as string;
				let hasFailing = false;
				try {
					const parsed = JSON.parse(testResultStr);
					hasFailing = parsed.passRate < 1;
				} catch {
					hasFailing = testResultStr.toLowerCase().includes('fail');
				}

				if (hasFailing) {
					const iteration = (prevPayload.iteration ?? 0) + 1;
					const maxIterations = parseInt(this.env.MAX_DEBUG_ITERATIONS || '5', 10);

					if (iteration <= maxIterations) {
						return {
							type: 'agent-task',
							sessionId,
							agent: 'debugger',
							payload: {
								...prevPayload,
								testResults: testResultStr,
								iteration,
							},
						};
					}
				}

				// Tests pass (or max debug iterations reached) → reviewer
				return {
					type: 'agent-task',
					sessionId,
					agent: 'reviewer',
					payload: { ...prevPayload },
				};
			}

			case 'debugger':
				// Feed debug info back to coder
				return {
					type: 'agent-task',
					sessionId,
					agent: 'coder',
					payload: {
						...prevPayload,
						debugInfo: data.debugInfo as string,
					},
				};

			case 'reviewer': {
				const review = result.result as ReviewResult;
				const threshold = parseInt(this.env.REVIEW_THRESHOLD || '80', 10);

				// Store review in vectorize for long-term memory
				try {
					const vec = new Array(768).fill(0).map(() => Math.random());
					await this.env.VECTORIZE_INDEX.upsert([
						{
							id: sessionId,
							values: vec,
							metadata: { score: review.score, sessionId },
						},
					]);
				} catch {
					// Vectorize may not be available in dev
				}

				if (review.score >= threshold) {
					// Score meets threshold → deploy
					return {
						type: 'agent-task',
						sessionId,
						agent: 'deployer',
						payload: { ...prevPayload, reviewResult: review },
					};
				}

				// Score below threshold – check AUTO mode
				const autoMode = await this.env.CACHE.get(`auto:${sessionId}`);
				if (autoMode === '1') {
					await this.emitTimeline(
						sessionId,
						'orchestrator',
						'auto-iterate',
						`Review score ${review.score} < ${threshold}, auto-iterating`,
					);
					return {
						type: 'agent-task',
						sessionId,
						agent: 'coder',
						payload: { ...prevPayload, reviewResult: review },
					};
				}

				// Not in auto mode – pause and wait for user
				await this.updateSessionStatus(sessionId, 'paused');
				await this.emitTimeline(
					sessionId,
					'orchestrator',
					'paused',
					`Review score ${review.score} < ${threshold}. Enable AUTO or manually continue.`,
				);
				return null;
			}

			case 'deployer':
				// Terminal step
				return null;

			default:
				return null;
		}
	}

	/* ---------------------------------------------------------------- */
	/*  Agent caller                                                     */
	/* ---------------------------------------------------------------- */

	private async callAgent(
		agent: string,
		payload: AgentRequest,
	): Promise<AgentResponse> {
		const getNamespace = (name: string): DurableObjectNamespace => {
			const map: Record<string, DurableObjectNamespace> = {
				architect: this.env.ARCHITECT as unknown as DurableObjectNamespace,
				coder: this.env.CODER as unknown as DurableObjectNamespace,
				tester: this.env.TESTER as unknown as DurableObjectNamespace,
				debugger: this.env.DEBUGGER as unknown as DurableObjectNamespace,
				reviewer: this.env.REVIEWER as unknown as DurableObjectNamespace,
				deployer: this.env.DEPLOYER as unknown as DurableObjectNamespace,
			};
			const ns = map[name];
			if (!ns) throw new Error(`Unknown agent: ${name}`);
			return ns;
		};

		const ns = getNamespace(agent);
		const id = ns.idFromName(payload.sessionId);
		const stub = ns.get(id);

		const res = await stub.fetch(new Request('https://agent.internal/run', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload),
		}));

		return (await res.json()) as AgentResponse;
	}

	/* ---------------------------------------------------------------- */
	/*  Timeline & status helpers                                        */
	/* ---------------------------------------------------------------- */

	private async emitTimeline(
		sessionId: string,
		agent: string,
		action: string,
		detail: string,
	): Promise<void> {
		const event: TimelineEvent = {
			id: crypto.randomUUID(),
			sessionId,
			agent: agent as TimelineEvent['agent'],
			action,
			detail,
			timestamp: new Date().toISOString(),
		};

		const key = `timeline:${sessionId}`;
		const existing = await this.env.CACHE.get(key);
		const events: TimelineEvent[] = existing ? JSON.parse(existing) : [];
		events.push(event);
		await this.env.CACHE.put(key, JSON.stringify(events), { expirationTtl: 86400 });
	}

	private async getTimeline(sessionId: string): Promise<Response> {
		const key = `timeline:${sessionId}`;
		const raw = await this.env.CACHE.get(key);
		const events: TimelineEvent[] = raw ? JSON.parse(raw) : [];
		return this.json(events);
	}

	private async getStatus(sessionId: string): Promise<Response> {
		const row = await this.env.DB.prepare(
			'SELECT id, prompt, status, created_at FROM coder_sessions WHERE id = ?',
		)
			.bind(sessionId)
			.first();
		if (!row) return this.json({ error: 'Session not found' }, 404);
		return this.json(row);
	}

	private async updateSessionStatus(
		sessionId: string,
		status: SessionStatus,
	): Promise<void> {
		await this.env.DB.prepare('UPDATE coder_sessions SET status = ? WHERE id = ?')
			.bind(status, sessionId)
			.run();
	}

	/* ---------------------------------------------------------------- */
	/*  Utilities                                                        */
	/* ---------------------------------------------------------------- */

	private json(data: unknown, status = 200): Response {
		return new Response(JSON.stringify(data), {
			status,
			headers: { 'Content-Type': 'application/json' },
		});
	}
}
