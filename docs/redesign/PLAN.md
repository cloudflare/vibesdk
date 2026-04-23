# Implementation Plan — 4-Agent Team + Team Lead

**Owner:** @PM
**Skill invoked:** `product-management:sprint-planning`, `writing-plans`
**Status:** draft — Tech-Lead critique → `CRITIQUE.md`

## Team (for THIS redesign project)

```
@Team-Lead (Opus)         ← plan ownership, integration, final gate
├── @Agent-Architect      ← manus multi-agent, DO fan-out, model tiering
├── @Agent-Designer       ← emergent.sh UI, tokens, components, marketing
├── @Agent-Backend        ← worker/agents split, plan_nodes table, entitlements
└── @Agent-Frontend       ← React panes, PlanTree, AgentChip, pricing page
```

## Milestones (Tiered Rollout)

### M1 — Foundations (1 sprint, 10d)
**Goal:** Design system live + arch skeleton mergeable

| # | Story                                            | Owner       | Est | Tier  |
|---|--------------------------------------------------|-------------|-----|-------|
| 1 | `tokens.css` from DESIGN.md shipped              | Frontend    | 1d  | any   |
| 2 | Storybook skeleton + Button/Input/Card           | Frontend    | 2d  | any   |
| 3 | `PlanTree` component (read-only, mock data)      | Frontend    | 2d  | any   |
| 4 | `AgentChip` w/ status states + stream hook       | Frontend    | 1d  | any   |
| 5 | ADR-001 approved + merged                        | Architect   | 1d  | any   |
| 6 | `plan_nodes` + `agent_budgets` D1 migration      | Backend     | 1d  | any   |
| 7 | Entitlements service + middleware                | Backend     | 2d  | any   |
| 8 | Resizable layout shell (sidebar/plan/chat/prev)  | Frontend    | 2d  | any   |

**Exit gate:** Visual design system visible in Storybook; new panes render w/ mock data; entitlements middleware blocks over-tier requests.

### M2 — Multi-Agent Core (1 sprint, 10d)
**Goal:** TeamLead + Planner + 1 Coder end-to-end (flag-gated)

| # | Story                                            | Owner       | Est |
|---|--------------------------------------------------|-------------|-----|
| 1 | `TeamLeadAgent` DO scaffold                      | Backend     | 2d  |
| 2 | Extract `PlannerAgent` from PhaseGeneration op   | Backend     | 2d  |
| 3 | `CoderAgent` DO (wraps PhaseImplementation)      | Backend     | 2d  |
| 4 | Inter-DO RPC bus + shared ctx                    | Backend     | 2d  |
| 5 | WS multiplex: chat + plan + agent-status         | Backend+FE  | 2d  |
| 6 | Feature flag `multiAgentEnabled` per session     | Backend     | 1d  |
| 7 | Frontend: wire PlanTree to live plan events      | Frontend    | 2d  |
| 8 | E2E test: prompt → plan → 1 coder → preview      | QA          | 1d  |

**Exit gate:** Flag on = new pipeline produces working app for smoke-test prompt; flag off = current monolith unchanged.

### M3 — Parallelism + Critic + Tester (1 sprint, 10d)
**Goal:** 4 parallel agents, Critic red-teams, Tester self-heals

| # | Story                                            | Owner       | Est |
|---|--------------------------------------------------|-------------|-----|
| 1 | Spawn N CoderAgents w/ TeamLead merge logic      | Backend     | 3d  |
| 2 | `TesterAgent` DO — sandbox run + error capture   | Backend     | 2d  |
| 3 | `CriticAgent` DO + plan-critique loop (max 2x)   | Backend     | 2d  |
| 4 | Model-tier routing in each sub-agent             | Backend     | 2d  |
| 5 | Frontend: real-time agent chips + expandable log | Frontend    | 2d  |

**Exit gate:** Complex prompt resolves in ~50% time vs monolith baseline; Critic caught at least 1 bad plan in dogfood.

### M4 — Marketing Site + Pricing (1 sprint, 10d)
**Goal:** Pre-login emergent.sh-style site + Stripe integration

| # | Story                                            | Owner       | Est |
|---|--------------------------------------------------|-------------|-----|
| 1 | Split `apps/marketing` (Astro) OR `/marketing` routes | Frontend | 2d  |
| 2 | Hero + live-demo embed                           | Frontend    | 2d  |
| 3 | Feature grid + templates strip + testimonials    | Frontend    | 2d  |
| 4 | Pricing page w/ tier matrix + annual toggle      | Frontend    | 1d  |
| 5 | Stripe checkout + webhook → entitlements update  | Backend     | 2d  |
| 6 | Upgrade modal + in-app gating nudges             | Frontend    | 1d  |

**Exit gate:** Stripe sandbox: free → pro → team upgrades all unlock correct entitlements; marketing Lighthouse > 95 perf.

### M5 — Polish + GA (0.5 sprint, 5d)
- Accessibility audit (WCAG 2.2 AA) — `design:accessibility-review`
- Security audit — `security-audit`
- Production Readiness Gate (full checklist, emails, webhooks, real merchant test)
- Owner GO → deprecate monolith flag default to OFF → ON for new sessions

## Capacity Assumption

Single solo-Owner driving Claude Code sub-agents; estimates assume Claude parallelism. Halve if solo-human coding.

## Dependencies + Risks

| Dep                                    | Status      | Mitigation                       |
|----------------------------------------|-------------|----------------------------------|
| Cloudflare DO-to-DO RPC limits         | check       | `mcp__...search_cloudflare_documentation` pre-M2 |
| Stripe account provisioning            | @Owner TODO | unblock by start of M4           |
| SSO / SAML provider choice             | defer       | Enterprise tier only, M6+        |
| Model-tier proxy (optional)            | defer       | Use model param per call, not proxy |

## Competitive Lens

- **vs emergent.sh:** We win on transparency (see every agent), open-source core, BYO keys
- **vs manus:** We win on deploy (1-click Cloudflare), pricing ($20 vs $39)
- **vs bolt.new / v0:** We win on backend completeness (full-stack, not just frontend)
- **Deliberate trade-off:** No local install v1 — web-only → forces Cloudflare lock-in as feature not bug
