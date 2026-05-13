/**
 * Memory layer types — ADR-004.
 *
 * Single source of truth for the MemoryClient contract. Adapters in this
 * directory MUST implement MemoryClient. Today only the Cloudflare Agent
 * Memory adapter exists; a Mem0 adapter is the documented fallback if CF
 * primitives prove insufficient (see ADR-004 §Interface).
 *
 * Scope: long-term user-scoped memory (style prefs, prior project context,
 * recurring tool preferences). NOT short-term per-DO conversation state —
 * that lives in `CodeGenState` already and stays there.
 */

/**
 * One stored memory block — opaque to the agent that wrote it, addressable
 * by tag for the agent that reads it.
 */
export interface MemoryBlock {
    /** Stable id from the underlying store. */
    readonly id: string;
    /** Owner — must match the authenticated user calling recall(). */
    readonly userId: string;
    /**
     * Logical tag. Convention: `style:react`, `project:<projectId>`,
     * `pref:test-framework`. Free-form but tags are how an agent decides
     * what to recall in a session.
     */
    readonly tag: string;
    /**
     * Human/agent-readable payload. Kept as a plain string so the layer
     * stays portable across stores (CF Agent Memory + Mem0 both accept
     * strings; some stores accept JSON but we don't depend on that).
     */
    readonly content: string;
    /** Free-form metadata (model, sessionId, phase, etc.). Avoid PII. */
    readonly metadata?: Readonly<Record<string, string | number | boolean>>;
    /** Unix seconds; the store wins on conflicts — clients should not set. */
    readonly createdAt?: number;
}

/** Input shape when writing a new block. */
export type MemoryBlockInput = Omit<MemoryBlock, 'id' | 'createdAt'>;

/**
 * Recall query. `tag` is optional — when unset, recall returns the
 * top-k matches across all tags for this user. `k` is a hint, not a
 * guarantee; the store may return fewer.
 */
export interface MemoryRecallQuery {
    readonly userId: string;
    readonly query: string;
    readonly k?: number;
    readonly tag?: string;
}

/**
 * Thin contract every adapter implements. Errors are reported by returning
 * an empty array / null instead of throwing — same convention as
 * UserSecretsStore — so a memory-layer outage cannot crash a generation.
 */
export interface MemoryClient {
    recall(query: MemoryRecallQuery): Promise<readonly MemoryBlock[]>;
    remember(block: MemoryBlockInput): Promise<MemoryBlock | null>;
    forget(userId: string, blockId: string): Promise<boolean>;
}

/** Default `k` when none supplied. Chosen to fit a Claude context window. */
export const DEFAULT_RECALL_K = 5;
