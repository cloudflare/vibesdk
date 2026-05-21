# ADR-011: @cloudflare/think POC Evaluation

**Status:** PROPOSED
**Date:** 2026-05-18
**Author:** @Architect (DEC-CYCLE32-A / run132-133 spike)
**Decision tag:** DEC-CYCLE32-A

---

## Context

### What vibesdk built custom

vibesdk's core generation pipeline is a hand-built Durable Object agent totalling
~4,577 LOC across four primary files, plus ~1,456 LOC across 24 tool files:

| File | LOC | Purpose |
|---|---|---|
| `worker/agents/core/behaviors/base.ts` | 1,934 | Base DO behavior: state machine, WebSocket fan-out, abort, SQLite I/O |
| `worker/agents/core/behaviors/phasic.ts` | 1,184 | IDLE→PHASE_GENERATING→PHASE_IMPLEMENTING→REVIEWING→IDLE state machine |
| `worker/agents/core/codingAgent.ts` | 906 | DO class: init, WebSocket lifecycle, service wiring (FileManager, DeploymentManager, GitVersionControl) |
| `worker/agents/operations/UserConversationProcessor.ts` | 553 | Multi-turn conversational agent: tool orchestration, memory recall, history compaction, streaming |
| `worker/agents/tools/toolkit/*.ts` (24 files) | 1,456 | Tool registry: read-files, virtual-filesystem, exec-commands, run-analysis, regenerate-file, deep-debugger, git, queue-request, etc. |
| **Total** | **6,033** | |

Custom primitives vibesdk had to build:
- DO base class extending `Agent<Env, AgentState>` (wires SQL, WebSocket, env)
- SQLite-backed virtual filesystem (`virtual-filesystem.ts`, `read-files.ts`)
- Multi-turn agentic loop w/ streaming (`executeInference` + `UserConversationProcessor`)
- Tool lifecycle hooks (`onStart`, `onComplete` wired manually per tool)
- Conversation history compaction (`conversationCompactifier.ts`)
- WebSocket broadcast buffer (`ws-buffer.ts`) for zero-client reconnect
- Abort controller propagation tree
- Message deduplication across tool-call turns

### What @cloudflare/think v0.6.1 ships

Think is Cloudflare's opinionated chat-agent base class published 2026-05-15
from the `cloudflare/agents` monorepo (`packages/think/`). Version: 0.6.1, marked
experimental but API surface described as stable pre-v1.

Think provides out-of-box:

| Primitive | Think ships | vibesdk equivalent |
|---|---|---|
| DO base class | `Think extends Agent<Env>` | `CodeGeneratorAgent extends Agent<Env, AgentState>` |
| SQLite-backed message persistence | `Session` (tree-structured, FTS5, multi-session) | manual `ConversationState` + `conversationMessages` in DO state |
| WebSocket chat protocol | built-in (`cf_agent_chat_*` wire format) | `handleWebSocketMessage` + `ws-buffer.ts` + PartySocket |
| Agentic loop + streaming | `streamText` managed w/ `maxSteps`, per-chunk callbacks | `executeInference` + chunk callbacks in `UserConversationProcessor` |
| Tool lifecycle hooks | `beforeToolCall` / `afterToolCall` / `onStepFinish` / `onChunk` — framework-level | manually attached `.onStart`/`.onComplete` closures per tool build |
| Conversation compaction | `session.onCompaction(fn).compactAfter(threshold)` | `compactifyContext()` in `UserConversationProcessor` |
| Sub-agents | `agentTool(ChildClass, schema)` — child owns state, resumable stream, storage. **Import:** `import { agentTool } from "agents/agent-tools"` (subpath export of `agents` package, NOT from `@cloudflare/think`) | none (deep-debugger is inline DO method, not true sub-agent) |
| Workspace VFS | `this.workspace` (DO+SQLite, read/write/edit/list/find/grep/delete, multimodal, R2 spillover) | `virtual-filesystem.ts` + `read-files.ts` (list/read/delete only, no write/edit/grep) |
| Stream resumption | `ResumableStream` built-in | `ws-buffer.ts` (ephemeral flush-on-reconnect only, no full replay) |
| Code execution | `createExecuteTool()` via `@cloudflare/codemode` | `exec-commands.ts` via sandbox RPC |
| Per-turn config overrides | `beforeTurn() → TurnConfig` (model, tools, activeTools, maxSteps, temperature) | not abstracted; wired ad-hoc per inference call |
| Context blocks / persistent memory | `session.withContext("key", {...})` — LLM-writable, token-budgeted | `AgentMemoryClient` recall injected into system prompt |
| Extensions / HostBridgeLoopback | `ExtensionManager`, sandboxed extension Workers | not implemented |

Peer dependencies required: `agents >=0.12.4`, `ai ^6.0.0` (Vercel AI SDK v6), `zod ^4.0.0`, `@cloudflare/shell >=0.3.4`.
Note: vibesdk currently uses the OpenAI SDK directly for inference, not Vercel AI SDK v6.

---

## Decision Options

### Option A: Migrate to Think primitives

Replace `CodeGeneratorAgent`, `UserConversationProcessor`, and the workspace/VFS
tool layer with Think's base class, Session, and built-in workspace.

**Scope of replacement:**

| Layer | Delete/replace | Keep as-is |
|---|---|---|
| DO class | `codingAgent.ts` (906) → `Think` subclass | `FileManager`, `DeploymentManager`, `GitVersionControl` (domain services) |
| Base behavior | `behaviors/base.ts` (1,934) → Think lifecycle hooks | phasic state machine (unique to vibesdk) |
| Phasic state machine | `behaviors/phasic.ts` (1,184) — refactor onto `agentTool()` sub-agents | PhaseGeneration logic (algorithm unchanged) |
| Conversation agent | `UserConversationProcessor.ts` (553) → Think subclass | system prompt, memory recall, tool set |
| VFS tools | `virtual-filesystem.ts` (71) + `read-files.ts` (42) → `this.workspace` | — |
| Agentic loop + streaming | `executeInference` wrapper → Think's `streamText` | — |
| History compaction | `conversationCompactifier.ts` → `session.onCompaction(fn).compactAfter(threshold)` | — |
| WebSocket buffer | `ws-buffer.ts` → `ResumableStream` | — |
| Tool hooks | manual `.onStart`/`.onComplete` closures → `beforeToolCall`/`afterToolCall` | — |

**Estimated LOC reduction:**

| Segment | Before | After (est.) | Delta |
|---|---|---|---|
| DO class + behaviors | 4,024 | ~600 (thin Think subclass) | -3,424 |
| UserConversationProcessor | 553 | ~150 (override methods only) | -403 |
| VFS tool files (virtual-filesystem + read-files) | 113 | 0 (workspace built-in) | -113 |
| ws-buffer + compactifier | ~200 (est.) | 0 | -200 |
| **Total** | **~4,890** | **~750** | **-4,140 (~85%)** |

Remaining LOC is domain logic (PhaseGeneration algorithm, system prompts, tool
implementations for vibesdk-specific tools: queue-request, deep-debugger, git,
deploy-preview, sandbox RPC).

**Migration risk: HIGH**

- **Provider swap required:** Think uses Vercel AI SDK v6 (`ai` package, `LanguageModel`
  interface). vibesdk uses OpenAI SDK directly. Migration requires either wrapping
  all inference calls in an AI SDK provider adapter or replacing `executeInference`
  wholesale. Non-trivial surface: token counting, tool call serialization, streaming
  chunk shape, abort propagation all differ between SDKs.
- **Phasic state machine is non-standard:** Think's `agentTool()` model dispatches
  sub-agents on demand. vibesdk's IDLE→PHASE_GENERATING→PHASE_IMPLEMENTING→REVIEWING
  state machine is a sequential pipeline with queued user inputs and mid-phase abort.
  Mapping phases to sub-agent calls is architecturally viable but requires redesign,
  not a drop-in swap.
- **Custom sandbox integration:** vibesdk's `exec-commands.ts` routes to a custom
  container service via sandbox RPC. Think's `createExecuteTool()` uses
  `@cloudflare/codemode` Dynamic Workers — a different execution model. The sandbox
  layer cannot be swapped without its own migration track.
- **Type safety:** Think's generic is `Think<Env>`. vibesdk's state is `AgentState`
  (complex nested type). The `AgentState` type would need to live in `Session`
  context blocks or Think's storage layer — requires full state model redesign.
- **Experimental label:** v0.6.1 is marked experimental. API surface could shift before
  vibesdk's Jul 1 launch.

**Timeline estimate:** 14-21 days for full migration (provider swap 3-5d, DO class
redesign 3-4d, phasic state machine re-arch onto sub-agents 5-7d, VFS/tool migration
2-3d, integration + regression 2-3d). Exceeds Jul 1 window at current T-44d.

**2-day POC scope (recommended regardless of final decision):**
- Replace `UserConversationProcessor` only (553 LOC) with a thin Think subclass
- Wire Vercel AI SDK provider adapter for one model (Anthropic or OpenAI)
- Measure: (a) LOC delta, (b) streaming latency delta, (c) session replay correctness
- Do NOT touch phasic state machine or sandbox
- Output: concrete LOC delta + one integration issue log → feeds Option A/B/C final vote

---

### Option B: Stay custom, adopt Think patterns selectively

Keep vibesdk's DO class and phasic state machine unchanged. Port Think's patterns
(not its code) into vibesdk's custom layer where the delta is low-risk and high-value.

**Selective adoptions:**

| Think pattern | vibesdk adoption | Effort |
|---|---|---|
| `beforeToolCall`/`afterToolCall` hooks | Formalize existing `.onStart`/`.onComplete` closures into a typed `ToolLifecycle` interface in `customTools.ts` | 0.5d |
| `session.withCompaction()` model | Refactor `compactifyContext` into a composable `SessionCompactor` class with configurable strategy | 1d |
| `ResumableStream` (replay on reconnect) | Extend `ws-buffer.ts` to persist last N messages to SQLite and replay on reconnect (vs current ephemeral flush) | 2d |
| `agentTool()` sub-agent pattern | Wrap `codeDebugger.ts` as a proper sub-agent DO (separate storage, resumable) rather than inline method call | 3-4d |
| `configureSession()` context blocks | Add `ContextBlockManager` to `UserConversationProcessor` for typed, token-budgeted memory sections | 2d |

**Estimated LOC reduction:** 0 net (patterns adopted, no code deleted). Complexity
reduction in specific modules; readability and testability improve.

**Migration risk: LOW**
- No dependency changes
- No provider swap
- Incremental, reversible changes
- Each adoption is independently shippable

**Timeline:** 0 days to start (ongoing during normal sprint work). Individual
adoptions 0.5-4d each, fully compatible with Jul 1 deadline.

---

### Option C: Reject Think, explicit differentiation

Treat Think as a competitor primitive (like Mastra or LangGraph) and explicitly
document why vibesdk's custom layer is the correct architecture. Invest in
improving the custom layer on its own terms.

**Rationale for rejection:**
- Think targets general-purpose chat agents. vibesdk's phasic code-generation
  pipeline (IDLE→PHASE_GENERATING→PHASE_IMPLEMENTING→REVIEWING) is a specialized
  workflow with queued user inputs, mid-phase abort, and multi-file code synthesis.
  The domain gap means Think's primitives buy little in the phasic hot path.
- Provider lock (Vercel AI SDK v6) is a forced migration with no architectural
  benefit to vibesdk's current OpenAI/Anthropic/Gemini multi-provider setup.
- Jul 1 hard deadline makes any migration track risk-negative at this stage.

**Differentiation investment (instead of migration):**
- Document vibesdk's DO-per-session model as a first-class architecture doc
- Extract `ICodingAgent` interface (already present) into a published internal
  spec so future contributors can extend without reading 1,934-line `base.ts`
- Invest LOC savings into phasic algorithm improvements (parallel phase execution,
  better retry logic) rather than infra refactor

**Migration risk: LOW**
**Timeline:** 0 days

---

## Recommendation

**Option B + 2-day POC (from Option A) in parallel.**

Rationale:

1. **Jul 1 hard deadline (~35 days from ADR authoring date) rules out Option A full migration.**
   Even the conservative 14-day estimate consumes 40% of remaining runway on infra
   refactor with no user-visible feature value. Full migration is a post-launch track.

2. **Option C is premature.** Think's workspace VFS is a strict superset of
   vibesdk's `virtual-filesystem.ts` (adds write/edit/grep, multimodal, R2 spillover).
   The `ResumableStream` is a genuine gap in vibesdk's current `ws-buffer.ts`. These
   gaps are real and will surface as user-facing bugs under load. Rejecting Think
   outright means re-solving these problems from scratch.

3. **Option B adoptions are safe and fast.** Formalizing `ToolLifecycle`, extending
   `ws-buffer.ts` to SQLite-backed replay, and wrapping `codeDebugger` as a true
   sub-agent DO are all 0.5-4 day tasks with zero dependency risk and direct
   reliability benefit before Jul 1.

4. **The 2-day POC on `UserConversationProcessor` is DEC-CYCLE32-A's direct ask.**
   It produces concrete LOC-delta evidence (target: 553 → ~150 LOC) and one
   provider-adapter integration issue log. This is the minimum bar to make an
   evidence-based Option A decision post-launch without speculating.

**Execution order:**
1. **(T+0, 2d)** POC: Replace `UserConversationProcessor` with Think subclass on
   a throwaway branch (`feature/think-poc-ucp`). Wire one provider adapter.
   Capture: LOC before/after, streaming latency delta (p50/p99), session replay
   pass/fail, blockers list. Report as run134/135 tech pillar output.
2. **(T+2, ongoing)** Option B adoptions: start with `ResumableStream` extension
   (highest reliability impact) and `ToolLifecycle` formalization (lowest effort).
   Ship before Jul 1.
3. **(Post-launch)** If POC confirms LOC delta >= 3,000 and no blocking provider
   issues, schedule full Option A migration as a post-Jul-1 sprint (2-3 week track).

---

## Consequences

**If Option B + POC is approved:**
- `ws-buffer.ts` gets SQLite-backed persistence → reconnect replay correct under
  DO eviction (current behaviour loses messages silently).
- `codeDebugger.ts` becomes a true sub-agent DO → isolated storage, independent
  abort, no shared state corruption with parent agent under concurrent debug sessions.
- `ToolLifecycle` interface reduces per-tool boilerplate in `customTools.ts` and
  makes tool hooks testable in isolation.
- 2-day POC produces concrete evidence for post-launch Option A decision.
- No user-visible behaviour change before Jul 1.

**What stays the same:**
- Phasic state machine (`behaviors/phasic.ts`) untouched.
- Sandbox RPC integration (`exec-commands.ts`) untouched.
- OpenAI/Anthropic/Gemini multi-provider setup untouched.
- WebSocket wire format (PartySocket) untouched.
- All 24 toolkit tools untouched.

**If POC (post-launch) leads to Option A:**
- vibesdk absorbs Vercel AI SDK v6 as the inference layer. Multi-provider
  support migrates to AI SDK provider adapters (workers-ai-provider, anthropic,
  openai packages under AI SDK umbrella).
- `behaviors/base.ts` (1,934 LOC) and `codingAgent.ts` (906 LOC) are deleted.
  Net: ~4,140 LOC removed, maintenance burden concentrated in domain logic only.
- Phasic state machine maps to Think `agentTool()` sub-agents: PhaseGenerator
  and PhaseImplementer become child Think DOs dispatched by a coordinator parent.
- Custom sandbox integration requires a `createExecuteTool()` adapter wrapping
  vibesdk's container RPC — or a dedicated `worker_loader` binding.

---

## Decision

**PENDING (DEC-CYCLE32-A)**

Awaiting owner sign-off on 2-day POC authorization. Full Option A/B/C final vote
deferred to post-POC evidence (target: run134-135 tech pillar).

---

## References

- `@cloudflare/think` v0.6.1 README: `github.com/cloudflare/agents/packages/think/README.md`
- `@cloudflare/think` package.json: peer deps confirm `agents >=0.12.4`, `ai ^6.0.0`
- Research cycle 32 cumulative: `docs/redesign/research/CUMULATIVE-SUMMARY-CYCLE-32.md`
- Run 132 architecture pillar: `docs/redesign/research/2026-05-26-0930-run132.md`
- vibesdk DO class: `worker/agents/core/codingAgent.ts` (906 LOC)
- vibesdk base behavior: `worker/agents/core/behaviors/base.ts` (1,934 LOC)
- vibesdk conversation agent: `worker/agents/operations/UserConversationProcessor.ts` (553 LOC)
- vibesdk tool registry: `worker/agents/tools/customTools.ts` + `toolkit/` (24 files, 1,456 LOC)
