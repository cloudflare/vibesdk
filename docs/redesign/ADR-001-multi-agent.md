# ADR-001 — Multi-Agent Architecture: Custom DO Fan-Out

**Status:** PROPOSED (pending full Decision Panel per CRITIQUE C10)
**Date:** 2026-04-24
**Deciders:** @Architect, Decision Panel (8 agents)
**Skill invoked:** `engineering:architecture`, `autonomous-agents`, `llm-app-patterns`

## Context

VibeSDK currently runs a single monolithic `SimpleCodeGeneratorAgent` Durable Object (~2800 LOC) that serializes planning, coding, and testing. We want to decompose into specialized sub-agents (Manus-style) to enable parallelism, plan critique, and model tiering.

## Decision

Adopt **custom Durable Object fan-out**: a `TeamLeadAgent` DO owns session state and spawns specialized sub-agent DOs (`PlannerAgent`, `CoderAgent`, `TesterAgent`, `CriticAgent`) that communicate via DO-to-DO RPC, sharing state through a central plan table in D1.

## Options Considered

| Option                     | Pros                                                | Cons                                           |
|----------------------------|-----------------------------------------------------|------------------------------------------------|
| 1. **Custom DO fan-out**   | On-platform; DO = perfect primitive; no new deps    | We own orchestration; more testing burden      |
| 2. LangGraph on Workers    | Mature graph engine; community patterns             | Python footprint awkward on Workers; extra dep |
| 3. smolagents (HF)         | Lightweight; HF ecosystem                           | Not Workers-native; Python runtime             |
| 4. CopilotKit AG-UI        | Great frontend state sync                           | Backend-agnostic ≠ backend-solved              |

## Rationale

- **@Arch-Pragmatist:** DO primitives (isolation, storage, RPC, alarm) match our need exactly. Adding a framework = accidental complexity.
- **@Arch-Scale:** DO fan-out scales horizontally by default; each sub-agent isolated.
- **@Arch-Security:** No net-new dependencies = no net-new CVEs.
- **@Arch-Maintainability:** Custom ≠ bespoke-forever; contracts are stable, each sub-agent testable in isolation.
- **@Analyst-Commercial:** No licensing; no runtime surprise; cheapest path to GA.

## Consequences

**Positive:**
- Each sub-agent has narrow surface area (~300-500 LOC target)
- Independent deploy/rollback per agent
- Natural model-tiering boundary (one agent = one model tier)
- Plan red-teaming becomes a first-class primitive

**Negative:**
- We must define and maintain the RPC contract ourselves
- Testing requires DO emulation (miniflare) discipline
- Adds 3 new DO classes to `wrangler.toml`
- File-write coordination (see CRITIQUE C2) needs explicit partitioning strategy

## Storage Pattern (resolves CRITIQUE C1)

- **D1** owns: `plan_nodes`, `agent_budgets`, `files_index`
- **TeamLeadAgent DO** owns: session-scoped file contents in its SQLite (single-writer)
- **Sub-agent DOs** are **compute-only** (no persistent SQLite write) — propose changes via RPC to TeamLead
- On TeamLead crash → DO re-hydrates from D1 + SQLite; sub-agents are restartable

## File Write Partitioning (resolves CRITIQUE C2)

Planner partitions the file set at plan-time:

```ts
interface PlanNode {
  id: string;
  type: 'milestone' | 'task';
  ownedFiles: string[];   // globs, non-overlapping across siblings
  assignedAgent?: string; // coder-1 | coder-2 | ...
}
```

TeamLead validates non-overlap before spawning Coders. Two Coders never touch the same file. Post-write, TeamLead commits via git (serial) — Coders propose patches, TeamLead commits.

## RPC Contract

```ts
// Shared across all sub-agents
interface SubAgentRPC {
  start(task: Task, ctx: SharedCtx): Promise<{ streamUrl: string }>;
  abort(): Promise<void>;
  getStatus(): Promise<AgentStatus>;
}

interface Task {
  planNodeId: string;
  prompt: string;
  ownedFiles: string[];
  modelTier: 'haiku' | 'sonnet' | 'opus';
  budgetTokens: number;
}

interface SharedCtx {
  sessionId: string;
  blueprint: Blueprint;
  fileTreeReadUrl: string;  // HTTPS to TeamLead DO read-only
  planSnapshot: PlanNode[];
}

// TeamLead-only
interface TeamLeadRPC extends SubAgentRPC {
  proposePatch(agentId: string, patch: FilePatch[]): Promise<{ accepted: boolean; rejectReason?: string }>;
  critiqueRequest(planSubtree: PlanNode[]): Promise<CriticVerdict>;
}
```

## Model Tiering (resolves tier-routing)

Each sub-agent invocation includes `modelTier` in Task. Sub-agents call LLM via shared `inferutils` layer that routes on tier. Defaults:

| Agent     | Default tier   | Entitlement upgrade path          |
|-----------|----------------|-----------------------------------|
| TeamLead  | Sonnet-H       | → Opus on Team+                   |
| Planner   | Sonnet-H       | → Opus on Team+                   |
| Coder     | Sonnet-M       | → Sonnet-H on Pro+, Opus on Ent   |
| Tester    | Haiku / Sonnet-L | unchanged                       |
| Critic    | Opus           | Pro+ only (entitlement gate)      |

## Critic Budget (resolves CRITIQUE C3)

- Max 2 critique rounds per plan
- Each round capped at `budgetTokens` from entitlement
- After 2 rounds, force-execute with "contested" flag visible in UI
- `plan_nodes.critic_rounds` column persists count

## Failure Modes

| Failure                         | Behavior                                      |
|---------------------------------|-----------------------------------------------|
| Sub-agent DO crashes            | TeamLead retries once, then marks node failed |
| TeamLead crashes mid-plan       | Re-hydrate from D1; resume pending nodes      |
| Model call times out            | Retry w/ same tier 1x; then escalate tier 1x  |
| Critic stuck rejecting          | Force-accept after 2 rounds                   |
| User aborts                     | TeamLead broadcasts abort; all sub-agents exit|

## Migration

See `ARCHITECTURE.md` section "Migration Plan" — 7 steps, feature-flagged per session.

## Rollback

Feature flag `multiAgentEnabled=false` routes to existing `SimpleCodeGeneratorAgent` path. Maintained in parallel for 2 full sprints post-GA.

## Open Questions → @Critic

- Q1: Plan versioning on user mid-session pivot → resolved in ADR-002 (not yet written)
- Q2: Observability / tracing → ADR-003
- Q3: Cross-session sub-agent pooling (cost optimization) → post-GA

## References

- CRITIQUE.md — all challenge items this ADR addresses
- ARCHITECTURE.md — target-state diagrams
- Cloudflare Durable Objects docs (verify RPC limits pre-M2)
