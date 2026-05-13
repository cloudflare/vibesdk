/**
 * AISearchClient — Cloudflare-native RetrievalClient implementation (ADR-004).
 *
 * Adapts the Cloudflare AI Search primitive (shipped Q2 2026 during
 * Cloudflare Agents Week). Hybrid retrieval: dense + sparse (BM25) +
 * filter, single managed index per worker. Stays well below the 10k
 * embedding ceiling projected for S2 traffic (ADR-004 §Why not best-of-breed).
 *
 * Binding is NOT yet provisioned. Same loose-lookup pattern as
 * `worker/services/memory/AgentMemoryClient.ts`. Stubs return safe defaults:
 *   - search    → []
 *   - index     → 0
 *   - deleteByIds → 0
 */

import { createLogger } from '../../logger';
import {
    DEFAULT_TOP_K,
    type RetrievalClient,
    type RetrievalDocument,
    type RetrievalHit,
    type RetrievalQuery,
} from './types';

const logger = createLogger('AISearchClient');

interface CfAiSearchBinding {
    search(req: {
        query: string;
        topK: number;
        filters?: Record<string, string>;
    }): Promise<readonly { id: string; score: number; title?: string; snippet: string; tags?: Record<string, string> }[]>;
    upsert(docs: readonly { id: string; title?: string; text: string; tags?: Record<string, string> }[]): Promise<number>;
    deleteByIds(ids: readonly string[]): Promise<number>;
}

export class AISearchClient implements RetrievalClient {
    private readonly binding: CfAiSearchBinding | null;

    constructor(env: Env) {
        this.binding = getAiSearchBinding(env);
        if (!this.binding) {
            logger.warn(
                'AI_SEARCH binding missing — running in stub mode. ' +
                'Provision via wrangler.jsonc once CF AI Search is enabled on ' +
                'this account (see ADR-004 §Implementation).',
            );
        }
    }

    async search(req: RetrievalQuery): Promise<readonly RetrievalHit[]> {
        if (!this.binding) return [];
        try {
            const rows = await this.binding.search({
                query: req.query,
                topK: req.topK ?? DEFAULT_TOP_K,
                filters: req.filters?.tags as Record<string, string> | undefined,
            });
            return rows.map((r) => ({
                id: r.id,
                score: r.score,
                title: r.title,
                snippet: r.snippet,
                tags: r.tags,
            }));
        } catch (err) {
            logger.warn('search failed — returning []', {
                query: req.query.slice(0, 80),
                error: errorMessage(err),
            });
            return [];
        }
    }

    async index(documents: readonly RetrievalDocument[]): Promise<number> {
        if (!this.binding) return 0;
        if (documents.length === 0) return 0;
        try {
            return await this.binding.upsert(
                documents.map((d) => ({
                    id: d.id,
                    title: d.title,
                    text: d.text,
                    tags: d.tags as Record<string, string> | undefined,
                })),
            );
        } catch (err) {
            logger.warn('index failed — returning 0', {
                count: documents.length,
                error: errorMessage(err),
            });
            return 0;
        }
    }

    async deleteByIds(ids: readonly string[]): Promise<number> {
        if (!this.binding) return 0;
        if (ids.length === 0) return 0;
        try {
            return await this.binding.deleteByIds(ids);
        } catch (err) {
            logger.warn('deleteByIds failed — returning 0', {
                count: ids.length,
                error: errorMessage(err),
            });
            return 0;
        }
    }
}

function errorMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}

/**
 * Loose lookup so this module compiles before `npm run cf-typegen`.
 *
 * TODO(S2-provision):
 *   1. wrangler.jsonc → add `ai_search` binding for the corpus index.
 *   2. `npm run cf-typegen`.
 *   3. Replace this helper with a direct `env.AI_SEARCH` reference.
 */
function getAiSearchBinding(env: Env): CfAiSearchBinding | null {
    const candidate = (env as unknown as Record<string, unknown>).AI_SEARCH;
    if (
        candidate &&
        typeof candidate === 'object' &&
        typeof (candidate as CfAiSearchBinding).search === 'function'
    ) {
        return candidate as CfAiSearchBinding;
    }
    return null;
}
