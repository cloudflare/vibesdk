# ADR-004 — Memory / RAG / Eval Layer Strategy

**Status:** ACCEPTED (autonomous decision per Owner directive "take decision as needed")
**Date:** 2026-05-13
**Decided by:** Orchestrator (Architect lens + Pragmatist lens converged)
**Triggered by:** Research run 003 (`docs/redesign/research/2026-05-13-0007-run003.md`)

## Context

Run 003 surfaced three first-tier gaps vs SOTA agent platforms:

| Gap | vibesdk | SOTA peer | Severity |
|---|---|---|---|
| Long-term memory | none (per-DO state only) | Mem0 (91.6 LoCoMo), Zep (94.8 DMR), Letta Context Repos | **HIGH** |
| RAG / vector retrieval | none | LightRAG + Infinity (1ms / 12k+ QPS) | MED |
| Eval pipeline | none | DeepEval 50+ metrics, RAGAS for RAG | **HIGH** |
| Model routing | bespoke BYOK + `inferutils/core.ts` | OpenRouter / LiteLLM / Portkey | **HIGH** |

The competitive window: Cloudflare Q2 2026 shipped **Agent Memory**, **AI Search** (hybrid retrieval), and **Sandbox GA** as first-party primitives on the same platform vibesdk runs on. This is a one-vendor drop-in path that preserves the 43× cost moat documented in `INFRASTRUCTURE.md`.

## Decision

**Adopt Cloudflare-native primitives for memory + RAG. Build eval pipeline w/ DeepEval-equivalent metrics emitted from existing phase loop. Defer model-routing rewrite to S2 — current BYOK works.**

Specifically:

| Layer | Choice | Rationale |
|---|---|---|
| **Long-term memory** | Cloudflare Agent Memory (Session API + per-agent DO w/ SQLite) | Same platform, zero net-new vendors, persistent system-prompt blocks fit our phase-by-phase flow |
| **RAG / vector** | Cloudflare AI Search (hybrid: dense + BM25 + filtering) | Removes need to self-host Pinecone/Infinity; we already pay CF for everything else |
| **Eval pipeline** | TS port of DeepEval's 4 core metrics (faithfulness, answer-relevancy, tool-correctness, hallucination) emitted as Critic phase outputs | DeepEval is Python pytest-style — porting just the 4 metrics that map to our IDLE→PHASE_GEN→PHASE_IMPL→REVIEWING states is cheaper than spawning a Python sidecar |
| **Model routing** | Defer to S2 — keep `inferutils/core.ts` + BYOK; revisit when fallback chains become a hot bug | Premature; no production traffic yet |

## Why not best-of-breed (Mem0 + Infinity + E2B)?

| Argument | Weight |
|---|---|
| Mem0 better LoCoMo than CF Agent Memory | 0 — CF Agent Memory has no published LoCoMo score yet, but CF moat is platform unification, not raw benchmark |
| Infinity 1ms vector latency unbeatable | -1 — vibesdk has ≤10k embeddings projected for S1-S3; latency floor is not the bottleneck |
| E2B Firecracker microVMs faster cold-start | Already ADR-002'd — defer until vibesdk crosses 4 trigger conditions |
| Vendor diversification = lower lock-in risk | -2 — vibesdk's *moat* is CF-native efficiency; diversifying erodes it |

Converged 7/8 in panel debate. Single dissent: @Analyst-Risk flagged "CF Agent Memory has 6mo of production track record" — accepted as known risk, mitigated by clean abstraction layer (see §Interface).

## Implementation plan

**S1 (current sprint)** — no work, ADR documented only.

**S2 (next sprint)** — concrete deliverables:
1. `worker/services/memory/AgentMemoryClient.ts` — thin adapter over CF Agent Memory Session API
2. `worker/services/retrieval/AISearchClient.ts` — thin adapter over CF AI Search
3. `worker/agents/operations/EvalGate.ts` — emits 4 DeepEval-equivalent metrics per phase, gates promotion from REVIEWING → IDLE
4. Migration `0008_memory_eval_tables.sql` — `memory_blocks`, `eval_results` tables
5. Wire EvalGate into `CriticAgent.runRedTeam()` — already returns risk_register; extend w/ metric scores

**Acceptance gates** (per @PM mandate):
- Real session generates plan, persists memory block tagged w/ userId
- New session by same user retrieves prior style preferences
- AI Search returns ≥3 relevant prior generations on similar prompt
- EvalGate blocks promotion when faithfulness < 0.6 or hallucination > 0.2
- @QA-Lead walks full flow in browser — not just unit tests

## Interface (abstraction so we can swap later)

```ts
// worker/services/memory/types.ts
export interface MemoryClient {
  recall(userId: string, query: string, k: number): Promise<MemoryBlock[]>;
  remember(userId: string, block: MemoryBlockInput): Promise<void>;
  forget(userId: string, blockId: string): Promise<void>;
}

// worker/services/retrieval/types.ts
export interface RetrievalClient {
  search(query: string, filters?: RetrievalFilters): Promise<RetrievalHit[]>;
  index(documents: RetrievalDocument[]): Promise<void>;
}
```

Both interfaces are thin enough that swapping CF → Mem0/Infinity is a one-file change if CF primitives disappoint.

## Cost ceiling

- CF Agent Memory billing: per-DO usage — already in our cost model
- CF AI Search: per-query + per-MB indexed — projected <$5/mo at S2 traffic
- DeepEval-equivalent metrics: zero net cost (runs inside existing Critic Claude call)

Total net-new monthly cost: **<$5** until traffic grows past 10k sessions/mo.

## Open threads

- Letta Code is a direct competitor (run 003 §1.2); next features-pillar run (run 004) should deep-dive on their Context Repository pattern — we may want to extend our git-versioned filesystem to also version *conversation + blueprint state*.
- TrustLLM status (run 003 §5) still BLOCKED — defer eval framework selection decision until confirmed.
- Model-routing layer revisit deferred to S3; if traffic spikes uncovered fallback bugs sooner, escalate to S2.
