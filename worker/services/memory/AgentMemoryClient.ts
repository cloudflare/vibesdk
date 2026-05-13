/**
 * AgentMemoryClient — Cloudflare-native MemoryClient implementation (ADR-004).
 *
 * Adapts the Cloudflare Agent Memory primitive (shipped Q2 2026 during
 * Cloudflare Agents Week). Uses the platform's Session API:
 *   - one DO per user, sqlite-backed
 *   - tagged "blocks" with persistent system-prompt-style addressing
 *   - hybrid recall: vector + BM25 + tag filter
 *
 * Binding is NOT yet provisioned in wrangler.jsonc — see TODO(S2-provision)
 * at the bottom. Until then, every method returns the safe no-op result so
 * generation flows can call `recall()` unconditionally without crashing.
 *
 * Error policy (per `worker/services/memory/types.ts`):
 *   - recall  → []         on missing binding / network error
 *   - remember → null      on missing binding / network error
 *   - forget   → false     on missing binding / network error
 *
 * Design note: the binding shape is loose-typed via `unknown` lookup so this
 * file compiles BEFORE `npm run cf-typegen` adds `AGENT_MEMORY` to the typed
 * Env. After provisioning, swap the loose lookup for a typed access. Same
 * pattern as `worker/cron/benchmarkRunner.ts` `getBenchmarkKv()`.
 */

import { createLogger } from '../../logger';
import {
    DEFAULT_RECALL_K,
    type MemoryBlock,
    type MemoryBlockInput,
    type MemoryClient,
    type MemoryRecallQuery,
} from './types';

const logger = createLogger('AgentMemoryClient');

/**
 * Surface mirroring the CF Agent Memory Session API contract published in
 * the Agents Week 2026 docs. Methods correspond 1:1 to the upstream RPC.
 *
 * Kept private (not exported) so callers depend only on `MemoryClient`.
 */
interface CfAgentMemoryBinding {
    readonly get: (userId: string) => CfAgentMemorySession;
}

interface CfAgentMemorySession {
    recall(query: string, opts: { k: number; tag?: string }): Promise<
        readonly { id: string; tag: string; content: string; metadata?: Record<string, string | number | boolean>; createdAt?: number }[]
    >;
    remember(block: { tag: string; content: string; metadata?: Record<string, string | number | boolean> }): Promise<{ id: string; createdAt?: number } | null>;
    forget(blockId: string): Promise<boolean>;
}

export class AgentMemoryClient implements MemoryClient {
    private readonly binding: CfAgentMemoryBinding | null;

    constructor(env: Env) {
        this.binding = getAgentMemoryBinding(env);
        if (!this.binding) {
            logger.warn(
                'AGENT_MEMORY binding missing — running in stub mode. ' +
                'Provision via wrangler.jsonc once the CF Agent Memory namespace ' +
                'is enabled on this account (see ADR-004 §Implementation).',
            );
        }
    }

    async recall(q: MemoryRecallQuery): Promise<readonly MemoryBlock[]> {
        if (!this.binding) return [];
        const session = this.binding.get(q.userId);
        try {
            const rows = await session.recall(q.query, {
                k: q.k ?? DEFAULT_RECALL_K,
                tag: q.tag,
            });
            return rows.map((r) => ({
                id: r.id,
                userId: q.userId,
                tag: r.tag,
                content: r.content,
                metadata: r.metadata,
                createdAt: r.createdAt,
            }));
        } catch (err) {
            logger.warn('recall failed — returning []', {
                userId: q.userId,
                tag: q.tag ?? null,
                error: errorMessage(err),
            });
            return [];
        }
    }

    async remember(block: MemoryBlockInput): Promise<MemoryBlock | null> {
        if (!this.binding) return null;
        const session = this.binding.get(block.userId);
        try {
            const result = await session.remember({
                tag: block.tag,
                content: block.content,
                metadata: block.metadata as Record<string, string | number | boolean> | undefined,
            });
            if (!result) return null;
            return {
                id: result.id,
                userId: block.userId,
                tag: block.tag,
                content: block.content,
                metadata: block.metadata,
                createdAt: result.createdAt,
            };
        } catch (err) {
            logger.warn('remember failed — returning null', {
                userId: block.userId,
                tag: block.tag,
                error: errorMessage(err),
            });
            return null;
        }
    }

    async forget(userId: string, blockId: string): Promise<boolean> {
        if (!this.binding) return false;
        try {
            return await this.binding.get(userId).forget(blockId);
        } catch (err) {
            logger.warn('forget failed — returning false', {
                userId,
                blockId,
                error: errorMessage(err),
            });
            return false;
        }
    }
}

function errorMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}

/**
 * Loose lookup so this module compiles before `npm run cf-typegen` regenerates
 * `worker-configuration.d.ts` with the AGENT_MEMORY field.
 *
 * TODO(S2-provision):
 *   1. wrangler.jsonc → add `agent_memory_namespace` binding once CF Agent
 *      Memory is GA on this account.
 *   2. `npm run cf-typegen` to type Env.AGENT_MEMORY.
 *   3. Replace this helper with a direct `env.AGENT_MEMORY` reference.
 */
function getAgentMemoryBinding(env: Env): CfAgentMemoryBinding | null {
    const candidate = (env as unknown as Record<string, unknown>).AGENT_MEMORY;
    if (
        candidate &&
        typeof candidate === 'object' &&
        typeof (candidate as CfAgentMemoryBinding).get === 'function'
    ) {
        return candidate as CfAgentMemoryBinding;
    }
    return null;
}
