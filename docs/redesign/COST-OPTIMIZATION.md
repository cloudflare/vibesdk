# Cost Optimization — Next 10-40% Without Losing Speed or Quality

**Baseline:** ~$22/mo CF for 50k gens (see INFRASTRUCTURE.md). The question isn't "where else can we go" (we already win 43×). It's "inside our $22 base, where's the fat?"

Ordered by ROI: highest-impact + lowest-risk first.

## ── 1. Prompt caching on Gemini 3 Pro (Planner + Critic)  ~30-50% savings on Tier-1 LLM cost

**Observation:** Planner + Critic see the SAME blueprint + constraints prefix for every session in a project. Re-sending that as fresh tokens every call is wasteful.

**Action:**
- Gemini's context caching (`cached_content` API) — pre-cache the blueprint schema + style guide (~4K tokens) once per project.
- Quoted savings: 75% discount on cached tokens.
- Apply to: `worker/agents/inferutils/core.ts` — add `cached_content` ID when Planner/Critic prompt contains the project preamble.

**Est. savings:** ~6 credits/gen on Planner+Critic → ~2 credits/gen saved → ~$3/mo @ 50k gens.

**Risk:** low. Cache misses cost nothing; Gemini falls back to uncached pricing.

## ── 2. Route `conversationalResponse` to Flash-Lite  ~40% on chat path

**Observation:** `AGENT_CONFIG.conversationalResponse` currently defaults to Flash-regular. Most user turns are acknowledgements ("add a dark-mode toggle") — Flash-Lite handles them.

**Action:**
- Edit `worker/agents/inferutils/config.ts:184` → `conversationalResponse.name = AIModels.GEMINI_2_5_FLASH_LITE`
- Upgrade to Flash only if response contains code block (detect in streamer).

**Est. savings:** ~$5/mo @ 50k user turns (biggest single win).

**Risk:** medium. Needs an A/B measure — chat quality is subjective. Run 48h w/ feature flag + CSAT survey before cementing.

## ── 3. Critic short-circuit when plan node count < 3  ~60% of Critic calls

**Observation:** Critic's job is red-teaming *complex* plans. For plans w/ 1-2 tasks, Critic almost always returns `approve` w/o adding value. We're paying Opus for a no-op.

**Action:**
- In `TeamLeadCoordinator.runCritic()`: skip Critic if `milestone.tasks.length < 3` OR total owned-files < 5.
- Log the skip so we can measure: are we missing real issues? (should be ~0 based on empirical data.)

**Est. savings:** ~$2/mo + faster M2 milestones (Critic round adds ~10s wall-clock).

**Risk:** low — only affects plans where Critic couldn't contribute anyway.

## ── 4. Coalesce agent_status WS events at 10Hz  ~20% network + CPU on busy sessions

**Observation:** Each Coder emits a status transition every file write. 4 Coders × 10 files × 3 states = 120 WS frames per 90-second gen. Clients only render at 60fps — we're over-emitting.

**Action:**
- Server: batch `agent_status` messages per-session at 100ms intervals, coalesce by agentId (last-write-wins).
- Client (src/routes/chat/utils/handle-websocket-message.ts): existing dedup helpers → extend for `agent_status`.

**Est. savings:** ~$1/mo DO outbound + smoother UI. Measure first — may already be fine.

**Risk:** low. Coalescing can drop intermediate "thinking → writing" flicker; clients show final state anyway.

## ── 5. Image previews → R2 signed URLs instead of proxying bytes  ~$1/mo, perf win

**Observation:** `worker/api/controllers/credits/controller.ts` and sandbox routes proxy preview screenshots through Workers. R2 signed URLs skip the middle hop.

**Action:**
- `worker/services/sandbox/sandboxSdkClient` + any preview handlers → emit short-lived (60s) presigned R2 URLs, let client fetch direct.
- Already free egress on R2; this is just CPU + DO-duration savings.

**Est. savings:** minor ($). Real win: preview-first-paint by ~200ms.

**Risk:** low.

## ── 6. Cron compaction: plan_nodes older than 30 days  storage creep

**Observation:** `plan_nodes` accumulates forever. 50k gens × 20 nodes each = 1M rows/mo. D1 pricing is cheap but unbounded growth is bad hygiene.

**Action:**
- Cron Worker (daily @ 03:00): `DELETE FROM plan_nodes WHERE updated_at < strftime('%s','now','-30 days') AND status IN ('done','skipped','failed')`
- Retain full data for `active` sessions forever.
- Emit summary rows to R2 for long-term analytics (parquet).

**Est. savings:** stops eventual D1 overage; keeps query planner fast.

**Risk:** low. Archive to R2 means we can restore if ever needed.

## ── 7. Tier-gate BYO-keys path explicitly  shifts LLM spend to user

**Observation:** Users on BYO keys pay their own LLM bill. We still burn our DO + D1 + R2. That's fine — but we should tell users (and ourselves) that BYO users cost us ~$0.05/gen vs ~$1.20/gen on our keys. Makes Enterprise pricing saner.

**Action:**
- Add `uses_byo_keys: boolean` to agent_budgets.
- Dashboard: show "You saved ₹X on your last 10 gens by using your own Gemini key." → retention nudge.
- Enterprise tier default: BYO required (we're just orchestration).

**Est. savings:** for every BYO adopter, our marginal cost drops ~96%. Move the needle on enterprise margin.

**Risk:** zero — purely opt-in.

## ── 8. Observability: spend-per-gen dashboard  makes costs visible = makes cost cuts possible

**Observation:** You can't optimize what you can't measure. We track `tokens_spent` per plan_node but never roll up.

**Action:**
- New endpoint `/api/ops/cost-per-gen` (admin-only): groups agent_budgets + credit_transactions by day, shows p50/p95/p99 cost per generation.
- Alert if p95 > 2× baseline for 24h (probably a prompt regression).

**Est. savings:** enables items 1-7 above to be measured.

**Risk:** zero. Pure instrumentation.

## ── 9. Gemini 3 Flash Preview for `realtimeCodeFixer`  ~20%

**Observation:** `realtimeCodeFixer` runs constantly during gen to patch small errors. Currently on Grok 4.1 Fast (non-reasoning). Gemini 3 Flash is faster + cheaper for same quality (based on BigCodeBench delta).

**Action:** Swap model in `config.ts:21`. Fallback stays on 2.5-Flash.

**Est. savings:** ~$1/mo.

**Risk:** low — A/B on error-fix success rate first.

## ── Summary

```
# schema: item|est_monthly_savings|risk|effort_hours
1. Prompt caching (Planner+Critic)|$3|low|4
2. Flash-Lite for convo|$5|med|8 w/ A/B
3. Critic short-circuit|$2|low|2
4. WS coalescing|$1|low|4
5. R2 signed previews|$1|low|6
6. plan_nodes compaction cron|$0 now, $5 @ 10×|low|3
7. BYO incentives|moves spend off us entirely|zero|6
8. Cost-per-gen dashboard|enables all of above|zero|8
9. Gemini Flash for fixer|$1|low|3
──────────────────────────────
Immediate cut: ~$13/mo (60% of $22 base)
At 10× scale: ~$130/mo saved
```

**Do items 1, 3, 7, 8 first** — zero-to-low risk, immediate measurable impact.
**Then 2, 9 behind A/B flags.**
**Then 4, 5, 6 when metrics warrant.**
