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
