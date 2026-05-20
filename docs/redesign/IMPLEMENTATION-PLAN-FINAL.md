# IMPLEMENTATION-PLAN-FINAL.md
# vibesdk — Single Source of Truth to Jul-1 Launch

**Branch:** `inspiring-roentgen-65e47e`
**Target:** Jul 1, 2026 GA launch (~44 days from 2026-05-18)
**Verdict:** Engineering complete. Stack final. One commercial blocker (30 min owner action).
**Last updated:** 2026-05-18 (cycles 27-33 research complete, S16-A + S17 PRs merged)

---

## PART 1 — WHAT IS SHIPPED (Done, in git)

### Architecture + Infra

```
# schema: item|commit|status
ADR-010 Option A — degraded-mode UX (D1 session_snapshots + SnapshotService + GET endpoint + DegradedModeBanner)|ce9141f|DONE
ADR-008 app-layer WS buffer (ws-buffer.ts: enqueueBroadcast, flushPendingBroadcasts on reconnect)|ca14d60|DONE
ADR-009 DO SQLite scaffold for generated apps (D1ProvisionService.generateDurableObjectSQLiteCode)|4a46c28|DONE
CF Unified Tracing (wrangler.jsonc traces.enabled:true, head_sampling_rate:0.1)|07f8223|DONE
CF Sandboxes migration (factory.ts uses SandboxSdkClient as DEFAULT — migration already complete)|fd5d7ab|DONE
ADR-011 @cloudflare/think POC evaluation (Rec: Option B + 2d POC post-launch)|6113c2e|DONE
Parallel phase execution ADR-007 Option A (validateDisjointFiles, executeParallelPhaseGroup, 16 tests)|36d0f97|DONE
```

### Backend Services

```
# schema: item|commit|status
Razorpay billing (razorpay.ts + BillingService + controller + routes)|MERGED|DONE
Entitlements (entitlements.ts, checkGenerationGuard, atomic D1)|MERGED|DONE
EmailService (Resend: welcome/activated/cancelled/reset, 27 tests)|b08d5b4|DONE
MemoryAgent + AgentMemoryClient (CF Agent Memory + AI Search + DeepEval TS-port)|MERGED|DONE
Mem0RestMemoryClient (pure fetch, CF Workers compat, 14 tests; replaces @mastra/mem0)|MERGED|DONE
MCP server (POST /api/mcp: stateless JSON-RPC, 3 tools, 13 tests + resources v1.1.0)|MERGED|DONE
Tester sub-agent (tester-utils.ts: getInstanceErrors+runStaticAnalysis+getLogs, 24 tests)|0ca86e8|DONE
D1ProvisionService (createSessionDatabase, deleteSessionDatabase, generateSetupDoc, 20 tests)|4a94356|DONE
EvalGate + ResponseCache analog (eval-cache.ts: 10-min TTL, 100 entries, 12 tests)|b4dcc34|DONE
AG-UI protocol alignment (agui-adapter.ts: RUN_STARTED/RUN_FINISHED/STATE_SNAPSHOT)|MERGED|DONE
WhatsApp + Telegram inbound webhooks (worker/api/webhooks/)|MERGED|DONE
PhaseWorkflow (Mastra createWorkflow/createStep, STATE_DELTA, storePhaseEvalMemory)|MERGED|DONE
SEO scaffolding prompt injection (SEO_SCAFFOLDING_HINT: OG/Twitter/canonical/llms.txt)|9cc10c0|DONE
Plausible analytics prompt injection (PLAUSIBLE_ANALYTICS_HINT)|e7f1966|DONE
AI SaaS template scaffold (useCase enum + AI_SAAS_INSTRUCTIONS + 22 tests)|4d072e3|DONE
Static UI pattern corpus (68 patterns × 10 categories, getUiPatternHints(), 34 tests)|1a7e322|DONE
DESIGN.md detection + blueprint injection (phasic.ts + generateBlueprint + generalSystemPromptBuilder)|2cdc124|DONE
Per-phase effort estimation + token recording (effortEstimator.ts, recordPhaseTokens)|MERGED|DONE
Messaging-first webhook (WhatsApp + Telegram receiver)|MERGED|DONE
```

### Multi-Agent Pipeline

```
# schema: item|commit|status
TeamLeadCoordinator DO (coordinator pattern, emitAgentStatus, emitPlanUpdate)|MERGED|DONE
PlannerAgent + CoderAgent + CriticAgent + TesterAgent DOs (bodies wired to LLM)|MERGED|DONE
multiAgentEnabled flag (MULTI_AGENT_ENABLED env var → wrangler.jsonc, readFlag in onStart)|c15fe09|DONE
phasic.ts runMultiAgentPhase() delegation when flag=true|313add1|DONE
CriticAgent Opus 4.7 Fast Mode (speedMode:'fast' gated on ANTHROPIC_FAST_MODE_ACCESS env)|MERGED|DONE
Benchmark backend (runDailyBenchmark, BenchmarkController, setupBenchmarkRoutes)|MERGED|DONE
Session monitor endpoint + SessionMonitorBadge.tsx|MERGED|DONE
```

### Frontend

```
# schema: item|commit|status
AgentChip + PlanTree + AgentsDock (mounted in chat.tsx, shows when liveAgents > 0)|MERGED|DONE
React design system (tokens.css, shadcn components, DESIGN.md from design:design-system)|MERGED|DONE
Competitive landing section (CompetitiveSection.tsx: 4 proof points)|743e565|DONE
Pricing page + India pricing copy (₹1,699/mo, "First AI agentic engineering platform priced for India")|ccc8df5|DONE
Pricing comparison table (10-row vs NxCode/free tools, vibesdk AHEAD 8/10)|ccc8df5|DONE
Pricing counter-narrative (flat monthly vs credits/effort-based)|c2423f3|DONE
/security trust landing route (DO isolation facts, Lovable BOLA comparison, 3 scan layers)|a279e31|DONE
/blog/lovable-bola post (76-day timeline, 5-step attack anatomy)|5e00941|DONE
/blog/built-to-last (trigger-gated: publish on Lovable Series C announcement Q3 2026)|69edbeb|DONE
IsolationBadge (ShieldCheck + DO isolation tooltip, mounted in chat.tsx)|80bfeaa|DONE
DeployBadge (3 states: idle/deploying/live, mounted in chat.tsx)|3f5a84d|DONE
CostPreviewBadge (PhaseQualityBadge: judgeTokens, "Eval judge: Nin/Nout tok")|MERGED|DONE
GitHistoryPanel (getGitLog RPC, collapsible, 7-char OID, 55 tests)|c809fe4|DONE
PlanTree mounted in chat.tsx (livePlan from useAgentStream, renders on plan_update)|301e020|DONE
```

### Models + AI Stack

```
# schema: item|commit|status
claude-sonnet-4-6 (1M ctx, adaptive thinking) — default model|7dcb879|DONE
Opus 4.7 wired for CriticAgent ($5/$25 MTok — corrected from prior $15/$75 estimate)|1bf4640|DONE
Opus 4.7 Fast Mode support (speedMode param + anthropic-beta header, waitlist-gated)|8e74125|DONE
@mastra/core bumped 1.33.1 → 1.35.0 (no breaking changes; exact pin; consumers: PhaseWorkflow + client.ts)|eb0cea2|DONE
claudeDirect.ts model enum extended (ClaudeModel type + AGENT_CONFIG routes)|7dcb879|DONE
```

### Copy + Docs (S17 PR merged e3cfb7d)

```
# schema: item|commit|status
BYOK-ONBOARDING-COPY.md (344 lines: modal copy + onboarding step + 4 FAQs + pricing banner)|0755bcb|DONE
byok-api-keys-modal.tsx BYOK copy wired (DialogTitle/Description, explainer card w/ localStorage dismiss, helpText per provider, success/error toasts)|28839c3|DONE
config-modal.tsx BYOK tab description updated ("pay providers directly, no markup")|28839c3|DONE
settings/index.tsx "Provider API Keys (BYOK)" + "Manage API Keys" button|28839c3|DONE
CF-SANDBOXES-MIGRATION-PLAYBOOK.md (DEC-128-A CLOSED: factory.ts already uses SandboxSdkClient as default)|fd5d7ab|DONE
ADR-011-think-poc-evaluation.md|6113c2e|DONE
Cycles 27-33 research (22 files, 3 cumulatives)|35a3779+87848bf|DONE
ROADMAP.md updated (cycle 27-33 TOON rows)|7ca1fd3|DONE
```

---

## PART 2 — WHAT IS PENDING BEFORE JUL-1

### P0 — Owner Actions (sole commercial blockers, ~30 min total)

```
# schema: action|deadline|command|notes
Put Razorpay key ID secret|Jun 15 2026|wrangler secret put RAZORPAY_KEY_ID|Also put RAZORPAY_KEY_SECRET
Put Razorpay key secret|Jun 15 2026|wrangler secret put RAZORPAY_KEY_SECRET|See RAZORPAY-SETUP.md §6
Apply D1 migration 0010|Jun 15 2026|wrangler d1 migrations apply vibesdk-db --remote|session_snapshots table (ADR-010)
Apply Anthropic fast-mode waitlist|Jun 15 (or whenever)|claude.com/fast-mode|Flips ANTHROPIC_FAST_MODE_ACCESS env; CriticAgent runs Opus 4.7 at 6× cost but 6× speed
Rename GitHub org placeholder URLs in README|Pre-launch|manual|README.md has placeholder GitHub URLs from agentic engineering rebrand (ab78a36)
```

### P0 — Jun 15 Compound Deploy Window

All three must be batched in one deploy:

1. `wrangler secret put RAZORPAY_KEY_ID` + `wrangler secret put RAZORPAY_KEY_SECRET`
2. `wrangler d1 migrations apply vibesdk-db --remote` (migration 0010_session_snapshots)
3. Verify `claude-sonnet-4-6` still live post Jun-15 deprecation (Sonnet 4 + Opus 4 retire Jun 15 — vibesdk is on 4-6, SAFE)
4. Monitor Anthropic billing split: Pro $20 / Max5x $100 / Max20x $200 activates Jun 15. BYOK users unaffected.

### P0 — Confirm UPI AutoPay Recurring on Jul-1 Scope (DEC-134-A)

**Why P0:** Replit-Razorpay beta = UPI + cards one-time ONLY, no UPI AutoPay recurring → vibesdk UPI AutoPay recurring moat is PRESERVED (4-6 month window). This is the SINGLE load-bearing India moat. Must be confirmed in scope and tested before Jul-1.

**Action:** Owner confirms Razorpay plan IDs include UPI AutoPay recurring (subscription plan type). QA runs Razorpay sandbox smoke-test per RAZORPAY-SETUP.md §6.

### P0 — BYOK Copy Ship by Jun 3

All BYOK in-app copy is wired (S17, commit 28839c3). The Jun 8 Anthropic activation email creates peak user confusion. **Jun 3 deploy = T-5d buffer before confusion window.**

Deploy checklist:
- [ ] `byok-api-keys-modal.tsx` copy verified in staging (engineering done in 28839c3)
- [ ] `config-modal.tsx` BYOK tab description rendered (engineering done in 28839c3)
- [ ] `settings/index.tsx` "Provider API Keys (BYOK)" section visible (engineering done in 28839c3)
- [x] FAQ additions from BYOK-ONBOARDING-COPY.md merged into FAQ accordion — `ByokFaqSection` wired in pricing/index.tsx (8558ad3)
- [x] Jun-8 trigger banner logic wired — `ByokAnthropicBanner` in home.tsx (8558ad3). Date window [Jun 8, Jun 22], localStorage dismiss.

### P1 — Engineering (Option B Think Pattern Adoptions, pre-Jul-1)

```
# schema: item|effort|file|value|status|commit
Extend ws-buffer.ts to SQLite-backed replay (ResumableStream pattern from ADR-011)|2d|worker/agents/core/ws-buffer.ts|Fixes silent message loss on DO eviction/restart. 35 tests pass.|DONE|4eb36cb
Formal ToolLifecycle interface (formalize existing .onStart/.onComplete closures + onError hook)|0.5d|worker/agents/tools/types.ts + customTools.ts|Testable tool hooks, onError propagation. tsc clean.|DONE|4eb36cb
codeDebugger.ts as true sub-agent DO (agentTool() pattern from Think)|3-4d|worker/agents/assistants/codeDebugger.ts|Isolated storage, independent abort, no shared state|POST-LAUNCH|—
```

### P1 — Sonnet 4.8 Flip (when released)

Not released as of cycle 33 (25th slip). Flip plan ready: uncomment `claude-sonnet-4-8` in `ClaudeModel` + change `DEFAULT_MODEL` in `inferutils/config.ts`. **Under 30 min when released.** No other changes needed.

### P1 — FAQ Entry: vibesdk vs Razorpay "VIBE Founder"

DEC-130-D — run131 confirmed "Razorpay VIBE Founder" was April Fools satire (confirmed cancelled). **Task CANCELLED.**

### P2 — Production Readiness Gate (before GA)

```
# schema: item|category|owner
Email templates verified in real inbox (welcome/activated/cancelled/reset)|Email|@QA-Lead
Real Resend delivery test (non-mock)|Email|@QA-Lead
Razorpay sandbox end-to-end smoke test|Payments|@QA-Lead
SPF/DKIM/DMARC on sending domain|DNS|@DevOps
Lighthouse perf ≥90 / a11y ≥95 on landing + pricing|Performance|@QA-Lead
@PM walkthrough QA-PROTOCOL.md Sessions 1-4|Behavioral|@PM
Multi-tenant isolation test (User A cannot read User B session)|Security|@QA-Lead
Monitoring dashboard + error-rate alerts|Infra|@DevOps
Logpush to R2 or Datadog|Infra|@DevOps
```

---

## PART 3 — COMPETITIVE WATCH (ongoing monitoring)

### DEFCON Levels

```
# schema: signal|current-level|trigger-for-escalation|watch-cadence
India INR pricing competitor|DEFCON-1 (reset cycle 28; no competitor has INR rails)|Any competitor ships UPI/Razorpay/INR pricing|Weekly
CF DO/R2 incidents|DEFCON-2 (10-day quiet gap post May 12/15/16 streak)|4th incident = re-evaluate ADR-010|Daily cloudflarestatus.com through Jul-1
Replit-Razorpay INR|WATCH-ELEVATED|Replit ships UPI AutoPay recurring = moat eroded|Weekly (DEC-CYCLE32-C)
```

### Competitor Status

```
# schema: competitor|status|key-signal|vibesdk-position
Emergent|STABLE (no new features since Series B $330M Dec 2025)|$400M ARR est; Series C trigger $1B (est Jul-Aug 2026)|AHEAD on speed/cost/India
Lovable|CONSOLIDATING (6th-7th empty changelog month post Apr-24)|$400M ARR Feb 2026; Series C Q3 2026|/blog/built-to-last trigger-gated for Lovable Series C
Cursor|ENTERPRISE-ONLY (11+ cycles; 70% Fortune 1000)|Cursor-SpaceX $60B acquisition clock running post-IPO Jul-Aug 2026|UNCONTESTED indie/India
Replit|MEDIUM THREAT (Razorpay INR shipped Jun 2026 — UPI one-time + cards, NO AutoPay)|Agent 4 (parallel agents + infinite canvas) shipping|UPI AutoPay recurring moat preserved 4-6 months
Cognition (Devin)|STALLING ($25B T+34d unclosed, no lead investor)|Round may fail|LOW IMPACT
v0.app|AHEAD on CF Workers (v0 agentic "coming soon" as of S14)|Platform API beta only|AHEAD structural
bolt.new|PARITY (MCP + design system mid-project S10/S11)|Figma import S15 MEDIUM gap|Ahead on India/DO isolation
@cloudflare/think v0.6.1|MONITOR (architectural rhyme of SimpleCodeGeneratorAgent)|npm publish status; Option A migration post-launch|ADR-011 decision deferred post-launch
```

### SpaceX IPO Timeline (Cursor distraction window)

```
# schema: date|event|vibesdk-implication
Jun 4 2026|SpaceX roadshow starts|Cursor $60B acquisition speculation peaks
Jun 11 2026|SpaceX pricing|Acquisition timeline locks (Jul-Aug 2026)
Jun 12 2026|SpaceX trading begins|3-week earlier than prior run126 estimate
Jul 1 2026|vibesdk GA launch|Peak Cursor distraction window — CONFIRMED
Jul-Aug 2026|Cursor $60B acquisition closes (est)|Enterprise vacuum + Cursor team focus shifts
```

---

## PART 4 — ARCHITECTURE DECISIONS LOG

```
# schema: adr|status|decision|post-launch-action
ADR-001 Multi-agent DO fan-out|DONE|TeamLeadCoordinator + 4 sub-agent DOs (Planner/Coder/Tester/Critic)|None
ADR-002 Sandbox strategy|DONE|CF Sandboxes (SandboxSdkClient) = DEFAULT in factory.ts; migration complete|None
ADR-003 AG-UI protocol|DONE|agui-adapter.ts adopted pre-S9|None
ADR-004 Memory/RAG/Eval|DONE|CF Agent Memory + AI Search + DeepEval TS-port + Mem0Rest|None
ADR-005 Agent stack selection|DONE|Mastra AI (PhaseWorkflow) + custom DO agents|None
ADR-006 S9 spike plan|DONE|Completed|None
ADR-007 Parallel sub-agent merge|DONE|Option A (phase independence, disjoint file sets); Option B (LLM merge) deferred S11|None
ADR-008 AI Gateway streaming resilience|FINAL|App-layer WS buffer (ws-buffer.ts). CF Gateway RFC #1257 still open — not GA.|Monitor #1257; adopt if closes
ADR-009 Generated app database strategy|DONE|DO SQLite (ctx.storage.sql) scaffold for generated apps|None
ADR-010 CF single-platform risk (degraded-mode)|DONE|D1 session_snapshots + DegradedModeBanner. Migration 0010 → Jun 15 deploy.|Apply migration Jun 15
ADR-011 @cloudflare/think evaluation|DONE (pre-Jul-1 items complete)|Option B shipped: ToolLifecycle interface (4eb36cb) + ws-buffer SQLite replay (4eb36cb). API corrections applied (withCompaction→onCompaction/compactAfter; agentTool import path). 2-day POC: post-launch on feature/think-poc-ucp.|codeDebugger.ts sub-agent DO → POST-LAUNCH
```

---

## PART 5 — STACK FREEZE (nothing changes without explicit approval)

```
# schema: dependency|current-pin|next-watch-action
@mastra/core|1.35.0 (exact, no caret)|Monitor v1.36.x — read CHANGELOG before bump
@cloudflare/agents (CF Agents SDK)|0.12.4|v0.13 when released; 6+ weeks stable
@cloudflare/think|0.6.1 (experimental)|Post-launch POC branch feature/think-poc-ucp
claude-sonnet-4-6|DEFAULT_MODEL|Flip to claude-sonnet-4-8 <30 min when API releases
Opus 4.7 (CriticAgent)|claude-opus-4-7-20251101|Stable; Fast Mode gated on waitlist flag
React|19 (stable)|No change pre-launch
Drizzle ORM|Current|No change pre-launch
```

---

## PART 6 — JUL-1 LAUNCH CHECKLIST

### T-28d (Jun 3): BYOK copy deploy

- [ ] Deploy S17 branch changes to staging (`feature/think-poc-ucp` → staging)
- [ ] Verify byok-api-keys-modal.tsx explainer card renders + dismisses correctly
- [ ] FAQ accordion entries added from BYOK-ONBOARDING-COPY.md
- [ ] Jun-8 trigger banner logic wired + tested (window Jun 8–Jun 22, localStorage dismiss)

### T-16d (Jun 15): Compound deploy window

- [ ] `wrangler secret put RAZORPAY_KEY_ID`
- [ ] `wrangler secret put RAZORPAY_KEY_SECRET`
- [ ] `wrangler d1 migrations apply vibesdk-db --remote` (migration 0010)
- [ ] Verify claude-sonnet-4-6 still live in Anthropic API (not deprecated)
- [ ] Verify Anthropic billing split correct in production (Pro $20 / Max5x $100)
- [ ] Razorpay sandbox smoke-test (RAZORPAY-SETUP.md §6)
- [ ] Confirm wrangler.jsonc Razorpay plan IDs set (RAZORPAY_FREE_PLAN_ID, RAZORPAY_PRO_PLAN_ID, RAZORPAY_TEAM_PLAN_ID)

### T-7d (Jun 24): Pre-launch QA gate

- [ ] Lighthouse perf ≥90 / a11y ≥95 (landing + pricing pages)
- [ ] Email delivery real test (Resend: all 4 templates to real inbox)
- [ ] Multi-tenant isolation test
- [ ] @PM QA-PROTOCOL.md Sessions 1-4 manual walkthrough
- [ ] MULTI_AGENT_ENABLED env var confirmed "true" in staging
- [ ] Error-rate monitoring dashboard live
- [ ] GitHub placeholder URLs updated in README

### T-0 (Jul 1): GA launch

- [ ] Razorpay live mode activated (live API keys)
- [ ] wrangler deploy production
- [ ] /blog/built-to-last NOT published (holds for Lovable Series C trigger)
- [ ] cloudflarestatus.com daily watch confirmed
- [ ] Monitor UPI AutoPay recurring status (sole India moat)

---

## PART 7 — POST-LAUNCH BACKLOG (NOT Jul-1)

```
# schema: item|priority|effort|rationale
ADR-011 Option A: Full Think migration (DO class + UCP → Think subclasses)|HIGH|14-21d|2-day POC result gates this decision
codeDebugger.ts as true sub-agent DO (agentTool() pattern)|HIGH|3-4d|Isolated storage + independent abort
S2 — Plan branching (2-3 candidate blueprints, user picks)|HIGH|15d sprint|Lever 1 full: Emergent can't copy without infra rewrite
S2 — /benchmark page live (daily cron vs Emergent, vibesdk vs competitor wall-clock + cost)|HIGH|12h once pipeline live|Marketing weapon: truth beats positioning
S3 — BYO GitHub "Open PR" mode|MED|6h|Enterprise compliance blocker for BFSI/healthcare
S3 — BYO Cloudflare account deploy (user's own account)|MED|10h|Enterprise tier lever (Lever 2)
S4 — MemoryAgent DO per-user (warm starts: Planner prompt prefix from memory)|MED|13h|Retention wedge; DO architecture already gives this for free
S4 — Spec-driven mode (/api/sessions/from-spec + Critic spec coverage)|MED|18h|B2B wedge
Lovable Teams Option A (shared DO WS + permissions, MEDIUM gap)|MED|1 sprint|Lovable Teams $30/mo/user GA May 7
PWA mobile-first client|LOW|1 sprint|Lovable mobile Apr 28 gap
Figma-to-code import (DESIGN.md partially addresses; full import = Figma API)|LOW|1 sprint|Bolt + Rocket.new + v0 all ship it
DO Facets spike (ctx.facets.get() within existing DO — GA since Agents Week)|LOW|2d|Per-generated-app DO-backed SQLite; requires Dynamic Workers
```

---

## PART 8 — COMPETITIVE MOATS (structured defensibility analysis)

```
# schema: moat|durability|current-evidence|erosion-risk
CF DO per-session isolation (BOLA-immune by architecture)|PERMANENT|/security + /blog/lovable-bola + 3 scan layers (Wiz/Aikido/Cursor Security Review = "3x evidence")|LOW — structural impossibility to fix by scanning
UPI AutoPay recurring billing (India only)|4-6 months|Replit beta = one-time only; vibesdk = recurring subscriptions|HIGH — Replit will close gap
India INR pricing at ₹1,699/mo|Permanent positioning|No competitor has INR/Razorpay/UPI (DEFCON-1 clean 19+ cycles)|MED — any competitor can add Razorpay
4-parallel DO fan-out (3× speed vs Emergent serial)|Permanent (architectural)|Sub-agent DOs shipped; MULTI_AGENT_ENABLED flag|LOW — Emergent on AWS serial workers; infra rewrite required
Public cost transparency|Permanent|BYOK direct billing, pricing comparison table, benchmark backend wired|LOW — no competitor currently transparent on cost
Eval gate (LLM-as-judge on every phase transition)|YEARS|DeepEval TS-port + EvalGate + ResponseCache|MED — competitors can add eval but not without architecture change
```

---

## PART 9 — DECISION LOG (active decisions from cycles 27-33)

```
# schema: decision-id|decision|status|owner-action
DEC-CYCLE32-A|Approved 2-day Think POC on UserConversationProcessor branch|APPROVED — POC skeleton on feature/think-poc-ucp; full execution post-launch|None
DEC-CYCLE32-B|BYOK copy accelerated from T-15d → T-12d (Jun 3 ship)|APPROVED — copy wired in S17 (28839c3)|Deploy Jun 3
DEC-CYCLE32-C|Replit-Razorpay INR elevated to weekly competitive watch|APPROVED — weekly cadence|Watch each cycle
DEC-CYCLE32-D|CF DO/R2 from "active emergency" → "Jul-1 readiness checklist"|APPROVED — 10-day quiet gap; DEFCON-2 holds|Daily status watch through Jul-1
DEC-CYCLE32-E|Add Polygram + AgentRail + Pixcode to permanent competitor list|APPROVED — all LOW-MED threat|Monitor each cycle
DEC-134-A|Confirm UPI AutoPay recurring on Jul-1 scope (single load-bearing India moat)|PENDING OWNER CONFIRMATION|Owner confirms Razorpay recurring plan IDs are UPI AutoPay type
DEC-134-B|BYOK copy Jun 3 deploy holds|APPROVED|Deploy Jun 3
DEC-114-A|ADR-010 Option A complete; CF risk mitigated|COMPLETE|None (migration 0010 → Jun 15)
DEC-128-A|CF Sandboxes migration playbook — CLOSED (migration already complete in factory.ts)|CLOSED — SandboxSdkClient is DEFAULT|None
DEC-129-C|@mastra/core bump 1.33.1 → 1.35.0|COMPLETE (eb0cea2)|None
```

---

## SOURCE FILES (superseded by this document)

The following files remain for deep-reference but this document is the single execution reference:

| File | Role | Still needed? |
|---|---|---|
| `PLAN.md` | M1-M5 milestone breakdown | Reference for post-launch S2-S4 |
| `WEDGES.md` | 3 competitive wedges (speed/cost/transparency) | Reference for marketing copy |
| `BEAT-EMERGENT-PLAN.md` | 4-sprint post-launch roadmap | S2-S4 backlog (Part 7 above summarizes) |
| `PRICING-TIERS.md` | Tier matrix + entitlements code | Live reference for pricing page |
| `ROADMAP.md` | Sprint-by-sprint ship log | Historical record; all done items |
| `ADR-011-think-poc-evaluation.md` | Think migration options A/B/C | Post-launch decision gate |
| `BYOK-ONBOARDING-COPY.md` | Drop-in UI copy for BYOK flow | Dev reference for FAQ/onboarding wiring |
| `CF-SANDBOXES-MIGRATION-PLAYBOOK.md` | Reverse-engineered CF Sandboxes API surface | Internal ops reference |
| `QA-PROTOCOL.md` | Full QA checklist 60+ items | Pre-launch Production Readiness Gate |
| `RAZORPAY-SETUP.md` | Razorpay onboarding + sandbox smoke-test §6 | Mandatory Jun 15 deploy reference |
| `INFRASTRUCTURE.md` | CF vs GCP cost comparison (43× cheaper) | Marketing / benchmark page copy |
| `COST-OPTIMIZATION.md` | 8 post-launch cost reduction levers | Post-launch backlog |
