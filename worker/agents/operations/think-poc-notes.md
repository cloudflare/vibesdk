# Think POC: UserConversationProcessor Spike Notes

## Scope
Branch: feature/think-poc-ucp
Timebox: 2 days (post-Jul-1 sprint)
Target: Replace UserConversationProcessor.ts (553 lines) -> ThinkUserConversationProcessor (~150 lines)

## Acceptance Criteria
- [ ] Session messages persist in SQLite (not in-memory array)
- [ ] Compaction triggers via withCompaction() (not manual compactifyContext())
- [ ] Tool call rendering via afterToolCall hook (not buildToolCallRenderer closure)
- [ ] execute() edits >=3 files via workspace VFS (validates codemode parity)
- [ ] Streaming works via ResumableStream (not ws-buffer.ts ephemeral)

## Implementation Plan (2-day breakdown)

### Day 1 (4h)
1. Install @cloudflare/think + ai (Vercel AI SDK) as dev deps — DO NOT install in production bundle
2. Wire AnthropicAdapter (provider bridge)
3. Implement processUserMessage() skeleton with session.append()
4. Verify session persists across calls (SQLite check)

### Day 2 (4h)
1. Wire workspace VFS -> buildTools() registry passthrough
2. Implement afterToolCall -> conversationResponseCallback bridge
3. Run acceptance criterion: execute() edits >=3 files
4. Measure LOC (wc -l ThinkUserConversationProcessor.ts vs UserConversationProcessor.ts)

## Dependencies Not Yet Added
- @cloudflare/think ^0.6.1 (prod peer dep: ai ^6.0.0, cloudflare:workers)
- @ai-sdk/anthropic ^1.x (Vercel AI SDK Anthropic provider)
- NOTE: ai@6 conflicts with vibesdk's current openai@4 if both in prod bundle — use dynamic import or separate DO class

## LOC Target
| File | Before | After | Delta |
|---|---|---|---|
| UserConversationProcessor.ts | 553 | 0 (deleted) | -553 |
| ThinkUserConversationProcessor.ts | 0 | ~150 | +150 |
| conversationCompactifier.ts | ~80 | 0 (deleted) | -80 |
| ws-buffer.ts | ~120 | 0 (deleted) | -120 |
| **Net** | **753** | **150** | **-603 (-80%)** |

## Risk Assessment
| Risk | Severity | Mitigation |
|---|---|---|
| Vercel AI SDK v6 peer dep conflict with openai@4 | HIGH | Isolate Think-DO from main DO; separate bundle |
| CF Workers compat (Think uses Node APIs?) | MED | Check @cloudflare/think CF compat flag |
| Session replay correctness | MED | Unit test: append->execute->lastMessage cycle |
| Latency regression | LOW | Think ResumableStream designed for DO context |

## Original UCP: Key Sections Identified (for mapping)

Lines 1-25: Imports (OpenAI SDK, custom inferutils, compactifier)
Lines 26-73: Interfaces + constants (ToolCallStatusArgs, UserConversationInputs/Outputs, CHUNK_SIZE=64, RelevantProjectUpdateWebsoketMessages)
Lines 75-286: SYSTEM_PROMPT (~210 lines, largest single block)
Lines 288-316: USER_PROMPT template + buildUserMessageWithContext()
Lines 318-528: UserConversationProcessor.execute() — core logic:
  - Lines 330-350: AgentMemoryClient recall (not eliminated by Think)
  - Lines 353-389: System prompt assembly + tool wiring + onStart/onComplete closures
  - Lines 391-403: compactifyContext() call
  - Lines 415-438: executeInference() with streaming loop
  - Lines 460-495: History management + duplicate detection
  - Lines 497-527: Return / fallback error path
Lines 530-553: processProjectUpdates() + isProjectUpdateType()

## Think Primitive Mapping

| UCP Pattern | Think Primitive | Notes |
|---|---|---|
| conversationState.runningHistory array | this.session (SQLite-backed) | Persists across DO hibernations |
| compactifyContext() | this.session.withCompaction() | Triggered by token threshold |
| buildToolCallRenderer() closure | this.afterToolCall hook | Declarative, not imperative |
| executeInference() chunk_size=64 loop | this.ResumableStream | Handles WS reconnect natively |
| Duplicate assistant message detection | this.session deduplication | Built-in |
| Fallback state reconstruction in catch | this.session.rollback() | Atomic — no partial state |

## Decision Gate (post-POC)
If LOC delta >= -400 lines AND streaming latency within 10% -> FULL MIGRATION sprint
If LOC delta < -200 lines OR latency regression > 10% -> OPTION B (selective primitives only)
