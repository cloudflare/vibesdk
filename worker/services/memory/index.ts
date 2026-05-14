/**
 * Memory service exports — ADR-004 + ADR-006.
 *
 * Usage:
 *   import { AgentMemoryClient } from '../services/memory';   // CF-native (production)
 *   import { NullMemoryClient }  from '../services/memory';   // no-op (tests / fallback)
 *   import type { MemoryClient } from '../services/memory';   // interface for DI
 */

export { AgentMemoryClient } from './AgentMemoryClient';
export { NullMemoryClient }  from './NullMemoryClient';
export type { MemoryClient, MemoryBlock, MemoryBlockInput, MemoryRecallQuery } from './types';
export { DEFAULT_RECALL_K } from './types';
