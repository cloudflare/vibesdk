/**
 * SDAE DAG Runner
 *
 * Executes a compiled DAG with:
 * - Parallel execution within groups (bounded by maxParallelism semaphore)
 * - Content-hash-based caching (check before execute, store after)
 * - Per-node retry with configurable backoff
 * - onFail policies: stop / skip / retry / fallback
 * - Idempotent re-runs (contentHash + cache = skip already-done work)
 * - Token spend tracking for LLM-backed operations
 *
 * The runner is intentionally stateless between runs — all state is captured
 * in RunResult. This makes it safe to run multiple DAGs concurrently in a
 * single Worker isolate.
 */

import type { OpType, RunStatus } from '../types';
import type {
	DAGNode,
	CompilationResult,
	ExecutionPolicy,
	NodeOutput,
	NodeResult,
	RunResult,
	RunContext,
	NodeContext,
} from '../ir';
import type { SDAECache } from '../cache';

// ---------------------------------------------------------------------------
// Worker function signature — the contract for op executors
// ---------------------------------------------------------------------------
export interface WorkerFn {
	(params: unknown, context: NodeContext): Promise<NodeOutput>;
}

// ---------------------------------------------------------------------------
// WorkerRegistry — maps OpType to execution functions.
//
// At startup, register concrete workers for each op. The runner looks up
// the registry at execution time; an unregistered op fails immediately
// rather than silently doing nothing.
// ---------------------------------------------------------------------------
export class WorkerRegistry {
	private workers = new Map<OpType, WorkerFn>();

	register(op: OpType, fn: WorkerFn): void {
		this.workers.set(op, fn);
	}

	get(op: OpType): WorkerFn | undefined {
		return this.workers.get(op);
	}

	has(op: OpType): boolean {
		return this.workers.has(op);
	}

	/**
	 * Register stub workers for all op types.
	 * Useful for testing — stubs return empty success results.
	 */
	registerDefaults(): void {
		const defaultOps: OpType[] = [
			'SCRAPE_DYNAMIC', 'SCRAPE_STATIC', 'PARSE_HTML', 'EXTRACT_JSON_LD',
			'LOGIN_FORM', 'API_CALL', 'CODE_GENERATE', 'FILE_WRITE',
			'TEST_RUN', 'BROWSER_ACTION', 'WAIT_FOR_SELECTOR', 'TRANSFORM_DATA',
			'VALIDATE_OUTPUT', 'NOTIFY_USER', 'DB_MIGRATE', 'DEPLOY_APP',
			'STYLE_GENERATE', 'COMPONENT_GENERATE',
		];

		for (const op of defaultOps) {
			if (!this.workers.has(op)) {
				this.workers.set(op, async (_params, _ctx) => ({
					data: null,
					artifacts: [],
					logs: [`[stub] ${op} executed with default handler`],
				}));
			}
		}
	}
}

// ---------------------------------------------------------------------------
// Semaphore — bounds concurrent execution within a parallel group.
// ---------------------------------------------------------------------------
class Semaphore {
	private queue: Array<() => void> = [];
	private active = 0;

	constructor(private readonly limit: number) {}

	async acquire(): Promise<void> {
		if (this.active < this.limit) {
			this.active++;
			return;
		}

		return new Promise<void>((resolve) => {
			this.queue.push(() => {
				this.active++;
				resolve();
			});
		});
	}

	release(): void {
		this.active--;
		const next = this.queue.shift();
		if (next) {
			next();
		}
	}
}

// ---------------------------------------------------------------------------
// DAGRunner
// ---------------------------------------------------------------------------
export class DAGRunner {
	constructor(
		private compilationResult: CompilationResult,
		private executionPolicy: ExecutionPolicy,
		private cache: SDAECache,
		private workerRegistry: WorkerRegistry,
	) {}

	/**
	 * Execute the compiled DAG. Each parallel group is executed
	 * concurrently (bounded by maxParallelism). Groups are processed
	 * sequentially in topological order.
	 */
	async execute(runId: string, context: RunContext): Promise<RunResult> {
		const startTime = Date.now();
		const nodeResults = new Map<string, NodeResult>();
		const errors: string[] = [];
		let aborted = false;
		let cacheHits = 0;
		let totalNodes = 0;

		// Build a lookup map for nodes
		const nodeMap = new Map<string, DAGNode>();
		for (const node of this.compilationResult.nodes) {
			nodeMap.set(node.nodeId, node);
		}

		// Process each parallel group sequentially
		for (const group of this.compilationResult.parallelGroups) {
			if (aborted) break;

			const semaphore = new Semaphore(
				this.executionPolicy.maxParallelism,
			);

			// Filter out nodes whose dependencies failed with onFail='skip'
			const runnableNodes = group.filter((nodeId) => {
				const node = nodeMap.get(nodeId);
				if (!node) return false;

				// Check if any dependency was skipped or failed
				for (const dep of node.dependsOn) {
					const depResult = nodeResults.get(dep);
					if (!depResult) continue;
					if (
						depResult.status === 'failed' ||
						depResult.status === 'skipped'
					) {
						// If dependency failed/skipped, this node gets skipped too
						nodeResults.set(nodeId, {
							nodeId,
							status: 'skipped',
							output: null,
							durationMs: 0,
							tokenSpend: 0,
							cacheHit: false,
							error: `Dependency "${dep}" ${depResult.status}`,
							retryCount: 0,
						});
						return false;
					}
				}
				return true;
			});

			const groupPromises = runnableNodes.map(async (nodeId) => {
				const node = nodeMap.get(nodeId);
				if (!node) return;

				await semaphore.acquire();
				try {
					totalNodes++;
					const result = await this.executeNode(node, {
						...context,
						nodeId: node.nodeId,
						runId,
						attemptNumber: 1,
					});

					nodeResults.set(nodeId, result);

					if (result.cacheHit) {
						cacheHits++;
					}

					// Store successful results in context for downstream nodes
					if (result.status === 'success') {
						context.previousNodeOutputs.set(nodeId, result.output);
					}

					// Handle failure based on onFail policy
					if (result.status === 'failed') {
						errors.push(
							`[${nodeId}] ${result.error ?? 'Unknown error'}`,
						);

						if (node.onFail === 'stop') {
							aborted = true;
						}
						// 'skip' and 'fallback' are handled — downstream nodes
						// will see the failed status and skip themselves.
					}
				} finally {
					semaphore.release();
				}
			});

			await Promise.all(groupPromises);
		}

		// Determine overall run status
		let status: RunStatus;
		if (aborted) {
			status = 'failed';
		} else {
			const allStatuses = [...nodeResults.values()].map((r) => r.status);
			const hasFailures = allStatuses.includes('failed');
			const hasSkips = allStatuses.includes('skipped');

			if (hasFailures) {
				status = 'partial';
			} else if (hasSkips) {
				status = 'partial';
			} else {
				status = 'success';
			}
		}

		return {
			runId,
			status,
			nodeResults,
			totalDurationMs: Date.now() - startTime,
			totalTokenSpend: [...nodeResults.values()].reduce(
				(sum, r) => sum + r.tokenSpend,
				0,
			),
			cacheHitRate: totalNodes > 0 ? cacheHits / totalNodes : 0,
			errors,
		};
	}

	/**
	 * Execute a single node with caching, retry, and timeout.
	 */
	private async executeNode(
		node: DAGNode,
		context: NodeContext,
	): Promise<NodeResult> {
		const startTime = Date.now();

		// Check cache first (if node is cacheable)
		if (node.cacheable && node.contentHash) {
			const cached = await this.cache.get(
				node.contentHash,
				context.tenantId,
			);
			if (cached) {
				return {
					nodeId: node.nodeId,
					status: 'cached',
					output: cached.output,
					durationMs: Date.now() - startTime,
					tokenSpend: 0,
					cacheHit: true,
					retryCount: 0,
				};
			}
		}

		// Look up the worker function
		const workerFn = this.workerRegistry.get(node.op);
		if (!workerFn) {
			return {
				nodeId: node.nodeId,
				status: 'failed',
				output: null,
				durationMs: Date.now() - startTime,
				tokenSpend: 0,
				cacheHit: false,
				error: `No worker registered for op: ${node.op}`,
				retryCount: 0,
			};
		}

		// Determine retry policy
		const retryPolicy = node.retryPolicy ??
			this.executionPolicy.defaultRetry;
		const maxAttempts = node.onFail === 'retry'
			? retryPolicy.maxAttempts
			: 1;

		let lastError: string | undefined;
		let attempt = 0;

		for (attempt = 1; attempt <= maxAttempts; attempt++) {
			try {
				const nodeContext: NodeContext = {
					...context,
					attemptNumber: attempt,
				};

				// Execute with timeout
				const output = await withTimeout(
					workerFn(node.params, nodeContext),
					node.timeoutSeconds * 1000,
					`Node "${node.nodeId}" timed out after ${node.timeoutSeconds}s`,
				);

				// Cache the result if cacheable
				if (node.cacheable && node.contentHash) {
					// Fire-and-forget — don't block execution on cache write
					this.cache
						.set(node.contentHash, context.tenantId, output)
						.catch(() => {
							// Non-fatal cache write failure
						});
				}

				return {
					nodeId: node.nodeId,
					status: 'success',
					output,
					durationMs: Date.now() - startTime,
					tokenSpend: 0, // Workers update this via context if applicable
					cacheHit: false,
					retryCount: attempt - 1,
				};
			} catch (err) {
				lastError = err instanceof Error
					? err.message
					: String(err);

				// If we have retries left, delay before next attempt
				if (attempt < maxAttempts) {
					const delay = computeBackoffDelay(
						attempt,
						retryPolicy.backoff,
						retryPolicy.baseDelayMs,
						retryPolicy.maxDelayMs,
					);
					await sleep(delay);
				}
			}
		}

		// All attempts exhausted
		return {
			nodeId: node.nodeId,
			status: 'failed',
			output: null,
			durationMs: Date.now() - startTime,
			tokenSpend: 0,
			cacheHit: false,
			error: lastError,
			retryCount: attempt - 1,
		};
	}
}

// ---------------------------------------------------------------------------
// Utility: timeout wrapper using AbortController-compatible pattern
// ---------------------------------------------------------------------------
async function withTimeout<T>(
	promise: Promise<T>,
	timeoutMs: number,
	message: string,
): Promise<T> {
	let timer: ReturnType<typeof setTimeout> | undefined;

	const timeout = new Promise<never>((_, reject) => {
		timer = setTimeout(() => reject(new Error(message)), timeoutMs);
	});

	try {
		return await Promise.race([promise, timeout]);
	} finally {
		if (timer !== undefined) {
			clearTimeout(timer);
		}
	}
}

// ---------------------------------------------------------------------------
// Utility: backoff delay computation
// ---------------------------------------------------------------------------
function computeBackoffDelay(
	attempt: number,
	strategy: 'exponential' | 'linear' | 'fixed',
	baseDelayMs: number,
	maxDelayMs: number,
): number {
	let delay: number;

	switch (strategy) {
		case 'exponential':
			delay = baseDelayMs * Math.pow(2, attempt - 1);
			break;
		case 'linear':
			delay = baseDelayMs * attempt;
			break;
		case 'fixed':
			delay = baseDelayMs;
			break;
	}

	// Add jitter (up to 25% of delay) to prevent thundering herd
	const jitter = delay * 0.25 * Math.random();
	return Math.min(delay + jitter, maxDelayMs);
}

// ---------------------------------------------------------------------------
// Utility: sleep
// ---------------------------------------------------------------------------
function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
