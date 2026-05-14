# Cycle 5 — 2026-05-14 IST

Sources: run019 (architecture), run020 (features), run021 (tech), run022 (market). Prior: CUMULATIVE-SUMMARY-CYCLE-4.md.

---

## What changed (4-pillar synthesis)

### Architecture deltas (vs Cycle 4)

- **CF Dynamic Workflows (May 1, MIT npm)** (run019). `createDynamicWorkflowEntrypoint()` + `wrapWorkflowBinding()` provides durable parallel workflow dispatch per tenant. Directly implements the infrastructure ADR-007 Option A assumes. Each CoderAgent phase could be a Dynamic Workflow instance with isolated execution context. **Billing starts May 26** — $0.002/worker/day after 1,000/month free. vibesdk S10 parallel sub-agent work must ship before May 26. Cost impact: +$0.008/session (4 agents × $0.002) — negligible vs 43× CF cost moat.

- **CF DO Facets (Apr 13 open beta)** (run019). `this.ctx.facets.get()` — dynamically loaded DO classes with isolated SQLite. vibesdk's multi-DO architecture IS already functionally equivalent (SessionDO → CoderAgent DOs). Migration to Facets API would clean code but is not blocking. **DEFER S11.**

- **Mastra v1.30 — Durable Agents + Resumable Streams** (run021). Inngest-backed evented engine provides mid-step resume on disconnect. vibesdk PhaseWorkflow does NOT survive DO hibernation mid-phase — if CF DO hibernates during a 4-minute phase, phase restarts from scratch. Mastra v1.30 + Inngest = CF Workers compat checkpointing. **Action S11 P2: wire PhaseWorkflow to Inngest.**

- **Mastra v1.31 — Platform Channels (Slack)** (run021). `@mastra/slack` with ChannelProvider + threaded conversations. Phase-complete Slack notifications: when PHASE_IMPLEMENTED fires, route to Slack thread. **Action S11 P2.**

### Feature deltas (vs Cycle 4)

- **Lovable: Built-in Payments (Paddle + Stripe)** (run020, April 24). Lovable now scaffolds subscriptions + one-time payments as a built-in feature. vibesdk has no equivalent — users must implement payments from scratch in phase generation. **Gap: HIGH. Action S10 P1: payments template scaffold (select "SaaS with payments" at project creation → Phase 1 pre-scaffolds Stripe/Paddle).**

- **Lovable: 14 new connectors** (run020, April 24). Google Workspace, M365, BigQuery, Databricks, Snowflake, Asana, HubSpot, etc. Lovable building connector marketplace. **vibesdk response: OSS template-based connectors (generated code) over proprietary connector lock-in. Maintain advantage.**

- **Cursor Canvases** (run020, May 13). Agents render interactive React UIs (charts, tables, forms) in the chat panel instead of text. vibesdk's EvalGate broadcasts raw scores via WebSocket — next evolution is a "phase canvas" ReactComponent in the sidebar. **Action S11 P3: PhaseCanvas WebSocket message type → interactive quality dashboard.**

- **Cursor multi-repo cloud agents** (run020, May 13). Configure one env with all repos, re-use across sessions. Enterprise-only feature, not vibesdk use case. **No action.**

- **Mobbin MCP (May 13): 621,500 real app screens** (run020). MCP server giving AI tools access to 621,500+ UI screens from real apps (fintech, e-commerce, health, SaaS). Claude/Cursor/Lovable native integration. **Highest-impact UI quality lift for vibesdk.** Using Mobbin patterns in phase generation prompts would ground UI output in real-world patterns vs pure Tailwind text descriptions. **Action S10 P1: curate static Mobbin-style prompt corpus for common vibesdk app categories (Option B — zero external cost).**

- **Replit Agent 4: 90% auto merge-conflict resolution** (run020, ongoing). Parallel agents self-resolve merge conflicts 90% of the time. **ADR-007 validation:** vibesdk's Phase Independence Constraint eliminates conflicts entirely — counter-marketing: "100% conflict-free vs 90% auto-resolve." The remaining 10% Replit can't resolve = exactly what ADR-007 Option A avoids by design.

### Tech deltas (vs Cycle 4)

- **Claude Opus 4.7 tokenizer change** (run021, GA April 16). New tokenizer uses **1x–1.35x MORE tokens** vs prior Claude models. vibesdk currently uses claude-3-7-sonnet (not Opus 4.7) — deferred cost impact. **Action: benchmark before any Opus 4.7 upgrade. 1M context at standard pricing → evaluate as eval judge replacement (S11).**

- **Claude Sonnet 4.8 imminent** (run021, expected May 2026). +12 coding benchmark points (rare), X-high reasoning effort, vision 98%. vibesdk's coding model is claude-3-7-sonnet. **Action P0 S10: monitor Anthropic API, update AGENT_CONFIG immediately on release.**

- **KAIROS persistent agents** (run021, leaked in Sonnet 4.8 code). Anthropic building native cross-session agent state. Could obsolete Mem0RestMemoryClient path. **Action: monitor Anthropic developer conference. No immediate change to Mem0 (CF compat, GA 2026).**

- **Mastra ResponseCache** (run021, v1.33). Cache LLM step responses. **Action S10 P2: enable on PhaseWorkflow plan step (cache key: sessionId + query + blueprintHash).**

- **Mastra Agent Signals** (run021, v1.33). Inject context mid-run via `agent.sendSignal()`. **Action S10/S11 P2: evaluate as replacement for pendingUserInputs queue — real-time phase steering without phase restart.**

- **LiteLLM May-18 town hall** (run021). DEFERRED — not yet happened as of May 14. Governance features (per-agent budgets, RBAC) pending. Cycle 6 run023.

### Market deltas (vs Cycle 4)

- **Cursor $2B ARR confirmed** (run022). $29.3B valuation ($2.3B Series D). Fastest B2B scaling on record. Developer tier = Cursor-dominated. **vibesdk in non-developer / full-stack lane — no direct overlap.**

- **Emergent Wingman pivot** (run022, April 15). Emergent ($100M ARR from vibe-coding) launches autonomous background agent (WhatsApp/Telegram/iMessage). Pivoting away from pure vibe-coding → **non-developer vibe-coding market less contested. Positive for vibesdk.**

- **Lovable M&A: no new acquisitions** (run022, May 14 update). Hunt active since March 23 — no public acquisitions yet. **10 months remain in 12-18mo window.** Lovable's M&A targets (eval/orchestration/security) = vibesdk's core tech. Urgency unchanged.

- **Cloudflare Q1 2026: record revenue + 600% internal AI usage** (run022). Platform financially healthy despite RIF. DO velocity risk through 2026 confirmed but not existential. **Continue DO abstraction layer strategy.**

---

## Top-3 Findings (drives S10 engineering)

**1. Claude Sonnet 4.8 upgrade is the single highest-ROI action (P0)**
+12 coding benchmark points directly improves every vibesdk phase output. Upgrade AGENT_CONFIG immediately on release. No infrastructure change needed — 30-minute action delivering maximum quality lift.

**2. Payments scaffold closes a HIGH gap vs Lovable (P1)**
Lovable ships payments built-in (April 24). vibesdk users build payment phases from scratch. A "SaaS with payments" template option at project creation (Phase 1 = Stripe/Paddle scaffold) closes this gap in 1 day of work. Direct feature parity improvement for the non-developer market segment.

**3. ADR-007 Option A parallel dispatch is validated and differentiating (P0 ongoing)**
Replit's 90% merge-conflict auto-resolution validates the problem space. vibesdk's Phase Independence Constraint (PhaseParallel.ts ✅ + phasic.ts wiring ✅) eliminates conflicts entirely. CF Dynamic Workflows billing starts May 26 — S10 parallel implementation should ship before billing for free-window benefit.

---

## ROI Items (Cycle 5 additions)

```
# schema: item|roi_category|sprint|effort
Claude Sonnet 4.8 upgrade (AGENT_CONFIG)|quality_lift|S10 P0|0.5h
Payments template scaffold (Stripe/Paddle)|feature_parity|S10 P1|1d
Static Mobbin-style UI prompt corpus|quality_lift|S10 P1|0.5d
Mastra ResponseCache on plan step|cost_reduction|S10 P2|0.5d
Replit 90% merge → vibesdk 100% counter-marketing|positioning|S10 P2|0.5d
Phase canvas WebSocket (React component in chat)|UX_innovation|S11 P3|2d
Mastra v1.30 Inngest mid-phase resume|resilience|S11 P2|2d
Opus 4.7 eval judge evaluation (1M context)|quality_lift|S11 P2|1d
Slack phase notifications (ChannelProvider)|collab_UX|S11 P2|1d
KAIROS persistent agents (monitor)|strategic|monitor|—
```

---

## Owner Asks

1. **Payments template approval:** Should vibesdk offer "SaaS with payments" as a project creation option (Stripe + Paddle scaffold)? Lovable just shipped this — it's now a feature expectation in the non-developer market.

2. **Mobbin MCP budget:** Mobbin MCP requires a paid plan (pricing unconfirmed). Approve Mobbin Pro plan for research? Alternatively: confirm static prompt corpus approach (no cost).

3. **Claude Sonnet 4.8 test budget:** When Sonnet 4.8 releases, run a 5-session A/B test vs current model. Approve $20-30 test budget?

4. **CF Dynamic Workers billing (May 26 deadline):** S10 parallel sub-agents should ship before May 26 to use the free beta window. Confirm S10 sprint timeline.

---

## Open Threads (into Cycle 6 / S11+)

```
# schema: thread|priority|blocker|next_action
LiteLLM May-18 governance (per-agent budgets)|P3|town hall not yet|run023 cycle 6
Claude Sonnet 4.8 release|P0|API availability|monitor + update AGENT_CONFIG
@cloudflare/think dep upgrade (6-8d, S10 worktree)|P1|Zod v4 codemod ready|dedicated worktree
DO benchmark publish (p50/p95/p99)|P2|instrumentation needed|S11
CF Dynamic Workers billing impact|P1|May 26 deadline|ship S10 parallel before May 26
Lovable M&A watch (eval/orchestration targets)|strategic|10 months remain|track monthly
Emergent Wingman enterprise traction|market|early days|cycle 6 market run
KAIROS persistent agents announcement|strategic|Anthropic conference|monitor
```

---

## Cycle 5 COMPLETE

4 pillars: run019 (arch) + run020 (features) + run021 (tech) + run022 (market)

Engineering state:
- S9 COMPLETE: 13 commits, 22 files, 2,751 insertions, 27 tests, 0 TS errors
- S10 P0 in progress: PhaseParallel primitives ✅ (36d0f97), phasic.ts wiring ✅ (313add1)
- S10 P1 queued: Sonnet 4.8 upgrade, payments scaffold, Mobbin prompt corpus, ResponseCache
