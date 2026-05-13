/**
 * Retrieval layer types — ADR-004.
 *
 * Single source of truth for the RetrievalClient contract. Today only a
 * Cloudflare AI Search adapter exists; Infinity / Pinecone are documented
 * fallbacks if CF AI Search proves insufficient (see ADR-004 §Interface).
 *
 * Scope: corpus retrieval over prior generations + template corpus + user
 * uploaded specs. NOT per-session file lookup — that's the FileManager.
 */

/** One retrieved document — opaque payload + similarity score. */
export interface RetrievalHit {
    readonly id: string;
    readonly score: number;
    readonly title?: string;
    readonly snippet: string;
    /** Free-form filter labels the document was indexed with. */
    readonly tags?: Readonly<Record<string, string>>;
}

/** Document shape on index(). */
export interface RetrievalDocument {
    readonly id: string;
    readonly title?: string;
    readonly text: string;
    readonly tags?: Readonly<Record<string, string>>;
}

/** Hybrid filter — applied AND on tags. */
export interface RetrievalFilters {
    readonly tags?: Readonly<Record<string, string>>;
}

/**
 * Search request — `topK` is a hint. Adapter chooses the dense+sparse mix.
 */
export interface RetrievalQuery {
    readonly query: string;
    readonly topK?: number;
    readonly filters?: RetrievalFilters;
}

export interface RetrievalClient {
    search(req: RetrievalQuery): Promise<readonly RetrievalHit[]>;
    index(documents: readonly RetrievalDocument[]): Promise<number>;
    /** Remove docs by id. Returns the count that were actually removed. */
    deleteByIds(ids: readonly string[]): Promise<number>;
}

export const DEFAULT_TOP_K = 8;
