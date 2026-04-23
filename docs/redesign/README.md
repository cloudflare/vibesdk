# VibeSDK Redesign — Project Brief

**Worktree:** `inspiring-roentgen-65e47e`
**Started:** 2026-04-24
**Phase:** 0 — Discovery & Gold Standards

## Mission

Upgrade VibeSDK from single-agent chat UI → **Manus-style multi-agent planner** w/ **emergent.sh-tier visual polish** and **tiered commercial SKUs**.

## Benchmarks

| Surface          | Reference            | Why                                                  |
|------------------|----------------------|------------------------------------------------------|
| Pre-login        | `emergent.sh`        | Hero → social proof → feature grid → pricing → CTA   |
| Post-login       | `app.emergent.sh`    | Sidebar + chat canvas + live preview pane            |
| Agent UX         | `manus.im`           | Multi-agent plan w/ team-lead + parallel workers     |
| Light alt        | `bolt.new`, `v0.dev` | Faster-perceived, cleaner empty state                |

## Team Structure (this redesign)

```
@PM (lead)
├── @BA            → requirements, competitive brief
├── @UI/UX         → DESIGN.md, emergent.sh pre-login clone
├── @Architect     → manus multi-agent ADR
└── @Tech-Lead     → critique plan, enforce quality

Decision Panel triggers: multi-agent framework choice, pricing-tier model.
```

## 4-Agent Planner Model (Manus-style)

```
User prompt
  ↓
@Team-Lead (Opus)         ← owns plan, critiques, merges results
  ├── @Planner (Sonnet-H) ← decomposes → blueprint + milestones
  ├── @Coder   (Sonnet-M) ← writes files in parallel
  ├── @Tester  (Sonnet-L) ← runs sandbox, reports errors
  └── @Critic  (Opus)     ← red-teams plan before execute
```

Current vibesdk: single `SimpleCodeGeneratorAgent` Durable Object (2800 LOC).
Target: same DO, but fan-out to 4 sub-agents via internal message bus.

## Artifacts in This Folder

| File                         | Owner        | Status |
|------------------------------|--------------|--------|
| `README.md`                  | @PM          | this   |
| `ARCHITECTURE.md`            | @Architect   | next   |
| `DESIGN.md`                  | @UI/UX       | next   |
| `UI-UX-PRELOGIN.md`          | @UI/UX       | next   |
| `PLAN.md`                    | @PM          | next   |
| `CRITIQUE.md`                | @Tech-Lead   | next   |
| `PRICING-TIERS.md`           | @PO          | next   |
| `ADR-001-multi-agent.md`     | @Architect   | next   |

## Gates

- [ ] Phase 0 GO — Owner reviews all artifacts above
- [ ] Decision Panel verdict on multi-agent framework (LangGraph vs custom DO fan-out vs smolagents)
- [ ] @Critic challenge list resolved
- [ ] Phase 1 sprint scoped → implementation begins

## Out of Scope (v1)

- Model-router proxy (defer to Phase 3 optimisation)
- Full i18n
- Mobile-native app (PWA only)
