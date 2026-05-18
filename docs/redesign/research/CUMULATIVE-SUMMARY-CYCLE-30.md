# Cycle 30 — 2026-05-24

## Theme
**"DEFCON-1 streak BROKEN (Emergent+Razorpay backend), DO outage HIT (first post-layoff), Sandboxes GA pricing PUBLISHED, Mastra pin SUSPECT. T-22d unchanged."**

Three structural shifts in one cycle: India-payments moat narrowed (Emergent shipped Razorpay rails backend, public USD-only — partial trigger, not full), Cloudflare single-platform risk crystallized (90-min DO outage May 12, first post-layoff incident), and CF Sandboxes GA pricing materialized as multi-dimensional (no single $/hr). Codex 4.2x token-efficiency adds asymmetric cost-risk vector on Anthropic-locked model paths.

## What changed

### Architecture deltas vs cycle 29
- **CF Sandboxes pricing published** (run119/run120): $0.072/vCPU-hour active + Workers Paid $5/mo base + DO storage + request charges. Single-rate compares now invalid for ADR-011 cost model.
- **CF Sandboxes GA confirmed 41 days ago** (run119) — ADR-011 stub shifts from "evaluate" to "adopt" framing post-launch. Migration playbook UNPUBLISHED by CF; vibesdk must author own.
- **CF Agents SDK still v0.12.4** (run119/run120) — no v0.13 cut; Fibers API still stabilizing not stabilized.
- **Manus "part of Meta" banner** detected (run119) — verify M&A vs marketing copy; if real shifts competitor posture (run119 open thread).
- **Cursor TypeScript SDK** (Apr 29) = closest architectural mirror — VM-per-session ≈ vibesdk DO-per-session, Firecracker-heavy (run119).

### Feature deltas
- **DEFCON-1 streak RESET from 18 → 0** (run118). Emergent (India, $300M val, $100M ARR, 150K paying) shipped Razorpay UPI AutoPay + recurring cards. CRITICAL nuance: public emergent.sh/pricing still USD-only — Razorpay is BACKEND only. Partial trigger, not full.
- **Lovable 3rd consecutive empty changelog month** (run118; run121 calls it 4th silent). Consolidation thesis deepens.
- **Cursor v3.4** (May 13) — cloud-agent dev environments. Enterprise IDE category, no vibesdk overlap (run118).
- **Devin May cadence** — 4 release dates, 40+ items. Enterprise-shaped, no consumer/India (run118).
- **Replit Security Center 2.0** (May 7) + External Access Tokens extended to Core/Starter (May 6) — mild consumer-tier creep (run118).
- **bolt.new/v0/Blink/e2b** — still BLOCKED on changelog sources (run118).

### Tech deltas
- **Mastra `@mastra/core` npm latest = 1.32.1** (run120). vibesdk pins `1.33.1` — AHEAD of public npm. P0 reconciliation needed via `bun pm ls`. Either prerelease channel or invalid pin → CI failure risk.
- **OpenAI Agents SDK v0.17.2** (May 12, run120) — 3 minor versions from v0.14.4 in 9 cycles. Native sandbox + Codex tools + 100+ LLMs. **Python-only**, TS pending — not yet a vibesdk sandbox replacement.
- **LiteLLM Managed Agents Platform Alpha** (May 8, run120) — OSS, self-hosted, not GA. Out of scope.
- **Sonnet 4.8 — 23rd cycle slip** (run120). No Anthropic announce. Daily watch through Jun 15.
- **Mastra OM = #2 on LongMemEval (94.87%)** (run120) — relevant since vibesdk uses Mastra.

### Market deltas
- **CF Durable Objects outage May 12** (15:42–17:12 UTC, multi-region, run121). FIRST DO incident post-1,100-person layoff (May 8). Every vibesdk chat session = DO → outage = freeze. ADR-010 needs concrete drill, not theoretical mitigation.
- **Anthropic-SpaceX compute deal disclosed** (run121, May 7-9) — +50% Claude Code limits are STRUCTURAL (SpaceX-financed), not promotional. Tailwind extends through Q3, not Jul 13.
- **Codex 4.2x fewer tokens vs Claude Code** (run121) — NEW direct threat. Anthropic-only model paths in `worker/agents/inferutils/config.ts` become cost-positioning liability.
- **Razorpay UPI AutoPay 2026 split-tier LIVE** (run121) — ₹15K standard, ₹1L for Insurance/MF/CC bills, ₹5L specific categories without AFA. Tailwind for vibesdk INR pricing. BLOCKED: SaaS subs classification under ₹1L unconfirmed.
- **SpaceX S-1 confidential filing CONFIRMED April 1** (run121, CNBC). Public window May 18-22 holds. Direct EDGAR still 403.
- **Cognition $25B** still in talks 30+ days, no close (run121).

## What this means for vibesdk

1. **DO degraded-mode drill BEFORE Jul 1 launch** (run121 DEC-121-B). Chaos test SimpleCodeGeneratorAgent: forced DO restart mid-PHASE_IMPLEMENTING, verify state restore + WebSocket reconnect (`worker/agents/core/websocket.ts` agent_connected). May 12 outage = first concrete signal ADR-010 must hold under load. **Highest ROI: turns ADR-010 theoretical mitigation into proven failover.**
2. **Mastra pin reconciliation P0** (run120 DEC-120-B). `bun pm ls @mastra/core` + `npm view @mastra/core versions --json` in worktree. If 1.33.x absent from public npm, downgrade to 1.32.1 or revert lockfile. 5-min defensive check, blocks CI install failure.
3. **Model-plurality elevation** (run121 DEC-121-A). Audit `worker/agents/inferutils/config.ts` AGENT_CONFIG for Anthropic-only paths; make Gemini/OpenAI fallbacks first-class before Jul 1. Codex 4.2x efficiency + Jun 15 billing-split creates asymmetric cost risk.
4. **Razorpay P0 unchanged at T-22d** (run121 DEC-121-C). UPI AutoPay 2026 split-tier is tailwind to ship. Add BLOCKED: SaaS subs ₹1L classification.
5. **Marketing pivot** — lead with "per-DO isolation + INR-native displayed pricing" twin moat (run118 DEC-118-C). Emergent has Razorpay rails but no isolation claim and no INR-displayed pricing.

## Decision asks for Owner

- **DEC-CYCLE30-A**: Run Mastra pin verification (`bun pm ls @mastra/core`) THIS dev session and downgrade to 1.32.1 if 1.33.x absent on public npm — recommended Y, blocks CI.
- **DEC-CYCLE30-B**: Schedule DO chaos drill in worktree before Jul 1 (mid-phase restart + reconnect verify) — recommended Y, May 12 outage made ADR-010 critical-path.
- **DEC-CYCLE30-C**: Elevate model-plurality audit from Q3 to pre-Jul 1 — refactor `worker/agents/inferutils/config.ts` so non-Anthropic paths are first-class — recommended Y, Codex/Jun-15 cost risk.
- **DEC-CYCLE30-D**: Accelerate Razorpay subscription primitives (UPI AutoPay + recurring cards) from Q3 to P0 launch feature (run118 DEC-118-E) — recommended Y, 2-week sprint per Razorpay's own Emergent case study, neutralizes Emergent moat at launch.
- **DEC-CYCLE30-E**: Confirm Sonnet 4.8 watch continues daily through Jun 15 (23rd slip) — recommended Y, no-cost monitor.

## Top 3 findings (for orchestrator chip)
1. DEFCON-1 streak BROKEN at 18 cycles — Emergent shipped Razorpay backend (run118); public pricing still USD-only so partial trigger not full, but vibesdk INR-displayed + isolation moat narrows.
2. Cloudflare DO outage May 12 90-min multi-region (run121) — first post-layoff incident; ADR-010 needs concrete chaos drill before Jul 1 launch.
3. Mastra `@mastra/core` npm latest = 1.32.1 (run120) — vibesdk pin `1.33.1` AHEAD of public npm; P0 reconciliation before next CI install.

## Open threads carrying forward
- pillar-1 (arch) next cycle (run123): CF Containers exact $/CPU-hr deep-fetch; Manus-Meta M&A verify; CF Sandboxes migration playbook (vibesdk authors if CF still silent); Cursor SDK hooks/subagents deep-dive.
- pillar-2 (features) next cycle: emergent.sh/pricing INR-tier flip check (full DEFCON-1 trigger); Lovable Jun changelog (5th empty month?); bolt.new alt-source; Blink/e2b changelog hunt.
- pillar-3 (tech) next cycle: Mastra pin local resolution; Sonnet 4.8 24th-cycle watch; CF Agents SDK v0.13 cut; CF Agent Memory GA timeline.
- pillar-4 (market) next cycle (run126): SpaceX S-1/A public May 18-22 window confirm; CF DO May 12 RCA/post-mortem; Cognition $25B close; Razorpay SaaS-subs ₹1L tier classification; bolt.new site-specific scrape.

## Cycle math
- Cycle 30 = runs 118 (features) → 119 (arch) → 120 (tech) → 121 (market)
- Cycle 31 starts: run122 (next pillar per drift-rotation = features)
