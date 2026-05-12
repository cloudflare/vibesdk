# Project Close-Out — What's Shipped, What's Pending

**Branch:** `inspiring-roentgen-65e47e`
**Commits this initiative:** 4 (8a3caef, 92e307f, 74c9a48, HEAD)
**Honest status:** Phase 2 complete (design + scaffolds); Phase 3 ~40% (billing fully wired, multi-agent coordinator type-clean but not yet invoked by CodeGeneratorAgent)

## What's In Git (Reality Check)

```
# schema: area|files|compile-confidence|demo-confidence
infra-decision|INFRASTRUCTURE.md COST-OPTIMIZATION.md|n/a (docs)|HIGH — GCP 43× more expensive, evidence in CSP headers
billing-backend|services/billing/razorpay.ts, BillingService, controller, routes|HIGH — matches BaseService pattern|HIGH after smoke test
billing-ui|routes/pricing, routes/billing, api-client methods|HIGH — uses shadcn tokens, Razorpay Checkout script loader|HIGH
schema+migration|0007 SQL, schema.ts additions|HIGH — verified block present|MEDIUM — needs local apply + seed test
entitlements|services/entitlements/entitlements.ts|HIGH after D1Database-typed cleanup|MEDIUM — not yet called from any hot path
multi-agent-DOs|Planner/Coder/Tester/Critic + Coordinator|MEDIUM — types match, bodies are scaffolds|LOW — stubs, not wired to executeInference
agent-ui|AgentChip, PlanTree, AgentsDock, useAgentStream|HIGH — pure React, shadcn tokens|MEDIUM — not yet mounted in chat.tsx
wrangler|4 new DO bindings + v4 migration|HIGH|HIGH after `wrangler deploy`
qa-tooling|scripts/seed.ts, tests/e2e/critical-path.spec.ts, playwright.config|MEDIUM — seed password-hash format unverified|HIGH after `npm run db:seed`
docs|8 md files in docs/redesign/|n/a|n/a
```

## What's NOT In Git (Intentional — Deferred)

These are KNOWN gaps. Listing here so nobody thinks they're "done" when they're not.

### Must-Do Before First Paid Customer (Sprint 1 after this)

Updated 2026-04-24 after commit `HEAD`:

```
# schema: item|status|effort-hours|owner
Wire sub-agent bodies to LLM|DONE — Planner/Coder/Critic call Claude Sonnet via claudeDirect.ts|-|@Dev
Mount AgentsDock into chat.tsx|DONE — renders when liveAgents > 0|-|@Dev
Static credit-guard middleware|DONE — checkGenerationGuard, atomic D1, rollback helper|-|@Dev
Seed password hash align (PBKDF2-SHA256)|DONE — scripts/seed.ts byte-identical to passwordService.ts|-|@Dev
Wire TeamLeadCoordinator into CodeGenAgent behind multiAgentEnabled flag|DONE — phasic.ts runMultiAgentPhase() delegates when flag=true|-|@Dev
Emit agent_status + plan_update from coordinator|DONE — emitAgentStatus + emitPlanUpdate in TeamLeadCoordinator|-|@Dev
/benchmark backend (cron + KV + routes)|DONE — runDailyBenchmark, BenchmarkController, setupBenchmarkRoutes|-|@Dev
Session monitor endpoint + badge|DONE — /api/sessions/:id/monitor + SessionMonitorBadge.tsx|-|@Dev
Hook checkGenerationGuard into codegenRoutes session-start path|DONE — wired in agent controller w/ rollback|-|@Dev
Tester sub-agent body (sandbox run)|DEFERRED — scaffolded, wire when traffic justifies|6|@Dev
Razorpay plan IDs in wrangler.jsonc|DEFERRED — per user request, flip last|0|@Owner
Razorpay secrets via `wrangler secret put`|DEFERRED — per user request|0|@Owner
Memory + RAG + Eval layer (ADR-004)|S2 — Cloudflare Agent Memory + AI Search + TS-port DeepEval gates|14|@Dev
```

### Production Readiness (Sprint 2, tracked in QA-PROTOCOL.md)

```
# schema: item|category|owner
Email templates: welcome, subscription-activated, cancelled, password-reset|Email|@Dev
Real email delivery test (Mailhog for dev, Resend/SES for prod)|Email|@QA-Lead
Razorpay sandbox smoke test end-to-end (see RAZORPAY-SETUP.md §6)|Payments|@QA-Lead
SPF/DKIM/DMARC on sending domain|DNS|@DevOps
Lighthouse perf ≥90 / a11y ≥95 on landing + pricing|Performance|@QA-Lead
Manual @PM walkthrough Sessions 1-4 from QA-PROTOCOL.md|Behavioral|@PM
Multi-tenant isolation test (Merchant A cannot see B)|Security|@QA-Lead
Monitoring dashboard + error-rate alerts|Infra|@DevOps
Logpush to R2 or Datadog|Infra|@DevOps
```

### Nice-To-Have (Sprint 3+)

```
# schema: item|impact
Prompt caching on Gemini 3 Pro (Planner/Critic)|-$3/mo (COST §1)
conversationalResponse → Flash-Lite behind A/B|-$5/mo (COST §2)
Critic short-circuit for <3-task plans|-$2/mo (COST §3)
plan_nodes retention cron (30 days)|storage hygiene (COST §6)
BYO-key incentive UX + dashboard nudge|shifts LLM cost off us (COST §7)
Cost-per-gen observability dashboard|enables all COST.md items (COST §8)
```

## How To "Finish" From Here

Owner path — pick ONE of two endings:

### Ending A: Demo-able MVP (fastest — 1 sprint)
1. Wire `AgentsDock` + `PlanTree` into `src/routes/chat/chat.tsx` — fixture data from `seed_pro_*` session
2. Fill Razorpay test plan IDs in `wrangler.jsonc`
3. Apply migration locally + seed + run Playwright E2E → expect some to fail on password hash — fix seed
4. Deploy to Cloudflare staging
5. @PM runs QA-PROTOCOL.md Sessions 1-4
6. Ship "Public Preview" w/ multi-agent flag OFF (status quo behavior + new UI chrome + billing + seed users working)

**Result:** Pricing works, billing works, agents UI visible but still serial backend. Shippable preview that reveals the roadmap.

### Ending B: Full Multi-Agent Production (3 sprints)
1. Everything in Ending A
2. Wire sub-agent bodies to `executeInference` — each LLM prompt written + tested
3. Wire `TeamLeadCoordinator` into `CodeGeneratorAgent` behind `multiAgentEnabled` feature flag
4. Emit `agent_status` + `plan_update` on state transitions in coordinator
5. Run side-by-side benchmark (serial vs 4-parallel) on 20 real prompts — measure speedup + quality parity
6. Production Readiness Gate (all 60+ items in QA-PROTOCOL.md + main skill)
7. Ship GA

**Result:** The actual 3× speed + 43× cost wedge live.

## Risks Not Yet Mitigated

```
# schema: risk|severity|mitigation-owner
Seed password format mismatch|HIGH — blocks all Playwright login tests|@Dev
Rolldown-vite override conflict in package.json|MED — prevents fresh `npm install` locally|@Tech-Lead
File-write partitioning correctness at scale|MED — PlannerAgent tested only on toy cases|@Architect
Razorpay webhook retry behaviour (5× w/ exponential backoff)|MED — we record idempotency but don't verify retry-correctness|@QA-Lead
DO fan-out count (8 per session × N sessions) CPU-time billing|MED — no load test yet|@Architect
Critic infinite-loop prevention tested (MAX_ROUNDS=2 enforced)|LOW — code is defensive|@Tech-Lead
```

## Acceptance Statement (per SDLC Mandate)

This branch is **NOT** production-ready. It is ready for:
- ✓ Owner review of architecture direction (INFRASTRUCTURE.md + ADR-001)
- ✓ Code review by @Tech-Lead (2.5k+ lines landed, compiles assuming npm install works)
- ✓ Staging deployment of billing + UI (the non-multi-agent parts)
- ✗ Public launch
- ✗ Paid customer sign-ups (Razorpay webhook + email delivery untested in real infra)

**Recommended next owner action:** pick Ending A or Ending B, then kick off Sprint 1 with the "Must-Do Before First Paid Customer" list above.

## Files to Read in Order

1. [WEDGES.md](WEDGES.md) — the strategy
2. [INFRASTRUCTURE.md](INFRASTRUCTURE.md) — why Cloudflare wins
3. [COST-OPTIMIZATION.md](COST-OPTIMIZATION.md) — the $13/mo cut inside $22/mo
4. [ADR-001-multi-agent.md](ADR-001-multi-agent.md) — DO fan-out decision
5. [CRITIQUE.md](CRITIQUE.md) — 10 challenge items, 4 blockers (3 now resolved)
6. [PRICING-TIERS.md](PRICING-TIERS.md) — entitlements matrix
7. [RAZORPAY-SETUP.md](RAZORPAY-SETUP.md) — operator runbook
8. [QA-PROTOCOL.md](QA-PROTOCOL.md) — test checklist
9. [ROADMAP.md](ROADMAP.md) — this file
