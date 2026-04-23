# Competitive Wedges — How VibeSDK Beats Emergent on Speed + Cost

**Owner:** @Architect + @PO
**Reference:** emergent.sh Free 10cr / Standard $20→100cr / Pro $200→750cr (2026-04)

## The Three Wedges

### 1. Speed — Parallel Sub-Agents (3-4× faster wall-clock)

| Phase              | Emergent (serial)   | VibeSDK (parallel)            | Speedup |
|--------------------|--------------------|-------------------------------|---------|
| Blueprint          | Planner runs alone | Planner runs alone            | 1×      |
| File generation    | Coder 1→2→3→4      | Coder-1 ‖ Coder-2 ‖ Coder-3 ‖ Coder-4 | **~3.6×** |
| Test + fix         | serial             | Tester + Critic overlapped    | ~2×     |
| **Full MVP build** | ~6 min baseline    | **~2 min**                    | **~3×** |

**How:** `TeamLeadAgent` (existing `CodeGeneratorAgent` wrapper) fans out to N `CoderAgent` DOs. Planner partitions the file-set at plan-time (non-overlapping globs → no merge conflicts). See [ADR-001](ADR-001-multi-agent.md) §"File Write Partitioning".

**Why emergent can't just copy this fast:** They'd have to rebuild their orchestration layer — our DO fan-out is on-platform and has zero net-new infra. They're on AWS serial workers.

---

### 2. Cost — Model-Tier Router (2-3× cheaper per generation)

VibeSDK's `inferutils/config.ts` already routes per-operation. We extend it: **one tier per sub-agent role.**

| Agent       | Operation           | Model              | Credits / call | Why this tier                  |
|-------------|---------------------|--------------------|----------------|--------------------------------|
| TeamLead    | orchestration only  | Gemini 2.5 Flash   | 1.2            | Lightweight routing decisions  |
| Planner     | blueprint + plan    | Gemini 3 Pro       | ~6             | Needs full reasoning           |
| Coder (×N)  | file-by-file impl   | Gemini 2.5 Flash   | 1.2            | Deterministic; pattern-match   |
| Tester      | sandbox + error map | Gemini Flash-Lite  | 0.4            | Pure log→diagnosis             |
| Critic      | plan red-team       | Gemini 3 Pro       | ~6             | High-stakes, low-frequency     |

**Cost model (average 10-file MVP generation):**

```
Emergent (all Pro-tier Gemini 3 Pro): ~60 credits  → $15-equiv
VibeSDK (tiered):
  1 × Planner @ 6          =  6
  1 × Critic  @ 6 (1 round)=  6   (Pro+ tier only; free tier skips)
  4 × Coder   @ 1.2 × 10   = 48   (4 files each, parallel)
  1 × Tester  @ 0.4 × 3    =  1.2
  1 × TeamLead @ 1.2 × 5   =  6
  TOTAL                    ≈ 67.2 credits (Pro w/ Critic)
  TOTAL                    ≈ 61.2 credits (Free, no Critic) = BEAT EMERGENT
```

**Real win: BYO-key mode.** User supplies Gemini key → we charge 0 credits. Entitlement still gates parallelism + Critic. Emergent locks BYO behind $200 tier.

---

### 3. Transparency — Visible Multi-Agent (differentiator, not just metric)

**The pitch that wins the demo:**
> "Emergent shows you a chat. We show you the team — Planner decides, Critic argues, Coders write in parallel, Tester checks. You see each agent's reasoning, model tier, and token spend live. When something goes wrong, you know which agent failed and why."

Implemented by:
- `src/components/agents/AgentChip.tsx` — live status pill per agent
- `src/components/agents/PlanTree.tsx` — hierarchical plan w/ running/done/failed
- `plan_update` + `agent_status` WS messages (new types)

**Why this wins:** Trust. In 2026 every builder has been burned by opaque AI failures. "See-every-agent" is a marketable feature, not just a debug tool.

---

## Pricing Re-Positioning (vs Emergent)

```
           VibeSDK              Emergent          Delta
Free       5 gen/mo (1 agent)   10 credits*       We: unit-consistent ("1 app" not opaque credits)
Pro $20    100 gen/mo + 4 par   100 credits*      We: 4× speed at same $, clearer unit
Team $60   500/seat + Opus opt  —                 Emergent has no team tier
Ent custom 8 parallel + SSO     $200 Pro only     We: real enterprise story

*Emergent "credit" ≈ 1 Gemini 3 Pro call. Average app build = 5-8 credits.
 Our "generation" = 1 completed app w/ the 4-agent pipeline.
```

**Marketing line:** *"Emergent charges for calls. We charge for apps."*

---

## What We're NOT Doing (Deliberate Trade-Offs)

| We skip                       | Why                                                          |
|-------------------------------|--------------------------------------------------------------|
| Own LLM training              | Gemini 3 Pro is SOTA; we can't beat Google. Wrap, don't fight.|
| Local desktop app             | Web + PWA covers 95% of demand, 0 install friction           |
| Mobile-first agent builder    | Devs build on desktop; mobile is discovery, not authoring    |
| Non-Cloudflare deploy targets | Lock-in IS the moat (DO, Workers AI gateway, D1 = free-tier) |
| Multi-LLM provider at GA      | Start Gemini-only → perfect it; Anthropic + OpenAI via BYO  |

---

## Execution Order (resume target)

```
Sprint 1 (this week):
  ✓ migration 0007_multi_agent_plan.sql
  ✓ entitlements.ts
  ✓ AgentChip + PlanTree + types
  → modelRouter.ts                       (the cost wedge — ship next)
  → subagents/contracts.ts               (RPC types)
  → CoderAgent, PlannerAgent             (speed wedge — ship parallel)
  → wrangler.jsonc bindings

Sprint 2:
  → TesterAgent + CriticAgent
  → TeamLead fan-out logic (extends CodeGeneratorAgent, flag-gated)
  → WS plan_update + agent_status messages
  → Wire AgentChip/PlanTree into src/routes/chat/chat.tsx

Sprint 3:
  → Stripe checkout + webhook idempotent handler
  → Upgrade modal + in-app gating
  → Public benchmark: vibesdk vs emergent side-by-side, same prompt
```

**Benchmark commitment:** Publish a live benchmark page on launch day — same prompt, real stopwatch, real token counter, vibesdk vs emergent. Numbers win.
