# Beat-Emergent Agentic Architecture — 4-Sprint Plan

**Owner:** @Architect + @PO
**Status:** PROPOSED — pending Owner GO
**Grounded in:** [INFRASTRUCTURE.md](INFRASTRUCTURE.md), [WEDGES.md](WEDGES.md), [ADR-001-multi-agent.md](ADR-001-multi-agent.md), codebase audit (commit `06a1634`)

## TL;DR

Emergent's agent = 1 black box on GCP Cloud Run @ ~$953/mo serving 50k gens. Our agent = 4 specialized DOs on Cloudflare @ ~$22/mo. **Architectural gap = 43× cost + 3-4× speed**. The wedges from our side are real but **scaffolded, not demonstrable**. Four sprints converts scaffold → public benchmark that owns the narrative.

## Wedges Already In Codebase (re-verify)

```
# schema: wedge|file|status|gap-to-demo
4-DO fan-out|worker/agents/core/subagents/*|SHIPPED scaffold|not invoked from CodeGeneratorAgent
Claude Sonnet LLM bridge|inferutils/claudeDirect.ts|SHIPPED|works in isolation
Critic agent (red-team)|subagents/CriticAgent.ts|SHIPPED|short-circuits empty plans, runs real critique on populated
File-set partitioner|PlannerAgent.partitionFileSet|SHIPPED|tested only at type level
Live agent chips UI|src/components/agents/*|MOUNTED in chat.tsx|hidden until WS emits agent_status
Credit guard (static)|middleware/guardrails/generationGuard.ts|SHIPPED|not hooked into codegenRoutes
Razorpay subscriptions|services/billing/razorpay.ts + routes|SHIPPED|deferred per Owner directive
INFRA wedge (CF vs GCP)|INFRASTRUCTURE.md|DOCUMENTED|need public benchmark page
```

---

## 5 Architectural Levers That Break Emergent

Ordered by ROI × structural-defensibility:

### Lever 1 — Plan Branching + Parallel Exploration (NEW, highest-leverage)

**The kill move.** When a user submits an ambiguous prompt, Planner generates 2-3 candidate blueprints. User picks one OR runs all in parallel, picks winner.

**Why emergent can't copy fast:** their orchestrator is single-threaded by design — their Cloud Run pods can't fan out without exploding bills. Our DOs already fan out for parallel Coders. Adding plan-level parallelism = a tiny coordinator change. Net cost increase ~3× (still cheaper than emergent's 1× run).

**Code path:**
```ts
// worker/agents/core/subagents/TeamLeadCoordinator.ts
async function runParallelPlanCandidates(
  args: RunPhaseArgs,
  candidateCount: 2 | 3,
): Promise<RunPhaseResult[]> {
  const planners = Array.from({ length: candidateCount }, (_, i) =>
    dispatchPlanner(args, { seed: i, divergencePrompt: DIVERGENCE_PROMPTS[i] })
  );
  return Promise.all(planners);
}
```

**UI:** "2 of 3 plans ready — review and pick" — single most marketable moment in the product.

**Marketing copy:** *"Emergent gives you one guess. We give you three plans and let you pick the best."*

---

### Lever 2 — BYO-Anything (NEW, enterprise wedge)

User connects:
- Their GitHub repo → agent commits + opens PR there (not on our infra)
- Their LLM keys → agent uses Gemini/Claude/OpenAI on user's bill (we charge orchestration only)
- Their Cloudflare account → deployed app lives in their account (we host only the agent session)

**Why this wins enterprise:** procurement wants data/code on their infra. Emergent runs everything on GCP w/ their accounts — instant compliance NO from BFSI, healthcare, defense.

**Already partly built:** Vault DO (XChaCha20-Poly1305) for user keys is shipped (commit history). GitHub export exists. CF deploy exists per-instance. Mostly stitching:

```
# schema: piece|status|effort-hours
BYO LLM keys (Vault DO)|SHIPPED|0
BYO GitHub (export + branch)|EXISTS, needs "open PR" mode|6
BYO Cloudflare (deploy to user account)|EXISTS via SDK, needs UX|4
"Enterprise" tier surface|missing|8
```

---

### Lever 3 — Public Cost+Speed Benchmark Page (NEW, marketing weapon)

A live `/benchmark` page on the marketing site:

```
[Prompt: "Build a SaaS waitlist with email capture and admin"]
[Run on:  ☑ VibeSDK    ☑ Emergent]

VibeSDK         Emergent
00:23           02:14         (wall clock)
~14 credits     ~31 credits   (cost reported)
4 agents live   chat only     (visible parallelism)
Deploy: ✓       Deploy: ✓     (output)

[Run again with your own prompt →]
```

Numbers come from real concurrent runs (cron-scheduled, cached for 24h).

**Why this wins:** truth beats positioning. If our numbers are better, this page is the strongest single marketing asset we can build. If they ever degrade, we know first.

**Effort:** 12h once the parallel pipeline is live.

---

### Lever 4 — Sub-Agent Memory + Warm Starts (NEW, retention wedge)

Each user's sessions feed into a per-user Mem0/Ogham-style vector store. Returning user's prompts hit the warm cache:
- Planner already knows their stack preference
- Coder already knows their conventions (commit history, file structure preferences)
- Critic already knows their non-negotiables ("never use Tailwind", "always TS strict")

**Effect:** session 2+ for any user runs measurably faster + costs less. Compounds over time → high switching cost.

**Why emergent can't easily:** stateless Cloud Run pods + no per-user persistent compute. Our DOs are exactly per-user persistent — the architecture already gives us this for free.

**Already partly built:** `agent-memory-systems` skill + Ogham/Mem0 MCP servers in the global setup. Wiring needs:
- `MemoryAgent` DO per-user (analogous to UserSecretsStore)
- Hook into PlannerAgent prompt prefix
- Surface in UI: "Welcome back. Continuing your TypeScript-strict, Hono-on-Workers style."

---

### Lever 5 — Spec-Driven Mode (NEW, B2B wedge)

User uploads `SPEC.md` / PRD / API contract → agent builds against it strictly. Critic enforces "every spec line has a corresponding implementation or test."

**Why this wins B2B:** real teams already have specs. Today's tools (emergent, v0, bolt) want users to chat. B2B wants to feed a doc and review the diff.

**Implementation:** New `/api/sessions/from-spec` endpoint. Planner gets `mode: 'spec-driven'` flag; Critic acceptance criteria switch to "100% spec coverage."

---

## 4-Sprint Roadmap (15 days each)

```
# schema: sprint|theme|exit-criteria|wins-which-lever
S1|Demoable parallel pipeline|user submits prompt → 4 chips animate → real files written → preview deploys|Lever 1 partial (1-plan only)
S2|Public benchmark + transparency|/benchmark page live w/ daily cron vs emergent|Lever 1 full + Lever 3
S3|BYO + enterprise tier|user connects GitHub + own CF + own LLM keys, deploys to their stack|Lever 2
S4|Memory + spec-mode|warm-start measurable, spec upload working e2e|Levers 4 + 5
```

### Sprint 1 — Demoable Parallel Pipeline (15 days)

**Story list:**

```
# schema: id|story|owner|est-hours|file
S1.1|Hook checkGenerationGuard into codegenRoutes session-start|@Dev|2|worker/api/routes/codegenRoutes.ts
S1.2|Add multiAgentEnabled flag to CodeGenState|@Dev|2|worker/agents/core/state.ts
S1.3|Wire runParallelPhase into CodeGeneratorAgent.executePhase when flag on|@Dev|6|worker/agents/core/codingAgent.ts
S1.4|Emit agent_status WS msg from TeamLeadCoordinator.onStatus|@Dev|3|worker/agents/core/subagents/TeamLeadCoordinator.ts
S1.5|Emit plan_update WS msg when nodes change|@Dev|3|TeamLeadCoordinator + websocket.ts
S1.6|Handle agent_status + plan_update in handle-websocket-message.ts|@Dev|3|src/routes/chat/utils/handle-websocket-message.ts
S1.7|Verify AgentsDock + PlanTree render live|@QA|2|browser test
S1.8|Seed-script password hash format align (drop OR import AuthService.hash)|@Dev|3|scripts/seed.ts
S1.9|Playwright critical-path runs green|@QA|4|tests/e2e/critical-path.spec.ts
S1.10|@PM manual walkthrough (QA-PROTOCOL Sessions 1-4)|@PM|3|browser
```

**Total: ~31h, fits in 15-day sprint w/ buffer.**
**Exit gate:** Pro user types prompt → 4 chips animate → files stream → preview iframe shows working app. Critical-path E2E green.

### Sprint 2 — Plan Branching + Benchmark Page (15 days)

```
# schema: id|story|owner|est-hours
S2.1|Add plan-candidate generation (2 parallel Planners)|@Dev|6
S2.2|UI: plan-picker step before Coder dispatch|@UI/UX + @Dev|10
S2.3|Save candidate metrics (tokens, latency) to D1|@Dev|3
S2.4|Marketing /benchmark page (static + cron)|@Dev|10
S2.5|Daily cron: run benchmark prompt on both products, write results to KV|@DevOps|6
S2.6|Public results JSON endpoint /api/benchmark/latest|@Dev|2
```

**Exit gate:** /benchmark page renders today's numbers from a verified cron run. Plan-picker step usable on any session.

### Sprint 3 — BYO + Enterprise (15 days)

```
# schema: id|story|owner|est-hours
S3.1|"Open PR" mode on GitHub export|@Dev|6
S3.2|BYO Cloudflare account flow (OAuth + token-vault)|@Dev|10
S3.3|Deploy-to-user-account in deploymentManager|@Dev|6
S3.4|Enterprise tier in entitlements + pricing page|@PO|3
S3.5|Single-tenant deployment guide (docs)|@DevOps|6
```

**Exit gate:** A pretend Acme user connects their GH + CF, submits prompt, gets a PR in their repo + a deployed Worker in their account.

### Sprint 4 — Memory + Spec-Driven Mode (15 days)

```
# schema: id|story|owner|est-hours
S4.1|MemoryAgent DO per-user (mirror UserSecretsStore pattern)|@Dev|10
S4.2|Planner prompt prefix from MemoryAgent|@Dev|3
S4.3|UI: warm-start banner "Welcome back..."|@UI/UX|4
S4.4|Spec upload endpoint + parser|@Dev|6
S4.5|Spec-driven prompt mode in Planner|@Dev|6
S4.6|Critic enforces spec coverage|@Dev|6
```

**Exit gate:** Returning user's session-2 measurably faster (warm-start banner shows). Acme uploads `SPEC.md`, agent builds + Critic flags 1 missing requirement.

---

## Comparison Matrix Post-S2

```
# schema: capability|emergent|vibesdk-current|vibesdk-S2|moat-durability
Multi-agent (visible)|✗|scaffolded|LIVE|Permanent (architectural)
Parallel coders|✗|scaffolded|LIVE 4×|Permanent (DO primitive)
Plan branching|✗|—|LIVE 2-3 candidates|Years (their orchestrator rewrite)
Critic red-team|✗|LIVE in isolation|LIVE in pipeline|Permanent
Public benchmark|✗|—|LIVE|Forever w/ cron
Cost transparency|opaque credits|partial|public on /benchmark|Permanent
Edge anycast|partial (CDN front)|full Workers|full Workers|Permanent
Per-request DO billing|✗ (always-on pods)|YES|YES|Permanent
Cold-start <50ms|✗ (container ~1-3s)|YES (V8 isolates)|YES|Permanent
```

## Comparison Matrix Post-S4

Add columns: **BYO GitHub | BYO CF | BYO LLM | Spec-driven | Warm starts** → emergent has none, we have all.

---

## The Killer Demo (after S2)

```
[Stage: empty laptop, 2 browser windows side-by-side, projector]

Owner: "Build me a feedback app with email digest."
  [Submits to both tabs simultaneously, hits start]

VibeSDK (left)
  T+1s   Planner thinking
  T+8s   Plan tree appears: 3 milestones, 7 tasks
  T+10s  Planner: "Drafting 2 alternative plans..." — TWO PLANS APPEAR
  T+20s  Owner picks Plan A
  T+22s  Coder-1 ▶ Coder-2 ▶ Coder-3 ▶ Coder-4 light up — files start streaming
  T+1:10 Preview iframe renders working app
  T+1:15 "Deploy" — live URL ready

Emergent (right)
  T+1s   "Thinking..."
  T+30s  Still "Thinking..."
  T+1:20 First file appears
  T+2:30 Preview renders
  T+3:00 Deploy pending

Live counter at top of both:
  VibeSDK     14 credits ($0.04 actual)
  Emergent    32 credits ($0.32 actual)

Owner walks off stage.
```

The demo IS the marketing.

---

## Resource Plan

```
# schema: sprint|engineering-days|design-days|devops-days|total-cost-incl-tools
S1|10|2|1|~$80 LLM dev/test
S2|10|4|2|~$120 + cron-LLM
S3|10|2|5|~$80
S4|10|3|2|~$100
─────────────────────────────────
4 sprints|40|11|10|~$400 LLM dev
```

LLM dev cost negligible because tiered router uses Sonnet for our own SDLC. Self-hosted Cloudflare = zero hosting cost during dev.

---

## Risks + Mitigations

```
# schema: risk|likelihood|impact|mitigation
DO RPC limits hit at fan-out=4|LOW|MED|cap to 4 (entitlements already does); CF docs verified pre-S1
Plan-branching cost surprise|MED|MED|each candidate counted against per-session budget; UI shows estimate before run
Emergent ships own multi-agent before S2|MED|HIGH|/benchmark page IS the moat — they'd need infra rewrite to match numbers
BYO-CF token security|LOW|HIGH|Vault DO already audited (XChaCha20-Poly1305); add monthly rotation guide
Spec parsing brittle|MED|LOW|use Claude w/ tolerant JSON parse like Planner; never fail-closed on parse error
```

---

## Decision Required From Owner

```
# schema: decision|options|recommended
S1 GO|YES / DEFER|GO — current state is unprovable until S1
S2 plan-branching tier|all-tiers / Pro+|Pro+ (cost protection on Free)
S3 priority|after-S2 / parallel-w-S2|after-S2 — needs S2 demo as pitch material
Enterprise tier price floor|$500/$1000/$2000/mo|$1000/mo + custom (anchors below emergent's "Talk to sales")
Public /benchmark live date|S2 exit / S3 exit|S2 exit — own the narrative early
```

---

## What This Plan Deliberately Skips

- **Open-source the agent runtime** — already done (vibesdk is OSS). No additional work needed.
- **Mobile-native client** — desktop covers 95% of devs; defer to Phase 7.
- **Multi-LLM provider gateway** — modelRouter scaffolded; production routing is S5+.
- **Eval harness comparing prompts** — DeepEval/RAGAS scaffolding is future work; for now we benchmark on real prompts in `/benchmark`.

## Next Action

Owner approves S1 → I dispatch parallel @Dev work blocks per S1.1–S1.10. ETA to first demoable multi-agent run: **~6 working days** from GO.
