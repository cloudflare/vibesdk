# Redesign Docs — Index

Read order for a new reader:

1. **[README.md](./README.md)** — brief, team, artifact map
2. **[ARCHITECTURE.md](./ARCHITECTURE.md)** — current state, target, migration
3. **[DESIGN.md](./DESIGN.md)** — tokens, post-login layout, components
4. **[UI-UX-PRELOGIN.md](./UI-UX-PRELOGIN.md)** — marketing site, auth, copy
5. **[PRICING-TIERS.md](./PRICING-TIERS.md)** — 4 tiers, gating, upgrade nudges
6. **[PLAN.md](./PLAN.md)** — 5 milestones, stories, estimates
7. **[CRITIQUE.md](./CRITIQUE.md)** — 10 challenge items, 4 must-fix blockers
8. **[ADR-001-multi-agent.md](./ADR-001-multi-agent.md)** — DO fan-out decision
9. **[ADR-002-sandbox-strategy.md](./ADR-002-sandbox-strategy.md)** — stay CF-native, e2b escape hatch (ACCEPTED 2026-05-12)
10. **[ADR-003-agui-protocol-adoption.md](./ADR-003-agui-protocol-adoption.md)** — adopt AG-UI post-S2 (ACCEPTED-DEFERRED)
11. **[ADR-004-memory-rag-eval.md](./ADR-004-memory-rag-eval.md)** — CF-native memory + RAG + DeepEval-port (ACCEPTED 2026-05-13, response to research-run-003)
12. **[ADR-005-agent-stack-selection.md](./ADR-005-agent-stack-selection.md)** — Mastra INCLUDE / Hermes+ApeRAG AVOID / Skills INCLUDE (ACCEPTED 2026-05-14, panel 6/8)
13. **[ADR-006-s9-spike-plan.md](./ADR-006-s9-spike-plan.md)** — S9 spikes: CF Project Think (DEFER until GA) + Memori pilot (PROPOSED 2026-05-14)
14. **[WEDGES.md](./WEDGES.md)** — speed + cost wedges vs emergent
12. **[INFRASTRUCTURE.md](./INFRASTRUCTURE.md)** — Cloudflare vs GCP decision (HIGH-confidence, 43× cheaper)
13. **[COST-OPTIMIZATION.md](./COST-OPTIMIZATION.md)** — 9 levers ranked by ROI
14. **[RAZORPAY-SETUP.md](./RAZORPAY-SETUP.md)** — operator runbook for live billing
15. **[QA-PROTOCOL.md](./QA-PROTOCOL.md)** — automated + manual QA checklist
16. **[BEAT-EMERGENT-PLAN.md](./BEAT-EMERGENT-PLAN.md)** — 5 levers × 4 sprints
17. **[BENCHMARK-PAGE-SPEC.md](./BENCHMARK-PAGE-SPEC.md)** — public /benchmark page spec (S2 deliverable)
18. **[ROADMAP.md](./ROADMAP.md)** — honest close-out: what shipped, what didn't
19. **[research/](./research/)** — competitive intel loop (4h cron, auto-runs)

## Status Board

| Doc                         | Owner         | Status    |
|-----------------------------|---------------|-----------|
| README.md                   | @PM           | DONE      |
| ARCHITECTURE.md             | @Architect    | DRAFT     |
| DESIGN.md                   | @UI/UX        | DRAFT     |
| UI-UX-PRELOGIN.md           | @UI/UX        | DRAFT     |
| PRICING-TIERS.md            | @PO           | DRAFT     |
| PLAN.md                     | @PM           | DRAFT     |
| CRITIQUE.md                 | @Tech-Lead    | DRAFT     |
| ADR-001-multi-agent.md      | @Architect    | PROPOSED  |

## Next Actions (requires Owner GO)

1. **Run Decision Panel** (8 agents) on multi-agent framework → log verdict in ADR-001 → status PROPOSED → ACCEPTED
2. **Resolve 4 must-fix blockers** from CRITIQUE.md (C1 storage, C2 file partitioning, C7 Enterprise pricing, C10 panel)
3. **Owner GO for Phase 1** → start M1 sprint (foundations: tokens + component skeletons + entitlements)
4. **Phase 0 exit gate** signed

## Decisions Logged

- **DEC-001** (2026-04-24): Target architecture = custom DO fan-out, Manus-style 4-agent + TeamLead. Rationale: on-platform, no new deps. See ADR-001.
- **DEC-002** (2026-04-24): Pricing = 4-tier (Free/Pro $20/Team $60 seat/Enterprise). See PRICING-TIERS.md. Enterprise margin MUST be reworked (CRITIQUE C7).
- **DEC-003** (2026-04-24): Pre-login marketing = emergent.sh pattern w/ dark-default + light toggle. See UI-UX-PRELOGIN.md.
- **DEC-004** (2026-04-24): Migration = feature-flagged, non-breaking, 2-sprint parallel run before monolith deprecation.
- **DEC-005** (2026-05-13): Memory + RAG + Eval layer = Cloudflare Agent Memory + AI Search + TS-port of DeepEval core metrics. Best-of-breed (Mem0/Infinity/E2B) deferred to preserve 43× CF cost moat. See ADR-004. Triggered by run003 finding (zero memory/RAG/eval vs Mem0 91.6 LoCoMo + DeepEval 50+ metrics).
