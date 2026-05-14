# ADR-005 — Agent Stack Selection: Mastra / Hermes / ApeRAG / Claude Skills

**Status:** ACCEPTED  
**Date:** 2026-05-14  
**Decided by:** Orchestrator (8-agent decision panel: 4 Analysts + 4 Architects)  
**Triggered by:** Owner directive — deep research on proposed stack before S8 implementation  
**Research basis:** Web research + runs 001–011, ADR-001 through ADR-004

---

## Context

Owner proposed a four-tool stack for vibesdk S8:

| Tool | Proposed role |
|---|---|
| Mastra AI (mastra-ai/mastra) | Multi-agent workflow orchestration |
| Hermes Agent (NousResearch/hermes-agent) | Self-improving sub-agent runtime |
| ApeRAG (apecloud/ApeRAG) | GraphRAG + hybrid retrieval backend |
| Claude/Mastra Skills | Skill library for agent capabilities |

vibesdk's architectural constraints that any stack choice must respect:

1. **Cloudflare-native** — every component must run on Cloudflare Workers / Durable Objects or be consumed as an external API call. No K8s, no self-hosted databases, no Python sidecars.
2. **43× cost moat** — adding infra that destroys the $/session advantage documented in `INFRASTRUCTURE.md` is a blocker.
3. **TypeScript-first** — the entire codebase (`worker/`, `src/`) is TypeScript. Language mismatches require a bridging process that adds complexity and latency.
4. **Existing patterns** — DO-per-session, SQLite-backed state, WebSocket streaming, phased state machine (IDLE→PHASE_GENERATING→PHASE_IMPLEMENTING→REVIEWING→IDLE).

---

## Research Summary

### Mastra AI

- **Maturity:** 1.0 stable (January 2026). Production deployments at Replit, PayPal, Brex, SoftBank.
- **Language:** TypeScript-native.
- **Cloudflare fit:** `@mastra/deployer-cloudflare` package ships a CloudflareDeployer that bundles agents + workflows and generates `wrangler.jsonc`. DO-backed SQLite storage adapter added in changelog-2026-03-12.
- **Workflow model:** Explicit graph — `.then()`, `.branch()`, `.parallel()` — matching vibesdk's phased code generation flow.
- **Known gap:** Observability (traces) cannot be stored in Cloudflare-only setup; requires ClickHouse or PostgreSQL sidecar for Studio traces. Metrics-only path works natively.
- **Stars:** 23.9k+ (stable growth curve).
- **Verdict: INCLUDE.**

### Hermes Agent (NousResearch)

- **Maturity:** v0.13.0 (May 2026). Fast-growing (95k+ stars in 7 weeks post-launch Feb 2026).
- **Language:** **Python 88%**, TypeScript 8.8% (CLI only).
- **Cloudflare fit:** NONE. Documented serverless targets are Modal and Daytona. No Cloudflare Workers reference. Requires Python 3.11 runtime, `uv`, Node.js, `ripgrep`, `ffmpeg`, Git.
- **Self-improving loop:** Autonomous skill creation from experience, FTS5 cross-session recall, Honcho dialectic user modeling — compelling concept, wrong runtime for vibesdk.
- **MCP support:** Yes — but via stdio/HTTP transport from a Python process, not a Worker binding.
- **Verdict: AVOID.** Language + runtime mismatch is fatal. The self-improvement pattern can be replicated with Cloudflare Project Think + Mastra workflows + Claude Skills (see §Better Alternatives).

### ApeRAG (ApeCloud)

- **Maturity:** Production GA, Helm chart for K8s.
- **Language:** Python.
- **Deployment:** **Kubernetes mandatory.** Four databases required: PostgreSQL (metadata), Redis (Celery job queue), Qdrant (vector embeddings), Elasticsearch (full-text index).
- **Features:** GraphRAG, hybrid retrieval (vector + graph + full-text + summary + vision), deeply modified LightRAG, entity normalization, MCP integration.
- **Cloudflare fit:** NONE. Adds 4 databases + K8s cluster. Destroys 43× cost moat.
- **Verdict: AVOID.** GraphRAG and hybrid retrieval capabilities are approximated by Cloudflare Vectorize + D1 edge-native knowledge graph (confirmed viable in research, 15-25ms, under 5M vector limit adequate for S2-S4 traffic). ADR-004 already selected this path.

### Claude / Mastra Skills

- **Maturity:** Universal SKILL.md standard open-sourced by Anthropic in December 2025; adopted by OpenAI for Codex CLI and ChatGPT. 245+ community skills as of Q1 2026.
- **Cross-platform:** Claude Code, Cursor, Gemini CLI, Codex CLI, Antigravity IDE — same `SKILL.md` files work everywhere.
- **Cloudflare fit:** N/A — skills run in the Claude Code / agent process, not the Worker. Orthogonal.
- **Verdict: INCLUDE.** Already in use this session. Build vibesdk-specific skills (effortEstimator, phase-debug, ag-ui-test) to encode institutional knowledge.

---

## Better Alternatives Identified

### Cloudflare Project Think (`@cloudflare/think`) — EVALUATE

- **Released:** April 15-21, 2026 (Agents Week 2026). Currently in preview.
- **What it is:** A durable agent runtime built directly on Durable Objects — same infrastructure vibesdk runs on.
- **Capabilities that directly overlap vibesdk bespoke code:**

| Project Think primitive | vibesdk equivalent today | Gap |
|---|---|---|
| Fibers (durable execution, crash recovery, checkpointing) | `AbortController` pattern + ephemeral DO | Bespoke, no crash recovery |
| Sub-agents (isolated child DOs w/ typed RPC) | `getAgentStub()` + `agentStub.handleUserInput()` | Manual, no isolation contract |
| Persistent Sessions (tree-structured messages, forking, compaction, FTS) | `conversationMessages` in DO SQLite | No forking, no FTS, no compaction |
| Execution Ladder (Workspace → Dynamic Worker → npm → browser → Sandbox) | `worker/services/sandbox/factory.ts` (bespoke tiers) | Duplicates Execution Ladder |

- **Decision:** Engineering spike required. If `@cloudflare/think` reaches GA with stable API before S9, it becomes the primary substrate replacing much of `worker/agents/core/`. Do not refactor current code toward Project Think during preview — wait for stable contract.
- **Verdict: SPIKE in S9, DEFER refactor until GA.**

### Cloudflare Vectorize + D1 Edge-Native GraphRAG — INCLUDE

- **Why it beats ApeRAG for vibesdk:** Same platform, no new vendors, 15-25ms retrieval, zero-config from Workers.
- **Pattern:** D1 stores entity nodes + edges (knowledge graph), Vectorize stores semantic embeddings, hybrid query merges both — replicates ApeRAG's core value without K8s.
- **ADR-004 already selected this path.** No change needed.

### Memori Labs (v3.3.3, 14.4k★, Apache 2.0, TS SDK) — SPIKE

- **Why relevant:** 81.95% LoCoMo recall at 4.97% context tokens — radically more token-efficient than Mem0 (91.6% LoCoMo at higher token cost). Free dev tier, MCP plugin, TS SDK.
- **Decision:** Three-way pilot (Memori vs Mem0 vs CF Agent Memory) per ADR-004 open thread. Wire Memori TS SDK behind `MemoryClient` interface in S2 spike. Pick winner based on vibesdk phase-trace data.
- **Verdict: SPIKE (S2, already in ADR-004 action plan).**

---

## Final Decision Matrix

```
# schema: tool|decision|rationale|sprint
Mastra AI|INCLUDE|TypeScript, CF deployer, DO storage, explicit graph workflows, production-proven|S8
Hermes Agent|AVOID|Python 88%, no CF Workers support, requires Python 3.11 + uv + ripgrep + ffmpeg|never
ApeRAG|AVOID|K8s + 4 databases, destroys 43x cost moat, Python, ADR-004 already selects CF Vectorize|never
Claude/Mastra Skills|INCLUDE|Already adopted, cross-platform SKILL.md standard, extend for vibesdk skills|ongoing
CF Project Think|SPIKE → DEFER|Same DO/SQLite substrate, covers Fibers+Sub-agents+Sessions+Sandbox Ladder, preview only|S9 spike
CF Vectorize + D1 RAG|INCLUDE|Already decided ADR-004, 15-25ms, zero external infra|S2
Memori Labs|SPIKE|81.95% LoCoMo @ 4.97% tokens, TS SDK, free tier, compare vs Mem0 in S2 pilot|S2
```

---

## What Mastra Adds to S8

The Mastra integration (accepted) brings:

1. **Typed workflow graphs** — replace ad-hoc `Promise.all()` fan-outs in `runMultiAgentPhase()` with explicit `.parallel()` branches that Mastra can checkpoint, retry, and observe.
2. **Cloudflare DO storage adapter** — `MastraDOStorage` replaces custom `this.state.*` calls with a Mastra-managed schema-validated layer.
3. **Built-in evals** — Mastra ships eval primitives; wire into the `EvalGate.ts` planned in ADR-004 instead of porting DeepEval metrics manually.
4. **Observability via composite storage** — route traces to Cloudflare (DO) for agent state, route observability events to a cheap external ClickHouse-compatible endpoint (Baselime on Cloudflare, free tier).

**What Mastra does NOT replace:**
- Durable Object lifecycle management (stay with existing DO class)
- WebSocket layer (`worker/agents/core/websocket.ts`) — Mastra's streaming is HTTP/SSE-first; vibesdk WebSocket is a feature, not a bug
- `SimpleCodeGeneratorAgent` state machine — wrap it, don't replace it

---

## Implementation Scope for S8 (Mastra Integration)

Minimal integration — no DO refactor:

1. **`worker/services/mastra/client.ts`** — Mastra instance factory, lazy-init, CF deployer config
2. **`worker/agents/operations/PhaseWorkflow.ts`** — Mastra workflow wrapping existing `runMultiAgentPhase()` steps with `.parallel()`, `.branch()`, `.then()`
3. **`worker/services/mastra/evalGate.ts`** — Mastra eval step replacing bespoke DeepEval port planned in ADR-004 S2
4. **`worker/services/mastra/storage.ts`** — `MastraDOStorage` adapter backed by DO SQLite (reuses existing `this.env.SESSION_DO`)
5. **vibesdk Skills package** (`skills/vibesdk/`) — 3 skills: `phase-debug`, `cost-preview-troubleshoot`, `ag-ui-test`

**Acceptance gates:**
- Mastra PhaseWorkflow executes a 3-phase generation and produces identical output to current code
- Eval step emits faithfulness + hallucination scores to WebSocket as `state_delta` event
- Skills load in Claude Code session and surface vibesdk-specific commands
- No regression on existing WebSocket streaming, AG-UI events, webhook routes

---

## Dissenting Views (preserved per panel protocol)

- **@Analyst-Risk:** "Mastra 1.0 on Cloudflare still lacks full observability. Adding it in S8 before we have production traffic means we instrument nothing. Wait for CF traces support." — Overruled. Composite storage with Baselime handles traces; instrumenting now is cheaper than retrofitting post-traffic.
- **@Arch-Scale:** "Hermes' self-improving loop is genuinely novel — we should prototype it in a Docker container sidecar, not discard it." — Overruled. Sidecar violates constraint #1 (Cloudflare-native). The pattern, not the implementation, is the lesson; reimplement with Mastra + Skills.
- **@Analyst-Commercial:** "ApeRAG's GraphRAG entity normalization is 2-3 years ahead of Cloudflare D1 naive graph." — Partially accepted. True for large corpora. Revisit when vibesdk exceeds 100k indexed documents; by then ApeRAG may have a managed cloud tier.

Panel vote: **6/8 ACCEPT**, 2 dissent (preserved above).

---

## Open Threads Carried Forward

- `@cloudflare/think` GA timeline: watch CF changelog; re-evaluate in S9
- Memori vs Mem0 three-way pilot: S2 spike (ADR-004 action plan)
- LiteLLM Managed Agents Platform Alpha (May 18 Town Hall): re-scan in next research cycle; may affect model-routing decision
- ApeRAG managed cloud tier: BLOCKED until product announcement; re-check at 100k document milestone
