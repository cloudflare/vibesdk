# Cycle 6 — 2026-05-14 IST

Sources: run023 (tech), run024 (features), run025 (architecture), run026 (market). Prior: CUMULATIVE-SUMMARY-CYCLE-5.md.

---

## What changed (4-pillar synthesis)

### Tech deltas (vs Cycle 5) — run023

- **Claude Sonnet 4.6 GA** (confirmed May 14). 1M context (vs 200k for 4.5), adaptive thinking, same $3/$15 pricing. `claudeDirect.ts` upgraded: `CLAUDE_DEFAULT_MODEL = 'claude-sonnet-4-6'` (commit 7dcb879). All sub-agents (Planner/Coder/Tester default) now 5× larger context window at no cost increase. **DONE.**

- **Claude Opus 4.7 GA — CriticAgent premium model** (confirmed May 14). 128k output, 1M context, best agentic coding. `CLAUDE_PREMIUM_MODEL = 'claude-opus-4-7'` set in claudeDirect.ts; CriticAgent switched from default to premium (commit 7dcb879). Plan critique = highest-value LLM call in the pipeline — correct model allocation. **DONE.**

- **Claude Sonnet 4.8 — still BLOCKED_API** (run023). Expected mid-May 2026; leaked KAIROS/Undercover/Mythos refs suggest broad Anthropic product push. +12 coding points when released. `ClaudeModel` type has commented slot. **Action: flip `CLAUDE_DEFAULT_MODEL` to `claude-sonnet-4-8` immediately on API release. P0.**

- **Mastra v1.33.0 ResponseCache — UNBLOCKED** (run023, May 13 release). Skips identical LLM steps, per-request `skipCache` override. Was deferred S11 waiting for this feature. **Action P1 S11: wire to `evalStep` in PhaseWorkflow.**

- **Mastra v1.31.0 `createDurableAgent`** (run023, May 1). Resumable streams after WS disconnects, Inngest mid-phase resume. **Action P2 S11: wire Tester + Critic DOs to createDurableAgent for mid-phase resume.**

- **CF Agents Week — CF AI Gateway unified inference** (run023). `AI.run()` now covers 70+ models / 12+ providers. Streaming resilience: AI Gateway buffers LLM stream independently of agent lifetime → reconnect without re-invoke. **Architectural validation of CF platform bet (ADR-001).**

- **LiteLLM CVE-2026-42208** (run023). SQL injection in Proxy v1.81.16–v1.83.6. vibesdk does not use LiteLLM Proxy. **No action.**

### Feature deltas (vs Cycle 5) — run024

- **Lovable Cloud (May 7)** — built-in backend abstraction. D1/DO-equivalent infrastructure, but INVISIBLE to users ("just tell Lovable what you want"). Gemini 3 Flash default; free $25 Cloud/$1 AI promo. **Gap: vibesdk has equivalent infrastructure but no UX layer. Lovable Cloud created a new UX gap where technical parity exists. Action P1: design "vibesdk Cloud" UX concept — surface D1 as managed storage, DO as isolated runtime, all in natural language.**

- **Wiz security integration (May 7)** — native security scanning visible in project Security view. vibesdk's DO isolation is passive (architectural guarantee, never fails) vs Lovable's active scan (visible, user-readable). **Gap: UX, not technology. Action P2: "Isolated by Architecture" badge in project view. Counter-markets Wiz with deeper guarantee.**

- **Google Stitch DESIGN.md** (run024, emerging). Agent-friendly markdown file encoding design rules (colors, typography, components). Export/import between Stitch and coding tools. **New emerging protocol: detect DESIGN.md in project root → inject into Planner system prompt. Effort: 2h. Action P2 S11.**

- **Cursor Canvases + Build-in-Parallel** (run024, May 7-13). Interactive React agent UIs in chat panel; parallel async subagent execution via `/multitask`. **Both shipped — parallel execution is now table-stakes (Cursor + Replit both live). vibesdk's ADR-007 Option A parallel is fully wired but behind `multiAgentEnabled` flag. Must flip flag. AgentsDock + PlanTree = vibesdk's Canvas answer — must mount in chat.tsx immediately.**

- **NxCode free-forever profile** (run024). Same non-dev founder audience; non-expiring free credits; full-stack gen (React/Next/Node/Python/DB/API/tests). 5k+ non-tech founders already using. **Existential freemium threat. Counter: quality + reliability narrative for repeat builders. BOLA immunity as trust signal.**

- **Replit Agent 4 model selection** (run024). Per-task Opus 4.7 vs Gemini 3.1 Pro. **vibesdk has AGENT_CONFIG routing but no user-facing selection. Low priority for now.**

### Architecture deltas (vs Cycle 5) — run025

- **CF Dynamic Workflows billing (May 26)** — $0.002/worker/day after 1k/month free. **vibesdk does not use Dynamic Workers** (uses DO fan-out via TeamLeadCoordinator, ADR-007 Option A). **Audit wrangler.jsonc to confirm — P0 check, 0.5h.**

- **CF DO Facets — validated existing architecture** (run025, open beta). DO Facets = supervisor DO owns generated code as Dynamic Worker with isolated sub-SQLite. This IS vibesdk's existing architecture (SimpleCodeGeneratorAgent as supervisor, per-session SQLite isolation). CF formally endorses what vibesdk built before the API existed. **Migration to Facets API: DEFER S13. Current implementation achieves equivalent guarantee. Counter-marketing: "Architecture-level isolation — the pattern Cloudflare now formally endorses as DO Facets."**

- **CF AI Gateway streaming resilience — DIRECT FIX for WebSocket reconnect** (run025). AI Gateway buffers LLM stream independently of agent lifetime. If WS drops mid-phase, current vibesdk must re-invoke LLM from scratch. With streaming resilience: DO reconnects to AI Gateway mid-stream, no re-invoke needed. **Action P1 S11: wire main LLM stream (core.ts) through `env.AI.run()` with streaming resilience. Estimated effort: 1d. Cost + UX improvement on mobile/flaky connections.**

- **claudeDirect.ts → env.AI.run() migration** (run025). One-line provider switch; gains auto-failover + streaming resilience for sub-agents. **Action P2 S11: migrate callClaudeDirect() internals to env.AI.run() keeping ClaudeCallArgs shape. Estimated effort: 4h. ANTHROPIC_API_KEY still needed for now; AI Gateway manages credential eventually.**

- **Mastra CloudflareDOStorage (March 2026)** — `@mastra/cloudflare/do` storage adapter. **DEFER S12.** Raw DO SQLite is faster; no migration needed.

- **v0.dev Git panel** (run025) — branch-per-chat, PR-on-merge, deploy-on-PR. vibesdk has isomorphic-git mechanics; Git panel UI is missing. **Action P2 S11: surface git branch-per-session as UI feature (4h).**

### Market deltas (vs Cycle 5) — run026

- **Cursor $2B ARR → $6B forecast** (run026). a16z + Nvidia + Thrive Series D. Developer tier = effectively decided. vibesdk is in non-developer lane — no direct overlap.

- **Emergent Wingman pivot CONFIRMED** (run026, April 15). WhatsApp/Telegram background agent for scheduling/sales/research. Vibe-coding is now a secondary product for Emergent. 8M builders + 1.5M MAU on the platform but under-served by pivot. **Capture window: vibesdk's messaging-first inbound webhook (S7) positions it as the coding tool in the same messaging workflow Emergent is abandoning. Action P2: messaging-first positioning copy.**

- **Market tailwind: 128k+ tech layoffs (2026)** (run026). Laid-off devs → solo founders; surviving devs forced to build more with fewer people; non-engineers building their own tools. **Vibe coding market grows because AI is displacing the people who used to build software.** $4.7B market, 38% CAGR, $12.3B by 2027.

- **Neutral-platform window confirmed 3rd cycle** (run026). SpaceX IPO June 2026 → Cursor acquisition deferred → Q4 2026-Q1 2027 window for vibesdk to establish without Cursor competitor pressure from a Microsoft/SpaceX/xAI orbit.

- **Lovable M&A hunt still active** (run026). No acquisitions announced. 10 months remain. Target categories (eval/orchestration/security) = vibesdk's tech stack. Window unchanged.

---

## Top-3 Findings (drives S11 engineering)

**1. Parallel agents must ship NOW — table-stakes (P0)**

Cursor Build-in-Parallel (May 7) and Replit Agent 4 parallel tasks are both live. Every major competitor now ships parallel sub-agents. vibesdk's TeamLeadCoordinator + phasic.ts parallel dispatch is fully implemented (ADR-007 Option A) but hidden behind `multiAgentEnabled: false` flag. The architectural advantage (100% conflict-free vs Replit's 90% heuristic) is real but invisible. **Must ship:**
1. Run 20-prompt benchmark (serial vs parallel) — measure speedup + quality parity
2. Flip `multiAgentEnabled` flag to `true` for Pro+ tier
3. Mount AgentsDock + PlanTree in chat.tsx (was Sprint 1 Must-Do, now critical path)
4. "100% conflict-free by construction" as counter-marketing claim

**2. CF AI Gateway streaming resilience — production fix for a known risk (P1)**

WebSocket drop mid-phase forces LLM re-invocation today. CF AI Gateway streaming resilience buffers the response across agent lifetimes — a native platform fix requiring no new infrastructure. Wire in S11, effort 1d. Reduces both LLM cost (no re-invocations on drops) and user frustration (mobile + flaky connections). Combined with claudeDirect.ts → env.AI.run() migration (4h) → sub-agents also gain auto-failover.

**3. Lovable Cloud UX gap — infrastructure parity ≠ product parity (P1)**

vibesdk has DO-per-session + D1 schema + Razorpay billing. Lovable Cloud wraps equivalent infrastructure in natural-language abstraction so users never see "database schema" or "Durable Object." This is a design sprint, not an engineering sprint. **vibesdk Cloud concept:** user says "save user preferences" → vibesdk provisions D1 table + generates CRUD API + injects into blueprint, all in one phase. The backend becomes a product feature, not an infrastructure detail. Closes the Lovable Cloud UX gap without abandoning vibesdk's technical depth.

---

## ROI Items (Cycle 6 additions)

```
# schema: item|roi_category|sprint|effort
Flip multiAgentEnabled flag (after benchmark)|quality_lift + parity|S11 P0|1d
Mount AgentsDock + PlanTree in chat.tsx|feature_parity|S11 P0|2h
Wire AI Gateway streaming resilience (core.ts)|reliability + cost|S11 P1|1d
claudeDirect.ts → env.AI.run() migration|reliability + cost|S11 P2|4h
Mastra ResponseCache on PhaseWorkflow evalStep|cost_reduction|S11 P1|0.5d
Sonnet 4.8 upgrade (flip BLOCKED_API → DEFAULT_MODEL)|quality_lift|S11 P0 (on release)|0.5h
DESIGN.md detection + Planner injection|feature_parity|S11 P2|2h
"Isolated by Architecture" badge|positioning|S11 P2|4h
Git branch-per-session UI surface|feature_parity|S11 P2|4h
vibesdk Cloud UX design sprint|product_strategy|S11 P1|design sprint
Emergent audience capture copy (messaging-first)|positioning|S11 P2|2h
Audit wrangler.jsonc — no Dynamic Workers|risk_mitigation|immediate|0.5h
```

---

## Cumulative Strategic State (Cycles 1-6)

**Architecture:** CF Workers + DO + D1 + AI Gateway = validated and formally endorsed by CF (DO Facets, unified inference, Dynamic Workflows). ADR-001 (CF over GCP 43×) holds. ADR-007 (parallel phase dispatch, 100% conflict-free) implemented and ready to flip.

**Product:** S10 delivered: payments scaffold ✓, UI corpus ✓, MCP resources ✓, TesterAgent ✓, model upgrade ✓. S11 gate: parallel agents (unmask `multiAgentEnabled`) + streaming resilience (WebSocket fix) + AgentsDock (close Canvas gap).

**Market:** Non-dev vibe-coding is the contested tier. Cursor won the developer tier. Lovable leads non-dev ARR but carries BOLA baggage. Emergent pivoted away. NxCode is the most dangerous new entrant (free-forever, same audience). Neutral-platform window: Q4 2026-Q1 2027. Lovable M&A window: 10 months remaining. **vibesdk must close to its first paying customer and establish parallel-agent demo before Q4 2026 window opens.**

**Moat (3 confirmed differentiators):**
1. 100% conflict-free parallel phases (ADR-007 Option A — architectural, not heuristic)
2. Architectural BOLA immunity (per-DO isolation — CF formally endorses this pattern)
3. CF infrastructure cost moat ($13/mo operational vs $500+/mo for VM-based competitors)
