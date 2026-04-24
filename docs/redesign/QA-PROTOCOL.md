# Real-User QA Protocol — Executable Checklist

**Pre-req:** `npm run db:seed` (seeds 3 users: free / pro / team @ `*@vibesdk.test` / `TestPassword123!`)

Two modes:
1. **Automated** — `npm run test:e2e` (Playwright; ~2 min)
2. **Manual, per-PR** — 15-min walkthrough below, done by @PM personally in a real browser (not `read_page`, not screenshot of a skeleton)

## Mode 1: Automated (Playwright)

```bash
# Terminal 1
npm run dev                    # vite on :5173 + wrangler dev proxy

# Terminal 2
npm run db:migrate:local       # fresh schema
npm run db:seed:reset          # fresh users
npm run test:e2e               # runs tests/e2e/critical-path.spec.ts

# Debug a flaky test:
npm run test:e2e:ui            # Playwright UI mode w/ time-travel
npm run test:e2e:headed        # watch it run in real Chrome
```

Coverage (14 assertions across 8 tests):
- Landing → hero + CTA visible
- Pricing → 4 tiers + cycle toggle + unauth-click-pro-redirects-to-signup
- Login → correct + wrong password + post-login home
- Billing → Pro tier + usage bar + cancel button
- Billing → Free tier + upgrade CTA + no cancel
- Logout → protected routes refuse
- Unauth /billing redirects
- Email format validation

## Mode 2: Manual 15-min Walkthrough

@PM opens a real browser (Chrome + one mobile) and runs through this. Pass = every box ticked with evidence (screenshot or video clip, saved to `docs/redesign/qa/run-YYYYMMDD/`).

### Session 1 — Unauth landing & marketing (3 min)

- [ ] Open `https://staging.vibesdk.app` — hero loads in < 2s, LCP visually complete
- [ ] Hero headline is readable, CTAs clickable, no layout shift after aurora paints
- [ ] Scroll → feature grid, pricing preview, FAQ all render
- [ ] Click nav "Pricing" → lands on `/pricing`, page title updates
- [ ] Pricing: 4 cards, "Pro" has "Most popular" badge
- [ ] Toggle Monthly/Annual → Pro price changes from ₹1,699 → ₹16,990
- [ ] Click "Start Pro" as anonymous visitor → redirects to signup (NOT to Razorpay)
- [ ] Mobile (iPhone, Chrome Android): hero is readable, nav collapses, pricing cards stack vertically

### Session 2 — Signup + email verify + login (4 min)

- [ ] Click "Start free" → signup form appears in modal (or page)
- [ ] Fill `qa+<timestamp>@vibesdk.test` + valid password → submit
- [ ] OTP prompt appears → check inbox (or dev mailhog) → OTP arrives w/ correct from/subject
- [ ] Enter wrong OTP → clear error message
- [ ] Enter correct OTP → email verified → auto-login lands on authed home
- [ ] Logout from avatar menu → landing page loads, no stale auth
- [ ] Log back in with password → post-login home, sidebar present, usage chip shows 0/5

### Session 3 — Pro user journey (4 min)

- [ ] Logout; login as `pro@vibesdk.test` / `TestPassword123!`
- [ ] Sidebar shows "Pro plan 12/100" + "Upgrade" hidden (already Pro)
- [ ] Click "New project" → prompt input focused, can type
- [ ] Submit prompt "build a waitlist landing" → chat session mounts
- [ ] **Agent chips visible** (TeamLead pulsing, Planner/Coder queued) — this is the transparency wedge
- [ ] PlanTree populates within 10s w/ milestones
- [ ] Preview pane shows iframe (may be empty initially, then content streams)
- [ ] If no live backend: seed session `seed_pro_*` loads w/ fixture plan tree
- [ ] Nav to `/billing` → correct tier + 12/100 bar + "Active" badge + Cancel button
- [ ] Click Cancel → confirm dialog → cancel → tier unchanged but status changes to "Inactive" or period-end warning
- [ ] Reload page → state persists (no flicker back to Free)

### Session 4 — Negative paths + edge cases (4 min)

- [ ] Free user (`free@vibesdk.test`) at 3/5 gens → tries 6th gen → entitlement error + upgrade nudge
- [ ] Valid signup but email already exists → clean error, suggests login
- [ ] Password reset flow: request → email arrives → click link → new password → can log in w/ new
- [ ] Session expiry: open /billing in one tab, clear cookies in another, refresh → redirected
- [ ] XSS canary: prompt field with `<script>alert(1)</script>` → renders as text, no alert
- [ ] Race: open 2 tabs as Free user, trigger gen in both simultaneously → only 1 succeeds, other shows "slot taken / limit reached" (TOCTOU test)
- [ ] Offline → online: disconnect network mid-gen → reconnect → session resumes (WS re-attaches, no duplicated files)

## "Done" Gate (per SDLC Acceptance Mandate)

- [ ] All 8 automated E2E tests pass
- [ ] All 30+ manual checkboxes above ticked with evidence
- [ ] Performance: LCP < 2.5s on landing, TTI < 3.5s on /chat
- [ ] Lighthouse score ≥ 90 perf / ≥ 95 a11y on landing + pricing
- [ ] No console errors in any of the 4 sessions
- [ ] Razorpay sandbox test payment succeeds end-to-end (see RAZORPAY-SETUP.md § 6)
- [ ] Webhook fires `subscription.activated` → subscription_tiers row updates
- [ ] @PM personally ran Sessions 1-3 in Chrome + 1 mobile browser. Sign-off line in commit:
      *"Ran QA Sessions 1-4 at {{timestamp}} — all pass. Evidence: docs/redesign/qa/run-{{date}}/"*

## What's NOT a Pass

- "API returned 200" is not a pass
- "Page loaded" is not a pass
- "Playwright green" is not a pass on its own (automated ≠ @PM looked at it)
- @QA-Lead saying "works on my machine" is not a pass

## When To Re-Run

- After any change to `worker/api/controllers/auth/*`, `worker/api/controllers/billing/*`, `src/routes/pricing/*`, `src/routes/billing/*`, `src/contexts/auth-context*`
- Before every production deploy
- Weekly on staging even if no changes (catches dependency drift)

## Known Holes (track + close)

| Gap                                   | Severity | Owner        | Fix target |
|---------------------------------------|----------|--------------|------------|
| Seed password hash format untested    | HIGH     | @Dev         | next sprint|
| Razorpay webhook not auto-tested      | MED      | @QA-Lead     | w/ Razorpay sandbox mock in CI |
| No email-delivery E2E (Mailhog TBD)   | MED      | @DevOps      | Prod-Readiness gate item |
| No mobile E2E project in playwright   | LOW      | @QA-Lead     | after chromium stabilizes |
| No multi-tenant isolation test        | MED      | @QA-Lead     | before first Team customer |
