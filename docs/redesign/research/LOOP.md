# Research Loop Contract

The recurring scheduled task (`vibesdk-research-loop`) runs every 4 hours and:

1. Reads `INDEX.md` to find the next run number + which pillar comes next (rotate 1→2→3→4→1…)
2. Dispatches a research agent w/ pillar-specific prompt (see `prompts/` below)
3. Writes findings to `YYYY-MM-DD-HHMM-runNNN.md`
4. Updates `INDEX.md` Run Log
5. If run number is divisible by 4, also generates `CUMULATIVE-SUMMARY-CYCLE-N.md`
6. Surfaces highest-impact finding as a chip in the orchestrator UI (notifyOnCompletion=true)

## Pillar Prompts (rotate)

### Pillar 1 — Architecture (runs 1, 5, 9, …)

Re-fetch competitor stacks; check CSP/DNS/network headers for changes; look for new cloud-vendor signals. Compare to last 1/5/9/13/… run from same pillar — diff.

Competitors: emergent.sh, manus.im, bolt.new, v0.app, lovable.dev, replit, cursor, Devin, e2b.dev. Plus 2-3 NEW competitors discovered since last cycle.

### Pillar 2 — Features (runs 2, 6, 10, …)

Recent product launches (last 60 days), pricing changes, new tiers, UX shifts. Check: marketing pages, /pricing, /changelog, blog, Twitter/X, ProductHunt.

### Pillar 3 — Tech (runs 3, 7, 11, …)

State of the art in: agent memory (Mem0, Letta/MemGPT, Zep, Pinecone), RAG patterns (LightRAG, ColPali, MinerU, Infinity), sandboxes (E2B, Daytona, Codespaces), model routing (OpenRouter, Portkey, LiteLLM), evaluation (DeepEval, RAGAS, TrustLLM).

### Pillar 4 — Market (runs 4, 8, 12, …)

Funding rounds in agentic-builder space; LinkedIn hiring patterns from competitors; customer wins/losses; HN/Reddit threads; YC W26/S26 batch. What macro-shifts threaten or favor vibesdk?

## Cumulative Cycle Format

Every 4th run produces `CUMULATIVE-SUMMARY-CYCLE-N.md`:

```
# Cycle N — Date range
## What changed
- [Architecture deltas vs prior cycle]
- [Feature deltas]
- [Tech deltas]
- [Market deltas]

## What this means for vibesdk
- [Recommended code/marketing changes, ranked by ROI]

## Decision asks for Owner
- [3-5 binary decisions surfaced]

## Open threads carrying forward
- [Items needing pillar-N investigation next cycle]
```

## Notification policy

- Per-run: no notification (low signal)
- Per-cycle (every 4th run): notification w/ top-3 findings
- Critical alert: any run that finds a competitor shipping a feature that BREAKS our differentiation → immediate notification w/ Owner ping

## Termination conditions

See INDEX.md "Stop conditions" — 4 ways the loop ends gracefully.
