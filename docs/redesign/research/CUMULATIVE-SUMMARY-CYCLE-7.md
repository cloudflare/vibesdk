# Cumulative Summary — Cycle 7

**Runs:** run027 (arch supplement), run028 (tech/arch), run029 (features), run030 (market)  
**Period:** May 15, 2026 (iterations 34–40)  
**Cycle status:** COMPLETE  

---

## Top 3 Findings

### 1. SpaceX-Cursor Deal = Q3 2026 is NOW the Critical Window

SpaceX (merged with xAI, $1.25T valuation) locked in a $60B acquisition option for Cursor (April 21, 2026). IPO summer 2026; acquisition closes fall 2026. Result: Cursor in a 4-6 month acquisition limbo starting NOW. Management distracted, enterprise focus shifting to SpaceX aerospace use cases, indie/SMB segment under-served.

**Previous window analysis:** "Q4 2026-Q1 2027 neutral-platform window"  
**Updated:** **Q3 2026 (Jul-Sep) = PEAK WINDOW.** vibesdk must achieve feature parity + marketing readiness by Jul 1, 2026.

### 2. Claude Code #1 AI Coding Tool — Anthropic API Dependency is Now a Strategic Asset

Claude Code (Anthropic) overtook GitHub Copilot and Cursor to become the most-used AI coding tool as of May 2026. vibesdk is built on Anthropic's Claude API + Claude Skills. This is a direct tailwind — developers migrating to Claude = audience pre-warmed for vibesdk. Framing shift: "built on Anthropic's Claude" is now a FEATURE, not a vendor dependency disclosure.

### 3. "Agentic Engineering" is the New Paradigm — vibesdk's Architecture Wins

Karpathy's February 2026 "vibe coding is passé" declaration has diffused across the market. The new paradigm: AI agents handle implementation, humans provide architecture and review. vibesdk's TeamLead + subagent DO fan-out = this exact paradigm, shipped. Competitors (Lovable, Bolt) are retrofitting; vibesdk built it first (ADR-001, iter 2).

---

## Engineering Shipped (Cycle 7 — Iterations 34-39)

```
# schema: item|commit|iteration|impact
ADR-008 AI Gateway streaming resilience|7f45de4|34|PROPOSED deferred S12; RFC-stage
DESIGN.md blueprint injection|2cdc124/8e74125|34-35|Google Stitch protocol parity
Opus 4.7 Fast Mode in claudeDirect.ts|8e74125|35|Waitlist-gated; code ready
ADR-008 RFC correction|8e74125|35|Correct header X-AI-Gateway-Durable-Id
IsolationBadge UI component|80bfeaa|36|DO isolation trust signal; counter to Lovable Wiz
Git history panel|c809fe4|37|v0.dev Git panel parity; isomorphic-git commit log surface
CriticAgent fast mode wire|cd19181|38|ANTHROPIC_FAST_MODE_ACCESS env flag; flip on waitlist
ADR-001 Dynamic Workflows addendum|cd19181|38|CF Dynamic Workflows future S13+ option noted
EvalGate ResponseCache analog|b4dcc34|39|eval-cache.ts; 10-min TTL; 12 tests; Mastra v1.33 parity
EvalResultsService apps import fix|b4dcc34|39|Bug fix: missing import from iter 37
```

---

## Research Produced (Cycle 7)

| Run | Pillar | Key Finding |
|---|---|---|
| run027 | Arch supplement | Mastra v1.33 GA; CF Browser Run on Containers; Cursor cloud agents 70% faster; Terminal Use YC W26 |
| run028 | Tech/arch | Opus 4.7 Fast Mode confirmed API; CF AI Gateway RFC corrected (not GA) |
| run029 | Features | Replit Agent 4 Design Canvas; Cursor parallel build + layer caching P0; Lovable Wiz counter-marketing; CF Dynamic Workflows; Mastra v1.29-v1.33 |
| run030 | Market | SpaceX-Cursor $60B; Claude Code #1; "agentic engineering" paradigm; Bolt enterprise pivot; Q3 window CRITICAL |

---

## Decisions Logged (Cycle 7)

```
# schema: decision|verdict|action
DEC-027-A|Mastra ResponseCache HIGH — verified via run029|Implemented eval-cache.ts (iter 39)
DEC-028-A|CF AI Gateway streaming buffer RFC-stage NOT GA|ADR-008 status: PROPOSED deferred
DEC-029-A|Docker layer caching P0 — Cursor shipped May 13 (70% faster)|DONE iter 42 (ab78a36)
DEC-029-B|ResponseCache evalStep P1|DONE eval-cache.ts (iter 39)
DEC-029-C|ADR-001 addendum Dynamic Workflows|DONE (iter 38)
DEC-029-D|Lovable Wiz counter: architecture beats scanning|IsolationBadge done (iter 36)
DEC-029-E|Mastra Durable Agents + ADR-008 complementary not redundant|Both on roadmap
DEC-030-A|Q3 2026 window CRITICAL (SpaceX-Cursor limbo)|ACTION: feature parity by Jul 1
DEC-030-B|Retire "vibe coding"; adopt "agentic engineering" in product surfaces|DONE iter 42 (ab78a36)
DEC-030-C|Claude Code #1 = Anthropic API dependency is strategic asset|Surface in messaging
DEC-030-D|Bolt enterprise pivot = SMB opportunity for vibesdk|Add to competitive messaging
DEC-030-E|NxCode "free forever" highest individual threat|Counter: quality/isolation not price
```

---

## Open Threads → Cycle 8

```
# schema: item|priority|type|notes
Docker layer caching in sandbox|DONE|Engineering|ab78a36 iter 42; all 3 Dockerfiles + compose
"Agentic engineering" positioning|DONE|Marketing|ab78a36 iter 42; README tagline + What-is section
Opus 4.7 Fast Mode waitlist|P0|Owner action|apply at claude.com/fast-mode; code ready
Q3 2026 window feature audit|P1|Product|Full gap analysis vs Lovable feature checklist
Sonnet 4.8 AGENT_CONFIG upgrade|P1|Engineering|BLOCKED_API; flip immediately on release
CF AI Gateway RFC re-check|P2|Research|Endpoint shape still open question; check run032+
Mastra ResponseCache for planStep|P2|Engineering|Non-streaming blueprint path; separate from evalStep cache
vibesdk Cloud UX concept|P3|Design|Lovable Cloud (invisible backend) gap; design sprint needed
NxCode competitive narrative|P3|Marketing|"built for builders not enterprises" messaging
CUMULATIVE-SUMMARY-CYCLE-8|--|Research|Trigger when Cycle 8 (runs 031-034) complete
```

---

## Owner Asks (Cycle 7 Close)

1. **Apply for Opus 4.7 Fast Mode waitlist** (claude.com/fast-mode) — XS effort, code already wired in `claudeDirect.ts` + `CriticAgent.ts`
2. **Confirm Q3 2026 launch target** — SpaceX-Cursor deal makes Jul 1 the inflection point
3. **Approve "agentic engineering" rebrand** — retire "vibe coding" language from product surfaces
4. **Fill Razorpay plan IDs** — still DEFERRED; blocking production payment path

---

## Cycle 7 Stats

- Runs: 4 (run027–run030)  
- Commits: 9 (7f45de4 → 08d0088, excluding housekeeping)  
- Tests added: 12 (eval-cache.test.ts)  
- TypeScript errors introduced: 0  
- Pre-existing test failures identified: 2 (NullMemoryClient bun compat, mastra/evalGate.test.ts vi.hoisted)  
- Bugs fixed: 1 (EvalResultsService missing apps import)  
