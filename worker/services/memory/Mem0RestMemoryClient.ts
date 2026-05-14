/**
 * Mem0RestMemoryClient — Mem0 Platform REST API adapter (ADR-004 fallback).
 *
 * Uses Mem0's hosted platform (api.mem0.ai) via pure `fetch()` — no SDK,
 * no Node.js native bindings, fully CF Workers compatible.
 *
 * Activation:
 *   - Set MEM0_API_KEY secret in wrangler.jsonc / CF dashboard.
 *   - Pass `env.MEM0_API_KEY` to the constructor.
 *   - Swap `AgentMemoryClient` for `Mem0RestMemoryClient` in phasic.ts once
 *     the key is provisioned and CF Agent Memory binding is still pending.
 *
 * Error policy (matches MemoryClient contract in types.ts):
 *   - recall  → []    on missing key / network error / non-2xx response
 *   - remember → null  on same
 *   - forget   → false on same
 *
 * Mem0 REST API reference:
 *   https://docs.mem0.ai/open-source/features/rest-api
 *   Base URL: https://api.mem0.ai/v1/
 *   Auth: Authorization: Token <api-key>
 */

import { createLogger } from '../../logger';
import {
    DEFAULT_RECALL_K,
    type MemoryBlock,
    type MemoryBlockInput,
    type MemoryClient,
    type MemoryRecallQuery,
} from './types';

const logger = createLogger('Mem0RestMemoryClient');

const MEM0_BASE = 'https://api.mem0.ai/v1';

/** Shape of a memory object returned by the Mem0 platform API. */
interface Mem0Memory {
    readonly id: string;
    readonly memory: string;
    readonly user_id: string;
    readonly metadata?: Record<string, string | number | boolean>;
    readonly created_at?: string;
}

/** Shape of a search result from POST /v1/search. */
interface Mem0SearchResult {
    readonly id: string;
    readonly memory: string;
    readonly user_id: string;
    readonly score?: number;
    readonly metadata?: Record<string, string | number | boolean>;
    readonly created_at?: string;
}

export class Mem0RestMemoryClient implements MemoryClient {
    private readonly apiKey: string;

    constructor(apiKey: string) {
        if (!apiKey) {
            throw new Error('Mem0RestMemoryClient requires a non-empty API key');
        }
        this.apiKey = apiKey;
    }

    /**
     * Build the Authorization header for every Mem0 API call.
     * Mem0 platform uses "Token <key>", not "Bearer".
     */
    private headers(): Record<string, string> {
        return {
            'Authorization': `Token ${this.apiKey}`,
            'Content-Type': 'application/json',
        };
    }

    /**
     * Search Mem0 for memories relevant to the query.
     * Maps to POST /v1/search.
     *
     * Tag filtering: Mem0 supports `filters` but tag is stored in metadata.
     * We filter client-side on tag when provided (Mem0 metadata filter syntax
     * varies by plan; client-side is safer for now).
     */
    async recall(q: MemoryRecallQuery): Promise<readonly MemoryBlock[]> {
        try {
            const body: Record<string, unknown> = {
                query: q.query,
                user_id: q.userId,
                limit: q.k ?? DEFAULT_RECALL_K,
            };

            const res = await fetch(`${MEM0_BASE}/search/`, {
                method: 'POST',
                headers: this.headers(),
                body: JSON.stringify(body),
            });

            if (!res.ok) {
                logger.warn('Mem0 recall returned non-2xx', {
                    status: res.status,
                    userId: q.userId,
                });
                return [];
            }

            const results: Mem0SearchResult[] = await res.json<Mem0SearchResult[]>();

            const blocks = results
                .filter((r) => !q.tag || r.metadata?.['tag'] === q.tag)
                .map((r) => this.searchResultToBlock(r, q.userId));

            return blocks;
        } catch (err) {
            logger.warn('Mem0 recall failed — returning []', {
                userId: q.userId,
                error: errorMessage(err),
            });
            return [];
        }
    }

    /**
     * Store a memory block in Mem0.
     * Maps to POST /v1/memories.
     *
     * The block `content` is wrapped in a user message so Mem0 can extract
     * and index it. Tag and metadata are forwarded in the `metadata` field.
     */
    async remember(block: MemoryBlockInput): Promise<MemoryBlock | null> {
        try {
            const meta: Record<string, string | number | boolean> = {
                tag: block.tag,
                ...(block.metadata as Record<string, string | number | boolean> | undefined),
            };

            const body = {
                messages: [{ role: 'assistant', content: block.content }],
                user_id: block.userId,
                metadata: meta,
            };

            const res = await fetch(`${MEM0_BASE}/memories/`, {
                method: 'POST',
                headers: this.headers(),
                body: JSON.stringify(body),
            });

            if (!res.ok) {
                logger.warn('Mem0 remember returned non-2xx', {
                    status: res.status,
                    userId: block.userId,
                    tag: block.tag,
                });
                return null;
            }

            // Mem0 may return the new memory object(s). Extract the first id.
            const raw = await res.json<{ results?: Mem0Memory[] } | Mem0Memory>();
            const mem = 'results' in raw && raw.results?.length
                ? raw.results[0]
                : (raw as Mem0Memory);

            if (!mem?.id) {
                logger.warn('Mem0 remember: response missing id', { userId: block.userId });
                return null;
            }

            return {
                id: mem.id,
                userId: block.userId,
                tag: block.tag,
                content: block.content,
                metadata: block.metadata,
                createdAt: mem.created_at ? dateToUnixSecs(mem.created_at) : undefined,
            };
        } catch (err) {
            logger.warn('Mem0 remember failed — returning null', {
                userId: block.userId,
                tag: block.tag,
                error: errorMessage(err),
            });
            return null;
        }
    }

    /**
     * Delete a specific memory block.
     * Maps to DELETE /v1/memories/{memory_id}.
     */
    async forget(userId: string, blockId: string): Promise<boolean> {
        try {
            const res = await fetch(`${MEM0_BASE}/memories/${blockId}/`, {
                method: 'DELETE',
                headers: this.headers(),
            });
            if (!res.ok) {
                logger.warn('Mem0 forget returned non-2xx', {
                    status: res.status,
                    userId,
                    blockId,
                });
                return false;
            }
            return true;
        } catch (err) {
            logger.warn('Mem0 forget failed — returning false', {
                userId,
                blockId,
                error: errorMessage(err),
            });
            return false;
        }
    }

    private searchResultToBlock(r: Mem0SearchResult, userId: string): MemoryBlock {
        const tag = (r.metadata?.['tag'] as string | undefined) ?? 'untagged';
        const { tag: _tag, ...rest } = r.metadata ?? {};
        return {
            id: r.id,
            userId,
            tag,
            content: r.memory,
            metadata: Object.keys(rest).length > 0
                ? (rest as Record<string, string | number | boolean>)
                : undefined,
            createdAt: r.created_at ? dateToUnixSecs(r.created_at) : undefined,
        };
    }
}

/** Parse an ISO-8601 date string to Unix seconds. Returns undefined on failure. */
function dateToUnixSecs(iso: string): number | undefined {
    const ms = Date.parse(iso);
    return isNaN(ms) ? undefined : Math.floor(ms / 1000);
}

function errorMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}
