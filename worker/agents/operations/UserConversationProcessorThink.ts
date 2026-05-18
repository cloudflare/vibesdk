/**
 * Think-native UserConversationProcessor
 * POC only — throwaway branch feature/think-poc-ucp
 *
 * Goal: measure LOC delta vs original 553-line UCP
 * Original: 553 lines (imports + interfaces + processor function + tool rendering)
 * Think target: ~120 lines (Think handles: session, compaction, streaming, tool lifecycle)
 */

import { Think } from '@cloudflare/think';
// NOTE: @cloudflare/think peer-dep = Vercel AI SDK v6 (ai ^6.0.0)
// vibesdk currently uses OpenAI SDK directly — this adapter bridges them
import { createAnthropic } from '@ai-sdk/anthropic';
import type { AgentOperation, OperationOptions } from './common';
import type { UserConversationInputs, UserConversationOutputs } from './UserConversationProcessor';

// POC ACCEPTANCE CRITERION (from ADR-011):
// One call to execute() edits >=3 files via planEdits — proves codemode parity

export class ThinkUserConversationProcessor extends Think {
    // Think provides:
    // - this.session: SQLite-backed message tree (replaces conversationMessages array)
    // - this.workspace: VFS read/write/edit/list/find/grep/delete (replaces virtual-filesystem.ts)
    // - this.session.withCompaction(): replaces conversationCompactifier.ts
    // - beforeToolCall/afterToolCall hooks: replaces per-tool .onStart/.onComplete closures
    // - ResumableStream: replaces ws-buffer.ts ephemeral buffer

    /**
     * WHAT THINK ELIMINATES vs original UCP:
     * - ConversationState manual management (lines 1-50): Think.session owns this
     * - CHUNK_SIZE streaming loop (lines 200-250): Think.ResumableStream owns this
     * - compactifyContext() call (line ~280): Think.session.withCompaction() owns this
     * - buildToolCallRenderer() (lines 44-48): Think.afterToolCall hook owns this
     * - Manual duplicate-detection logic (lines 471-482): Think.session deduplicates
     * - Fallback error path state reconstruction (lines 510-527): Think.session rollback owns this
     *
     * WHAT THINK DOES NOT ELIMINATE:
     * - AgentMemoryClient recall (lines 334-350): still needed, injected into system prompt
     * - getSystemPromptWithProjectContext(): still needed, passed as system param
     * - buildTools() registry: still needed, passed to Think as tools[]
     * - processProjectUpdates() / isProjectUpdateType(): still needed, not part of Think scope
     */

    async processUserMessage(inputs: UserConversationInputs): Promise<UserConversationOutputs> {
        // TODO (2-day POC):
        // 1. Wire inputs.userMessage → this.session.append()
        // 2. Wire this.workspace tools → buildTools() registry
        // 3. Wire inputs.conversationResponseCallback → this.onChunk
        // 4. Wire inputs.errors → system context injection
        // 5. Call this.execute() with Anthropic provider
        // 6. Return conversationResponse from session.lastMessage()
        throw new Error('POC skeleton — implement in 2-day spike');
    }
}

/**
 * ADAPTER: Vercel AI SDK provider for Anthropic
 * Bridges vibesdk's OpenAI-SDK-based calling convention -> Think's Vercel AI SDK expectation
 */
export function createAnthropicAdapter(apiKey: string) {
    return createAnthropic({ apiKey });
    // NOTE: This replaces executeInference() in inferutils/infer.ts
    // for the UCP path only — all other paths (PhaseGen, PhaseImpl) remain on OpenAI SDK
}

/**
 * LOC COMPARISON (target output from this POC):
 * Original UCP:     553 lines
 * This file:        ~80 lines (skeleton)
 * Fully implemented estimate: ~150 lines
 * Delta: -400 lines (-72%) for UCP alone
 *
 * Files eliminated by Think (from ADR-011 full migration):
 * - conversationCompactifier.ts  (~80 lines) — Think.session.withCompaction()
 * - ws-buffer.ts                 (~120 lines) — Think.ResumableStream
 * Net for UCP cluster: -603 lines (-80%)
 *
 * Full agent migration delta (from ADR-011): -4,140 lines (-85%)
 */
