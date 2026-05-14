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
Tester sub-agent body (sandbox run)|DONE — getInstanceErrors+runStaticAnalysisCode+getLogs wired; tester-utils.ts (pure conversions), 24 tests, LLM enrichment deferred S11 (0ca86e8)|6|@Dev
Razorpay plan IDs in wrangler.jsonc|DEFERRED — per user request, flip last|0|@Owner
Razorpay secrets via `wrangler secret put`|DEFERRED — per user request|0|@Owner
Memory + RAG + Eval layer (ADR-004)|DONE — S3/S4: CF Agent Memory (stub-safe), AI Search, DeepEval TS-port (4 metrics), AgentMemoryClient|-|@Dev
Per-phase effort estimation + token recording (S5)|DONE — effortEstimator.ts, recordPhaseTokens, CostPreviewBadge|-|@Dev
AG-UI protocol alignment (S6)|DONE — agui-adapter.ts, RUN_STARTED/RUN_FINISHED/STATE_SNAPSHOT, handle-websocket-message.ts|-|@Dev
Messaging-first inbound webhook (S7)|DONE — WhatsApp + Telegram receiver, worker/api/webhooks/|-|@Dev
Mastra AI integration (S8, ADR-005)|DONE — PhaseWorkflow, phasic.ts runPhaseWorkflow, STATE_DELTA, storePhaseEvalMemory|-|@Dev
Mem0 REST memory adapter (S9)|DONE — Mem0RestMemoryClient (pure fetch, CF Workers compat), 14 tests; replaces @mastra/mem0 (native sqlite3 dep)|-|@Dev
Context Usage Breakdown (S9)|DONE — judgeTokens thread PhaseWorkflow→phasic→WebSocket→PhaseQualityBadge; "Eval judge: Nin/Nout tok" display|-|@Dev
SECURITY.md — BOLA structural immunity (S9)|DONE — per-DO SQLite isolation vs Lovable BOLA incident; enterprise marketing asset|-|@Architect
ADR-007 — parallel sub-agent merge strategy (pre-S10)|DONE — Option A (phase independence) primary; Option B (LLM merge) S11; 10% serialization threshold|-|@Architect
MCP server POST /api/mcp (S9)|DONE — stateless JSON-RPC 2024-11-05, 3 tools (get_status/get_quality/describe_app), CF Workers compat, 13 tests|-|@Dev
PhaseParallel — ADR-007 Option A primitives (S10)|DONE — validateDisjointFiles, executeParallelPhaseGroup, metrics; 16 tests (36d0f97)|-|@Dev
phasic.ts parallel dispatch wiring (S10)|DONE — executeParallelPhases() + parallelGroupMetrics; escalation warning >10% (313add1)|-|@Dev
MCP resources/list + resources/read (S10)|DONE — 3 URI templates (status|quality|app), parseResourceUri, 10 tests; server v1.1.0 (5ee6d56)|-|@Dev
Static UI pattern corpus (S10)|DONE — 68 patterns × 10 categories, selective injection via getUiPatternHints(), 34 tests (1a7e322)|-|@Dev
Claude model upgrade claudeDirect.ts|DONE — Sonnet 4.5→4.6 (1M ctx, adaptive thinking), added Opus 4.7 for Critic, ClaudeModel type extended (7dcb879)|-|@Dev
Claude Sonnet 4.8 AGENT_CONFIG upgrade (S11)|BLOCKED_API — still not released; run023 confirmed imminent; uncomment in ClaudeModel, flip DEFAULT_MODEL immediately|-|@Dev
Payments template scaffold Stripe/Paddle (S10)|DONE — 'SaaS with Payments' useCase enum + SAAS_PAYMENTS_INSTRUCTIONS; CF Workers fetch pattern, crypto.subtle webhook verify, D1 schema guidance, 15 tests (f47542b)|-|@Dev
Mount PlanTree into chat.tsx (S11)|DONE — livePlan destructured from useAgentStream(), PlanTree renders below AgentsDock when plan_update events arrive (301e020)|2h|@Dev
MULTI_AGENT_ENABLED env var toggle (S11)|DONE — wrangler.jsonc var + worker-configuration.d.ts + codingAgent.ts onStart reads flag; set to "true" in staging to enable parallel dispatch (c15fe09)|1h|@Dev
Cycle 6 research (S11)|DONE — runs 023-026: tech (Sonnet 4.6/4.7 upgrade), features (Lovable Cloud gap, DESIGN.md), arch (AI Gateway streaming resilience), market (Emergent pivot, NxCode threat); CUMULATIVE-6 written|--|@Architect
ADR-008 AI Gateway streaming resilience (S11)|DONE — 3-phase plan: capture cf-aig-request-id, resume on WS reconnect, cleanup; implementation deferred S12; 5% LLM cost reduction at 5% reconnect rate (7f45de4)|1d|@Architect
run027 architecture supplement (Cycle 7)|DONE — CF Browser Run on Containers; Cursor multi-repo agents; Vercel Opus 4.7 Fast Mode; Mastra v1.33 GA (ResponseCache HIGH, Agent Signals); Replit micro-VM topology; Terminal Use YC W26 profile (7f45de4)|--|@Architect
DESIGN.md detection + blueprint injection (S11)|DONE — fileManager.getFile('DESIGN.md') in phasic.ts initialize(); designRules threaded through generateBlueprint() → generalSystemPromptBuilder() → getUsecaseSpecificInstructions(); agentic tool path also covered (generate-blueprint.ts reads context.allFiles); 4 new tests, 19 total pass (2cdc124/8e74125)|2h|@Dev
Opus 4.7 Fast Mode support + API research (S11)|DONE — claudeDirect.ts: speedMode:'fast'|'standard' param; anthropic-beta header injection; FAST_MODE_SUPPORTED_MODELS guard; speed field in result; waitlist-gated, 6× pricing ($150/MTok out), CriticAgent is correct first target; NOT available via OpenAI-compat AI Gateway path; apply-for-waitlist = owner action (8e74125)|1h|@Dev
CF AI Gateway RFC correction (S11)|DONE — ADR-008 updated: streaming buffer RFC-stage NOT GA; correct header X-AI-Gateway-Durable-Id (not cf-aig-request-id); resume endpoint open question; re-check every cycle (8e74125)|0.5h|@Architect
run028 tech+arch research (Cycle 7, S11)|DONE — Opus 4.7 Fast confirmed API; CF AI Gateway RFC status corrected; fast mode gap analysis (claudeDirect vs core.ts provider split)|--|@Architect
IsolationBadge — DO isolation trust signal (S11)|DONE — IsolationBadge.tsx: ShieldCheck + Tooltip explaining Cloudflare DO per-session isolation; mounted in chat.tsx badge row leftmost; emerald scheme; pure presentational (80bfeaa)|2h|@Dev
Git history panel — isomorphic-git log surface (S11)|DONE — getGitLog() RPC on CodeGeneratorAgent; GET /api/sessions/:id/git/log controller (owner check via EvalResultsService, limit [1,100]); GitCommitEntry+GitLogResponse in api-types.ts; getGitLog() in api-client.ts; GitHistoryPanel.tsx collapsible (7-char OID chip, subject, relative timestamp, max-h-64 scroll); mounted in chat.tsx below PlanTree; v0.dev Git panel parity; 55 tests pass, 0 TS errors (c809fe4)|3h|@Dev
run029 Cycle 7 features pillar (S11)|DONE — Replit Agent 4 Design Canvas gap noted; Cursor layer caching (70% faster) → elevated P0; Lovable Wiz scanning counter-marketing ("architecture beats scanning"); v0.app DB auto-provisioning gap; CF Dynamic Workflows + Mastra v1.29-v1.33 catchup; ADR-001 addendum; 5 decisions (DEC-029-A→E)|--|@Architect
CriticAgent Opus 4.7 Fast Mode wire (S11)|DONE — ANTHROPIC_FAST_MODE_ACCESS env var in worker-configuration.d.ts + wrangler.jsonc; CriticAgent.ts reads env flag → passes speedMode:'fast' to callClaudeForJson; guard prevents 400 on unsupported models; 0 TS errors; flip flag when waitlist granted (owner action: claude.com/fast-mode)|1h|@Dev
ADR-001 addendum — CF Dynamic Workflows (S11)|DONE — awareness note added: Dynamic Workflows (MIT, open beta) enables per-tenant durable execution at runtime; future S13+ option; no current action needed; references Agents Week blog + InfoQ|0.5h|@Architect
EvalGate ResponseCache analog (S11)|DONE — eval-cache.ts: module-scoped Map, TTL 10min, max 100 entries, key=sessionId:phaseName; getCachedEvalVerdict/cacheEvalVerdict/clearEvalCache; wired into runEvalGate (cache-before-LLM, store-after); 12 unit tests pass; fix: EvalResultsService apps import missing (iter 37 bug) (b4dcc34)|2h|@Dev
run030 Cycle 7 market close (S11)|DONE — SpaceX-Cursor $60B Q3 window CRITICAL; Claude Code #1 = Anthropic API strategic asset; "agentic engineering" paradigm; Bolt enterprise pivot = SMB opportunity; 5 decisions (DEC-030-A→E); CUMULATIVE-SUMMARY-CYCLE-7.md written|--|@Architect
bun vitest compat fixes (S11)|DONE — NullMemoryClient.test.ts: replace invalid .resolves.not.toThrow() with direct await+assert (7 tests); mastra/evalGate.test.ts: remove vi.hoisted() + importOriginal (both unsupported in bun compat layer), provide manual mock factory (8 tests); all 15 pre-existing test failures resolved (290ceaf)|1h|@Dev
Docker BuildKit layer caching (S11)|DONE — # syntax=docker/dockerfile:1.4 + --mount=type=cache on all bun install + apt-get/apk add in Dockerfile, Dockerfile.dev, SandboxDockerfile; docker-compose.yml BUILDKIT_INLINE_CACHE=1 anchor; SandboxDockerfile split into separate layers (apt/curl/git); mirrors Cursor 70% speedup (ab78a36)|2h|@Dev
Agentic engineering rebrand (S11)|DONE — README.md: "AI vibe coding platform" → "AI agentic engineering platform" in tagline + What-is section; placeholder GitHub URLs left for owner rename action (ab78a36)|0.5h|@Dev
run031 Cycle 8 opening (S12)|DONE — Q3 gap audit vs Lovable (5 ahead, 3 gaps: Cloud/D1/collab); CF AI Gateway RFC unchanged; NxCode counter narrative "architecture vs price"; 5 decisions DEC-031-A→E; Cycle 8 agenda drafted (run032-034) (11aeb40)|--|@Architect
Competitive landing section (S12)|DONE — CompetitiveSection.tsx: 4 proof points (isolation/eval-gate/parallel/DESIGN.md), emerald icon badges, staggered scroll animation, CTA to SECURITY.md; mounted in home.tsx below Discover Apps; 0 TS errors (743e565)|2h|@Dev
run032 Cycle 8 tech pillar (S12)|DONE — Mastra v1.34 not released (pin v1.33); DO Facets still preview (defer migration); Sonnet 4.8 BLOCKED_API (3-step flip plan ready); CF Gateway RFC unchanged; Agent Signals deferred; blueprint-cache.ts design (S12 F-32); 6 decisions DEC-032-A→F (2425f48)|--|@Architect
Pricing competitive comparison table (S12)|DONE — pricing/index.tsx: 10-row table vs NxCode/free tools; vibesdk AHEAD on 8/10 dimensions; lucide Check/X; shadcn bg tokens; 0 TS errors; DEC-031-E companion piece (ccc8df5)|1h|@Dev
run033 Cycle 8 features pillar (S12)|DONE — Lovable Q2: Teams v2 + Analytics auto-config (NEW GAP DEC-033-A); Replit Design Canvas still beta; v0 DB GA (Neon/Supabase/Upstash, confirms DEC-031-B); AI SaaS template gap (DEC-033-D); India pricing moat (DEC-033-E); DeployBadge UX gap (DEC-033-F); 6 decisions (f9afe16)|--|@Architect
DeployBadge — live deploy chip (S12)|DONE — DeployBadge.tsx: 3 states (idle/deploying/live), globe/spinner icons, tooltip with URL, keyboard-accessible, mounted in chat.tsx header between IsolationBadge+CostPreviewBadge; 0 TS errors (3f5a84d)|2h|@Dev
India pricing copy (S12)|DONE — pricing/index.tsx header: "First AI agentic engineering platform priced for India. ₹1,699/mo vs ₹2,100+ for global alternatives." DEC-033-E companion; GST-inclusive note preserved; 0 TS errors|(this iter)|@Dev
run034 Cycle 8 market close (S12)|DONE — Q3 window confirmed; Q3 readiness scorecard (5 AHEAD, 2 gaps, 2 true blockers); India-first architecture (Razorpay/UPI/GST); email templates decision (Resend.com); 4 decisions DEC-034-A→D; VERDICT: ARCHITECTURALLY READY, COMMERCIALLY BLOCKED (Razorpay IDs)|(this iter)|@Architect
AI SaaS template scaffold (S12)|DONE — schemas.ts: 'AI SaaS' useCase enum (distinguishes billing vs LLM-feature intent); prompts.ts: AI_SAAS_INSTRUCTIONS with streaming (TransformStream/ReadableStream/text/event-stream), D1 schema (conversations/messages/user_settings), raw fetch to OpenAI+Anthropic (no Node.js SDK), API key safety + rate limiting; ui-corpus.ts: 'AI SaaS' → ['dashboard','auth']; 22 unit tests; 0 TS errors (4d072e3)|3h|@Dev
EmailService — Resend transactional email (S12)|DONE — EmailService.ts: sendWelcome/sendSubscriptionActivated/sendSubscriptionCancelled/sendPasswordReset via Resend REST API (raw fetch, no Node SDK, Bearer auth, returns EmailResult never throws); 4 HTML templates (welcome/activated/cancelled/reset) + text variants; RESEND_API_KEY in worker-configuration.d.ts; .gitignore negation for templates/ path; 27 tests; 0 TS errors (b08d5b4)|4h|@Dev
Plausible analytics injection (S13)|DONE — PLAUSIBLE_ANALYTICS_HINT constant in prompts.ts; appended after DESIGN.md rules for all non-Dashboard usecases; HTML/React/Vite/SSR patterns; defer-only rule; YOUR_DOMAIN placeholder; GDPR-free callout; 12 new test assertions in payments-scaffold.test.ts; Dashboard excluded (internal tooling); 0 TS errors (e7f1966)|1h|@Dev
run035 Cycle 9 tech+arch (S13)|DONE — Mastra v1.33 pin confirmed; Sonnet 4.8 BLOCKED_API; DEPRECATION fix: CLAUDE_4_SONNET → claude-sonnet-4-6 (June 15 deadline); D1 provision REST API confirmed + D1ProvisionService design (DEC-035-D); CF Gateway RFC still blocked; Lovable SEO gap + DEC-035-F Sprint 3 P1; 6 decisions DEC-035-A→F (b08531c)|--|@Architect
D1ProvisionService — CF D1 auto-provision (S13)|DONE — createSessionDatabase (POST /d1/database, sanitized name ≤64 chars, returns {uuid,name}); deleteSessionDatabase (DELETE); generateSetupDoc (wrangler.setup.md with migration SQL slot + deploy steps); raw fetch only; 20 tests; 0 TS errors (4a94356)|3h|@Dev
SEO scaffolding prompt injection (S13)|DONE — SEO_SCAFFOLDING_HINT in prompts.ts: meta description, og:title/description/image/url/type, Twitter card, canonical link, react-helmet-async SPA guidance, OG image placeholder (1200x630), llms.txt template for AI crawler parity (Lovable gap DEC-035-F); Dashboard excluded (internal tooling); SEO before Plausible in output chain; 14 new test assertions in payments-scaffold.test.ts; 0 TS errors (9cc10c0)|2h|@Dev
run036 Cycle 9 features (S13)|DONE — Lovable 2.0 (May 7): Design view+Teams+Wiz+MCP integrations analyzed; Replit Design Canvas GA (all plans) confirmed; v0 Platform API = LOW India threat; @mastra/core v1.33.1 pin verified; Emergent $300M $70M Series B logged; vibe coding market $4.7B; 5 decisions DEC-036-A→E; gap scorecard updated (visual editing + Teams = deferred; DO isolation AHEAD structurally) (93aaa31)|--|@Architect
/security trust landing route (S13)|DONE — /security public route: 4 isolation fact cards (per-DO SQLite, DO ID boundary, git-in-DO, user-scoped memory); 6-row architecture comparison table (Lovable BOLA vs vibesdk structural isolation); 6-row isolation scope table; attacker requirements callout (3 steps vs Lovable's 1 free token); known limitations section; vulnerability reporting + pricing CTA; competitive-section.tsx CTA updated to Link /security; registered in routes.ts; 0 TS errors (a279e31)|2h|@Dev
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
