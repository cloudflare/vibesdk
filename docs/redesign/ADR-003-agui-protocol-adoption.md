# ADR-003 — AG-UI Protocol Adoption for Agent → Client Streaming

**Status:** ACCEPTED-DEFERRED (2026-05-12) — implementation scheduled for Sprint S3 start
**Date:** 2026-05-12
**Deciders:** @Architect, @Frontend-Lead, @Product
**Skill invoked:** `engineering:architecture`, `llm-app-patterns`
**Supersedes / relates to:** ADR-001 (multi-agent fan-out — defines the message producers)

## Context

AG-UI Protocol is a bi-directional HTTP/SSE wire format for agent ↔ frontend communication, defining event types like `STATE_SNAPSHOT`, `STATE_DELTA`, streaming chat, tool calls, and human-in-loop. It is maintained by CopilotKit and has emerged as the de-facto standardisation candidate in the agentic UI space.

Per Research Run 001 (`docs/redesign/research/2026-05-12-1323-run001.md`, §10): CopilotKit raised **$27M (TechCrunch, May 2026)** to push AG-UI as the standard. Backed by **Google, Microsoft, Amazon, Oracle**; integrated by LangChain / Mastra / PydanticAI / Agno; production users include Deutsche Telekom, Docusign, Cisco, S&P. Millions of installs/week. No comparable open standard has equivalent momentum as of this date.

VibeSDK currently emits bespoke WebSocket messages (`AgentStatusMessage`, `PlanUpdateMessage`, `CriticVerdictMessage` — `worker/api/websocketTypes.ts:560+`) consumed by a hand-rolled subscriber (`src/components/agents/useAgentStream.ts`).

## Decision

**Adopt AG-UI Protocol** for streaming agent state from `worker → client`, replacing the bespoke WebSocket message types defined in ADR-001's S1 backbone. Adoption begins **Sprint S3 start**, after S2 demo lands.

## Migration Plan (Sprint S3, ~2–3 days)

1. **Install** `@ag-ui/sdk` (client) + `@ag-ui/server` (worker) packages. Wire the server emitter into the existing PartySocket transport — AG-UI is transport-agnostic, so PartySocket continues as the carrier.
2. **Map** existing message shapes → AG-UI event types:
   - `AgentStatusMessage` → `STATE_DELTA` scoped to `agents[agentId]`
   - `PlanUpdateMessage` → `STATE_DELTA` / `STATE_SNAPSHOT` scoped to `plan.nodes[id]`
   - `CriticVerdictMessage` → custom event under AG-UI's `extensions` namespace (verdict semantics are vibesdk-specific)
3. **Replace** `src/components/agents/useAgentStream.ts` WebSocket subscribe block with the `@ag-ui/sdk` client subscribe. Hook API surface (returned `AgentSnapshot[]`, `PlanNode[]`) stays unchanged — only the wire decoder changes.
4. **Keep** `AgentSnapshot` and `PlanNode` TypeScript types **as-is**. These are our domain model. AG-UI is just the wire format; we project AG-UI events into our types at the boundary.

## Why DEFER, not ADOPT NOW

- **S1 demo timeline is the binding constraint.** The bespoke types in `websocketTypes.ts:560+` are working, tested, and feeding `AgentsDock`. Swapping the wire format pre-S1 adds 1–2 weeks of integration + re-test risk for zero demo-visible benefit.
- **Mechanical swap, reversible.** Because we project the wire into our own domain types, the change is isolated to two files (server emitter, client subscriber). Doing it post-S2 carries the same engineering cost as doing it now, minus the demo risk.
- **Protocol still maturing.** One extra sprint of observation lets us catch any post-funding schema churn.

## Trade-offs

**Gain:**
- Alignment with a Google/MS/Amazon/Oracle-backed standard — credible "open agent protocol" positioning.
- Future CopilotKit React integration becomes drop-in (their components consume AG-UI natively).
- Smaller WS message footprint via `STATE_DELTA` (incremental) vs. our current full-object pushes.
- Compatible with the AG-UI inspector / debug tooling ecosystem.

**Lose:**
- 2–3 days of S3 engineering time.
- One additional npm dependency on each side (small, but non-zero CVE surface — flagged for `aikido` scan post-adoption).
- Soft lock-in to AG-UI's event taxonomy for any future custom event.

## Consequences

- **Smaller WS payload:** delta-based encoding reduces per-message bytes vs. our current full-snapshot pushes on every status change.
- **Debugger compatibility:** AG-UI Inspector and CopilotKit DevTools work out-of-the-box against our stream — frees us from building bespoke agent-trace tooling.
- **Frontend ecosystem ready:** if/when we add CopilotKit React components (e.g., for in-app agent chat surfaces), no adapter layer needed.
- **Custom events stay possible:** `CriticVerdictMessage` and any future vibesdk-specific event ride AG-UI's `extensions` namespace — we are not boxed in.
- **Net code reduction:** `useAgentStream.ts` simplifies (no manual type-narrowing on `message.type`); the bespoke union in `websocketTypes.ts` can be deleted post-cutover.

## Re-evaluation Trigger

Re-open this ADR if **any** of the following occurs:
- AG-UI Protocol is superseded by a competing open standard with comparable backer breadth.
- Any **one** of Google / Microsoft / Amazon / Oracle publicly drops sponsorship or ships a competing schema.
- CopilotKit's funding/governance changes in a way that risks the spec going closed.
- Schema-breaking change in AG-UI between S2 close and S3 start.

## References

- `docs/redesign/research/2026-05-12-1323-run001.md` — §10 CopilotKit + AG-UI, §"5 Highest-Leverage Insights" #2
- `worker/api/websocketTypes.ts` — lines 560+ (`AgentStatusMessage`, `PlanUpdateMessage`, `CriticVerdictMessage` — the shapes being replaced)
- `src/components/agents/useAgentStream.ts` — current bespoke subscriber
- ADR-001 — defines the message producers in the multi-agent fan-out
