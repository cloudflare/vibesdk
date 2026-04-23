# Plan Critique — @Tech-Lead + @Critic

**Reviewers:** @Tech-Lead, @Critic
**Target:** `PLAN.md`, `ARCHITECTURE.md`, `PRICING-TIERS.md`
**Mode:** Contrarian — "What could go wrong?"

## Stage 1 — Spec Compliance

| # | Check                                                        | Verdict |
|---|--------------------------------------------------------------|---------|
| 1 | Plan addresses multi-agent (Manus-style)?                    | PASS    |
| 2 | Plan addresses emergent.sh visual polish?                    | PASS    |
| 3 | Plan addresses tiered upgrades?                              | PASS    |
| 4 | Plan separates pre/post-login design?                        | PASS    |
| 5 | Plan includes 4-agent + team-lead structure?                 | PASS    |
| 6 | Plan has explicit critique step before execution?            | PASS (this doc) |
| 7 | Migration is non-breaking / feature-flagged?                 | PASS    |

**Stage 1:** PASS — proceed to Stage 2 quality review.

## Stage 2 — Challenge List (MUST respond)

### C1 — Monolith extraction assumes DO split is free (it isn't)
**Risk:** Current `SimpleCodeGeneratorAgent` (2800 LOC) has implicit cross-dependencies — state machine, abort-controller tree, git callbacks, WS handlers. Splitting into 4 DOs may double-count storage (each DO = separate SQLite instance) and fragment transactions.
**Response needed:** @Architect — decide shared-storage pattern. Options: (a) shared D1 for plan+files, DOs only for compute; (b) TeamLead owns SQLite, sub-agents stateless.
**Severity:** HIGH — could invalidate M2 estimates.

### C2 — "Parallel Coders writing files" = merge hell
**Risk:** Two Coders writing `src/App.tsx` → conflict. Git-in-SQLite doesn't three-way-merge for you.
**Response needed:** Either (a) file-level locks via plan-node assignment (Planner partitions file-set → each Coder owns a slice), or (b) serial commit via TeamLead queue. Currently PLAN.md is silent.
**Severity:** HIGH — must resolve before M3.

### C3 — Critic loop can burn token budget silently
**Risk:** "Max 2 critique rounds" — but what if Critic always rejects? Need hard abort, user-visible "Critic stuck" state, and budget tracking per round.
**Response needed:** @Architect — add `critic_rounds` to `plan_nodes`, expose in UI.
**Severity:** MED.

### C4 — Entitlements enforcement is serverless-racy
**Risk:** User on Free hits 5/5 generations, opens 3 tabs, fires 3 at once — all read `used=5` before any writes `used=6`. Classic TOCTOU.
**Response needed:** Atomic counter in Secrets DO (per-user) OR D1 `UPDATE ... WHERE used < limit RETURNING`.
**Severity:** MED — not catastrophic but billing leak.

### C5 — Stripe webhook → entitlement update is a distinct trust boundary
**Risk:** Must verify signature, idempotency-key on handler, replay-attack defence. Not trivial.
**Response needed:** @Architect ADR-002 drafted before M4 start.
**Severity:** MED.

### C6 — Marketing site split (Astro) doubles deploy surface
**Risk:** Two apps = two build pipelines, two domains, CSP complexity, shared-auth cookie scope.
**Recommendation:** DEFER to post-GA. v1 = `/marketing` routes within existing React app. Reassess when marketing perf budget binds.
**Severity:** LOW — already flagged in UI-UX doc as tradeoff.

### C7 — "Opus default" Enterprise tier is commercially suicidal w/o price discovery
**Risk:** Opus = ~$75/M out vs Sonnet ~$15. Unlimited Opus @ $X flat → 1 heavy user bankrupts tier.
**Response needed:** @Analyst-Commercial — model Enterprise margin w/ token caps, not unlimited. Pricing says "Unlimited generations" not "unlimited tokens" — clarify.
**Severity:** HIGH — rewrite PRICING-TIERS.md Enterprise row to cap tokens OR convert to usage-based + committed spend.

### C8 — Plan-tree versioning not specified
**Risk:** User mid-generation says "actually, different approach" — do we rollback the plan? Fork it? TeamLead has no mental model.
**Response needed:** @Architect — define plan mutation protocol. Likely: plan is append-only, TeamLead issues "invalidate subtree" event.
**Severity:** MED.

### C9 — No observability story
**Risk:** 4 sub-agents × N sessions = combinatorial log volume. How do we debug "session stuck"?
**Response needed:** @DevOps — structured logging w/ session_id + agent_id, Workers Logpush to R2/Datadog, trace-id correlation.
**Severity:** MED — add as M3 prerequisite.

### C10 — Decision Panel skipped on framework choice
**Risk:** ARCHITECTURE.md declares "Option 1: custom DO fan-out" as winner via 4 internal architects, but full 8-agent Decision Panel (commercial + user + competitive + risk lenses) wasn't run.
**Response needed:** Run Decision Panel before M2 kickoff; attach verdict to ADR-001.
**Severity:** LOW-MED — likely same conclusion, but process matters for reversibility.

## Stage 2 — Quality Observations

- PLAN.md estimates assume no unknowns; real velocity will be 0.6–0.8x. Add 30% buffer.
- DESIGN.md doesn't specify dark/light toggle mechanics; needs a `ThemeProvider` story.
- PRICING-TIERS.md "Free → Pro 3%" target has no cohort baseline; first 60d treat as learning, not goal.
- UI-UX-PRELOGIN.md Feature Grid copy uses emojis — matches brand, but CLAUDE.md says no emojis in code/content. Reconcile: emojis OK in marketing visual assets, NOT in code/ADRs.

## Must-Fix Before Phase 1 GO

- [ ] C1 — shared-storage pattern decided + ADR
- [ ] C2 — file-partitioning or serial-commit chosen + documented
- [ ] C7 — Enterprise pricing reworked (token caps or usage-based)
- [ ] C10 — Decision Panel on framework run + verdict logged

## Nice-to-Have Before M2

- [ ] C3, C4, C8, C9 resolved
- [ ] Observability ADR-003

## Verdict

**Plan is sound in shape, under-specified in mechanics.** Resolve 4 blockers above → GO for M1 in parallel w/ resolving the rest. Do NOT start M2 until C1, C2 closed.
