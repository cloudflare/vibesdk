# ADR-006 — S9 Spike Plan: CF Project Think + Memori Pilot

**Status:** PROPOSED  
**Date:** 2026-05-14  
**Authors:** Architecture panel (S8 continuation)  
**Supersedes:** ADR-005 §Future Work

---

## Context

ADR-005 deferred two items to S9:
1. **CF Project Think** (`@cloudflare/think`) — preview Apr 2026, same DO substrate as vibesdk, potentially replaces the sandbox factory pattern once GA
2. **Memori Labs pilot** — LoCoMo benchmark leader (81.95% at 4.97% context tokens), TS SDK available, free tier; evaluate as agent memory layer vs current stateless approach

S8 shipped: Mastra PhaseWorkflow wired into phasic.ts (commits `58773b9`, `b24bd88`). TypeScript clean. ADR-005 panel vote: 6/8 ACCEPT.

---

## S9 Spike 1 — CF Project Think API Evaluation

### Goal
Determine if `@cloudflare/think`'s Execution Ladder can replace `worker/services/sandbox/factory.ts` without violating the 43× cost moat.

### Trigger Condition
`@cloudflare/think` reaches **General Availability** (not preview). Monitor:
- Cloudflare blog announcements
- `npm info @cloudflare/think dist-tags.latest` — when `>0.x.0` stable appears

### Spike Scope (≤3 days engineer time)

```
# schema: task|owner|output
Evaluate 5-tier Execution Ladder vs sandbox factory|Architect|compatibility matrix
Prototype Fibers replacing PhaseImplementation sequential steps|Dev|proof-of-concept branch
Sub-agents: can they replace TeamLeadCoordinator DO fan-out?|Architect|ADR-006 addendum
Cost model: Project Think billable units vs current DO compute|Analyst-Commercial|cost delta table
```

### Execution Ladder Compatibility Matrix (updated run015 — API confirmed)

| Ladder Tier | CF API | vibesdk Equivalent | Compatible? |
|---|---|---|---|
| Tier 0 — Workspace | `createWorkspaceTools()` | Simple tool calls + shell | YES — no change needed |
| Tier 1 — Dynamic Worker | `createExecuteTool()` | Ad-hoc TypeScript execution | YES — additive |
| Tier 2 — npm support | `@cloudflare/worker-bundler` | — | YES — additive |
| Tier 3 — Browser | `createBrowserTools()` | — | YES — additive |
| Tier 4 — Full sandbox | `createSandboxTools()` | `worker/services/sandbox/factory.ts` | SPIKE |

### Fibers API (confirmed run015)

```typescript
await runFiber("phase-gen", async (ctx) => {
    // … do phase work …
    ctx.stash({ generatedFiles });   // checkpoint state
});
onFiberRecovered(ctx) { /* ctx.name, ctx.snapshot */ }
```

**Verdict:** Fibers are safe to adopt in S9 even in experimental state — they add crash recovery ON TOP of existing pattern without replacing anything. Touchpoint: `worker/agents/operations/PhaseWorkflow.ts` step wrappers.

### Sub-agents API (confirmed run015)

```typescript
const sub = await this.subAgent(AgentClass, "name");
// Each sub-agent: isolated SQLite DB, typed RPC, compile-time safety
const result = await sub.chat(query, streamRelay);
```

**Verdict:** Exact pattern vibesdk wants for parallel phase execution. ADOPT in S9 alongside parallel sub-agent task (cycle 2/3 escalation).

### Breaking Changes (Agents SDK v0.12.4, May 13 2026)

- `ChatOptions.tools` REMOVED — verify vibesdk doesn't use this shape before spike
- `cancelOnClientAbort` ADDED to `useAgentChat()` — vibesdk uses PartySocket, not `useAgentChat`; pattern useful as reference only

### Decision Criteria

ADOPT if:
- Fibers/Sub-agents reduce boilerplate by ≥30% with zero DO refactor
- Cost delta ≤ 2× current DO compute (preserves cost moat)
- CF deploys with `wrangler deploy` unchanged (no new infra)

DEFER further if:
- Still in preview / breaking changes monthly
- Requires new runtime primitives not available in standard DO

### Key Files to Modify (if adopted)

```
worker/services/sandbox/factory.ts          — replace factory with CF Think runtime
worker/agents/operations/PhaseWorkflow.ts   — replace Mastra Fibers? or keep as-is
worker/agents/core/subagents/TeamLeadCoordinator.ts — replace DO fan-out
```

---

## S9 Spike 2 — Memori Labs Memory Pilot

### Goal
Wire Memori Labs TS SDK behind a `MemoryClient` interface and benchmark against stateless baseline on vibesdk phase-trace data.

### Package — BLOCKED (iteration 19 finding)

```
# @memori.ai/memori-api-client@6.23.0 is React-only ("React library to integrate
# a Memori in your app or website") — CF Workers incompatible (requires browser DOM).
# Cannot use in worker/ runtime directly.
```

**Unblocking options:**
1. Memori REST API — call their HTTP endpoints directly (no SDK); check CORS/auth model
2. Memori MCP integration — they ship an MCP server; vibesdk could call via MCP from the agent side
3. Find a CF Workers–compatible TS client for the Memori API (check `memorilabs.ai/docs/memori-cloud/`)

**Status:** BLOCKED until a CF Workers–compatible client path is confirmed. Carry to S10 if unblocked. If blocked indefinitely, fall back to Mem0 REST API (fetch-based, no DOM dependency).

### Interface Contract (to implement)

```typescript
// worker/services/memory/AgentMemoryClient.ts
export interface AgentMemoryClient {
    /** Store a completed phase trace for future retrieval. */
    storePhaseTrace(sessionId: string, phase: PhaseConceptType, verdict: EvalVerdict): Promise<void>;
    /** Retrieve relevant past traces given a new phase query. */
    recallRelevantTraces(userQuery: string, blueprintHash: string, topK?: number): Promise<PhaseTrace[]>;
    /** Flush session memory (user delete, session expiry). */
    evictSession(sessionId: string): Promise<void>;
}

export interface PhaseTrace {
    phaseName: string;
    userQuery: string;
    blueprintHash: string;
    evalScore: number;
    evalPassed: boolean;
    implementedFiles: string[];
    storedAt: number;
}
```

### Benchmark Protocol

```
# schema: metric|baseline|memori_target|measurement_method
Phase plan token count|P50 measured|≤5% delta|token counter in EvalGate
EvalGate faithfulness score|0.72 current P50|≥0.78 (Memori enriched)|runEvalGate verdict
Phase impl time (ms)|P95 measured|≤10% regression|DO timing log
Memory fetch latency|N/A (stateless)|≤50ms P95|traced in MemoryClient
Context window used by memory|0%|≤4.97% (LoCoMo benchmark)|token counter
LoCoMo score (if testable)|N/A|≥75% target|Memori SDK eval tool
```

### Pilot Session Design

1. **Baseline run** — 5 sessions, same blueprint, stateless (current prod behavior). Record evalScores + token counts.
2. **Memori run** — same 5 blueprints, MemoryClient populated from prior sessions. Record uplift.
3. **Decision**: if faithfulness ↑≥5% with latency ≤50ms → ADOPT for S10; else DEFER.

### Implementation Steps

```
# schema: step|file|action
1|worker/services/memory/AgentMemoryClient.ts|Define interface (above)
2|worker/services/memory/MemoriMemoryClient.ts|Implement w/ @memori.ai SDK
3|worker/services/memory/NullMemoryClient.ts|No-op fallback (default)
4|worker/agents/core/behaviors/phasic.ts|Inject MemoryClient; call storePhaseTrace + recall
5|worker/index.ts or wrangler.jsonc|Wire Memori API key from secrets
6|test/worker/services/memory/|Unit tests (MemoriMemoryClient + NullMemoryClient)
```

### Key Risk: DO Lifetime

Memori is an external API call. All calls must:
- Be non-blocking for the generation pipeline (`void` or timeout-guarded)
- Fail gracefully: `NullMemoryClient` is the fallback if Memori unreachable
- Not require a new DO namespace (Memori stores server-side; no DO storage change)

---

## Follow-up: LiteLLM Town Hall (May 18 2026)

Monitor for **Managed Agents Platform Alpha** announcement. If released:
- Re-evaluate model-routing layer in `worker/agents/inferutils/config.ts`
- Check if LiteLLM Proxy can replace the ad-hoc provider switching in `AGENT_CONFIG`
- If CF-native LiteLLM gateway available → potential cost reduction on inference routing

---

## Decision Matrix

```
# schema: item|status|trigger|effort|impact
CF Think Fibers|S9 NOW|@cloudflare/think experimental (stable enough for Fibers)|2d|HIGH — crash recovery
CF Think subAgent RPC|S9 NOW|Same as Fibers|1d|HIGH — parallel phase execution
CF Think Execution Ladder|S10 DEFER|npm stable tag (GA)|2d|HIGH if replaces factory
Memori Labs pilot|BLOCKED|CF-compatible client path|5d|MEDIUM quality uplift
LiteLLM Managed Agents|MONITOR|May 18 2026 town hall|1d eval|LOW-MEDIUM
```

---

## Relationship to ADR-005

ADR-005 governs S8 (shipped). This ADR governs S9 exploration — it does NOT override ADR-005 decisions. Mastra remains INCLUDE regardless of CF Project Think outcome; they solve different layers (workflow orchestration vs runtime execution model).
