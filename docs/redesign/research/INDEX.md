# Competitive Research Loop — Index

**Purpose:** Continuous (every-4h) competitive + technology intel collection for vibesdk-vs-emergent positioning.
**Drop pattern:** `YYYY-MM-DD-HHMM-runNNN.md` — each run is timestamped + numbered.
**Rotation:** 4 pillars, one per run. Rotation locks topical diversity so we don't re-research the same thing.

## The 4 Pillars (rotate)

```
# schema: pillar|n|focus|owner-prompt-tag
1|architecture|competitor stacks, hosting, agent loops, hidden infra signals|architecture
2|features|recent launches, pricing changes, new tiers, UX shifts|features
3|tech|state-of-art for agent memory, RAG, sandboxes, model routing|tech
4|market|funding rounds, hiring signals, customer wins/losses, X/HN chatter|market
```

## Schedule

Recurring agent: `cron 0 */4 * * *` (every 4 hours local IST) → research-loop task in `~/.claude/scheduled-tasks/`. See [LOOP.md](LOOP.md) for the contract.

## Run Log

```
# schema: run|date-IST|pillar|file|key-finding
004|2026-05-13 04:12|market|2026-05-13-0412-run004.md|Capital bifurcated: top-tier (Cursor $50B, Cognition $25B, Replit $9B) doubled in <6mo while vibe-coding tier (Lovable $400M ARR, Emergent $100M ARR/8mo, Bolt+Azure) is fastest-growing revenue cohort in software history; Lovable Apr'26 security crisis + Cloudflare May 7 AI-first layoff (1,100) open a "trustworthy CF-native vibe-coding" lane for vibesdk
003|2026-05-13 00:07|tech|2026-05-13-0007-run003.md|vibesdk has zero memory/RAG/eval/routing layer vs SOTA (Mem0 91.6 LoCoMo, Zep 94.8 DMR, DeepEval 50+ metrics); Cloudflare Q2'26 shipped Agent Memory + AI Search + Sandbox GA as drop-in fixes on same platform
002|2026-05-12 10:38|features|2026-05-12-1038-run002.md|Agent-IDE bar reset: Cursor 3 + Composer 2, Replit Agent 3 sub-agents, Devin 2.0 ACU pricing; Manus shipped 8+ features in 60d; vibesdk gap: sub-agents, parallel worktrees, app monitoring, effort-based pricing
001|2026-05-12 13:23|architecture|2026-05-12-1323-run001.md|Devin collapsed $500→$20/mo; Lovable $400M ARR @ $6.6B val; Manus uses E2B+Sonnet+29 tools
```

(Newest at top going forward.)

## Cumulative Knowledge Base

After every 4 runs (1 cycle = 1 of each pillar), the @Architect agent reads all 4 fresh runs + the prior cumulative summary, and produces a new **CUMULATIVE-SUMMARY-CYCLE-N.md**. Old per-run files stay for evidence, but the cumulative is what informs decisions.

## Stop conditions (when "24/7" actually stops)

The loop runs until ANY of:
1. **Owner pauses it** — `mcp__scheduled-tasks__update_scheduled_task` w/ `enabled: false`
2. **Production launch GO** — Razorpay live + first paying customer
3. **Cost ceiling hit** — if Anthropic-API spend on research alone exceeds $20/month, pause (sanity check)
4. **Findings duplication** — when 3 consecutive runs surface 0 new facts, auto-pause for a week

## Manually trigger a single run

```bash
# Force-run the scheduled task now (doesn't wait for cron)
# Find the taskId via list_scheduled_tasks, then invoke its skill directly.
```

## Files in this folder

| File                                | What it is                                          |
|-------------------------------------|-----------------------------------------------------|
| `INDEX.md`                          | This file — run log + schedule overview             |
| `LOOP.md`                           | Contract for the recurring task (prompt + rules)    |
| `YYYY-MM-DD-HHMM-runNNN.md`         | One file per research run, evidence-cited           |
| `CUMULATIVE-SUMMARY-CYCLE-N.md`     | Synthesis every 4 runs                              |
