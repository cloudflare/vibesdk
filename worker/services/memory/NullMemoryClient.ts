/**
 * NullMemoryClient — no-op implementation of MemoryClient.
 *
 * Useful for:
 *   - Unit tests that exercise phasic.ts code paths without memory infra
 *   - Environments where neither CF Agent Memory nor any external store
 *     is provisioned yet
 *   - Feature-flag rollback: swap any MemoryClient for NullMemoryClient
 *     to disable memory writes/reads without code changes
 *
 * Error policy: identical to AgentMemoryClient stub mode — returns the
 * safe zero-value on every call and never throws.
 *
 * @see AgentMemoryClient for the real CF Agent Memory implementation.
 * @see ADR-006 §S9 Spike 2 for the MemoriMemoryClient pilot plan.
 */

import type { MemoryBlock, MemoryBlockInput, MemoryClient, MemoryRecallQuery } from './types';

export class NullMemoryClient implements MemoryClient {
    /**
     * Always returns an empty array — no blocks stored in a null client.
     */
    async recall(_query: MemoryRecallQuery): Promise<readonly MemoryBlock[]> {
        return [];
    }

    /**
     * Accepts the block but does not persist it; returns null as if the
     * store failed to confirm the write.
     */
    async remember(_block: MemoryBlockInput): Promise<MemoryBlock | null> {
        return null;
    }

    /**
     * Reports false — the block was never stored so it cannot be deleted.
     */
    async forget(_userId: string, _blockId: string): Promise<boolean> {
        return false;
    }
}
