# Research Loop — Operator Quick Reference

**Status:** ACTIVE (scheduled task `vibesdk-research-loop` created 2026-05-12 13:25 IST)
**Cadence:** Every 4 hours, on the hour (IST)
**Next run:** Check your scheduled-tasks sidebar — "Scheduled" section.

## What this loop does

Each run picks one of 4 rotating research pillars and dispatches a fresh web-research agent against it. Findings drop here as timestamped markdown files. Every 4th run produces a synthesis summary.

| Pillar | Focus                                            | Output influences            |
|--------|--------------------------------------------------|------------------------------|
| 1      | Competitor architecture (CSP/DNS/cloud signals)  | INFRASTRUCTURE.md updates    |
| 2      | Competitor features + pricing changes            | PRICING-TIERS.md + roadmap   |
| 3      | Tech state-of-art (memory/RAG/sandboxes/eval)    | ADR + ai-engineer skill calls|
| 4      | Market (funding/hiring/customers/sentiment)      | WEDGES.md + GTM              |

## Three things you can do right now

```
# 1. See run history + key findings
cat docs/redesign/research/INDEX.md

# 2. Force a run now (don't wait for cron)
#    Open Claude Code sidebar → Scheduled → vibesdk-research-loop → "Run now"

# 3. Pause the loop
#    Sidebar → Scheduled → vibesdk-research-loop → toggle Enabled OFF
#    OR drop a stop flag:
touch docs/redesign/research/_stop.flag
```

## Three things to expect

```
# schema: when|what
every 4h|new run-NNN.md file in this folder, INDEX.md updated
every 16h (4 runs)|new CUMULATIVE-SUMMARY-CYCLE-N.md
on critical find|notification chip in orchestrator: "competitor shipped X — review"
```

## Cost ceiling

Each run = 1 research subagent w/ web fetches. Estimated ~10k tokens / run @ ~$0.03 USD via Sonnet routing.
6 runs/day × 30 days = ~$5-6/month. Loop auto-pauses if it ever exceeds 3× that.

## What this loop will NOT do

- It will NOT write production code on its own (Owner approves S1 stories explicitly)
- It will NOT commit to git (read-only loop)
- It will NOT modify anything outside `docs/redesign/research/`
- It will NOT spend Anthropic API credits beyond the documented ceiling

## How "24/7 until launched" actually works

```
NOW                                              LAUNCH
 |                                                  |
 | research loop (4h cadence) ─────────────────────► |
 | + concurrent dev sprints S1→S2→S3→S4 (Owner-go)  |
 | + Razorpay flip when Owner ready                  |
```

- Research keeps running while you sleep/work other things
- Each cycle (16h) you get a synthesis chip with 3 findings
- Notifications batch to avoid spam — only "critical-alert" pings outside cycle boundary
- Loop is meant to *inform* sprints, not replace them. Sprint S1 still needs the 10 stories shipped (see BEAT-EMERGENT-PLAN.md)

## Stop the loop

```
# Graceful (file flag — picked up at next scheduled wake)
touch docs/redesign/research/_stop.flag

# Immediate (disable scheduled task)
# In Claude Code sidebar: Scheduled → vibesdk-research-loop → toggle OFF

# Permanent removal
# Sidebar → ... menu → Delete task
```

## Resume the loop

```
rm docs/redesign/research/_stop.flag    # if file-flagged
# OR re-enable from sidebar
```

## Files in this folder

| File                                | Purpose                                             |
|-------------------------------------|-----------------------------------------------------|
| `README.md`                         | This file — operator quick-ref                      |
| `INDEX.md`                          | Run log + pillar schedule + cumulative knowledge    |
| `LOOP.md`                           | Contract: prompts per pillar, synthesis format      |
| `YYYY-MM-DD-HHMM-runNNN.md`         | One per run, evidence-cited                         |
| `CUMULATIVE-SUMMARY-CYCLE-N.md`     | Every-4-run synthesis                               |
| `_stop.flag`                        | Presence = graceful pause                           |
| `_auto-pause.flag`                  | Set by loop if 3 consecutive runs find nothing new  |
| `_skipped.log`                      | Append-only when a run aborts cleanly               |
