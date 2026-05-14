/**
 * Memory service exports — ADR-004 + ADR-006.
 *
 * Priority order:
 *   1. AgentMemoryClient  — CF Agent Memory (production; requires AGENT_MEMORY binding)
 *   2. Mem0RestMemoryClient — Mem0 platform REST API (fallback; requires MEM0_API_KEY)
 *   3. NullMemoryClient   — no-op (tests / graceful degradation)
 *
 * Usage:
 *   import { AgentMemoryClient }    from '../services/memory';  // CF-native (preferred)
 *   import { Mem0RestMemoryClient } from '../services/memory';  // REST fallback
 *   import { NullMemoryClient }     from '../services/memory';  // no-op
 *   import type { MemoryClient }    from '../services/memory';  // interface for DI
 */

export { AgentMemoryClient }    from './AgentMemoryClient';
export { Mem0RestMemoryClient } from './Mem0RestMemoryClient';
export { NullMemoryClient }     from './NullMemoryClient';
export type { MemoryClient, MemoryBlock, MemoryBlockInput, MemoryRecallQuery } from './types';
export { DEFAULT_RECALL_K } from './types';
