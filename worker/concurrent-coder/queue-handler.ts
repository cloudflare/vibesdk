/**
 * Queue consumer for Concurrent Coder background jobs.
 *
 * Heavy agent work is offloaded to a Cloudflare Queue so the
 * main worker never blocks.  Each message is an AgentTask that
 * the orchestrator dispatches to the correct agent DO.
 */

import type { QueueJob } from './types';

/**
 * Process a batch of queue messages.
 * Each message contains a QueueJob with the agent task to run.
 */
export async function handleQueueBatch(
	batch: MessageBatch<QueueJob>,
	env: Env,
): Promise<void> {
	for (const msg of batch.messages) {
		try {
			const job = msg.body;

			// Abort check before processing
			const aborted = await env.CACHE.get(`abort:${job.sessionId}`);
			if (aborted === '1') {
				msg.ack();
				continue;
			}

			// Get the orchestrator stub and dispatch
			const orchestratorId = env.ORCHESTRATOR.idFromName(job.sessionId);
			const orchestrator = env.ORCHESTRATOR.get(orchestratorId);

			// Forward to the orchestrator's pipeline step handler
			const res = await orchestrator.fetch(
				new Request('https://orchestrator.internal/pipeline-step', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(job),
				}),
			);

			if (res.ok) {
				msg.ack();
			} else {
				msg.retry({ delaySeconds: 10 });
			}
		} catch {
			msg.retry({ delaySeconds: 30 });
		}
	}
}
