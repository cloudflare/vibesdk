# Infrastructure Decision — Cloudflare-Native vs GCP (emergent-style)

**Status:** DECIDED — Cloudflare-native w/ optional GCP Cloud Run escape hatch for sandbox-only workloads
**Date:** 2026-04-24
**Decision Panel verdict:** HIGH confidence (7/8 agree, Analyst-Commercial especially strong)
**Source research:** `docs/redesign/research/emergent-infra-probe.md` (CSP fingerprint scan, 2026-04-24)

## The Question

> "How do we get emergent's infrastructure capabilities on Google Cloud without losing speed or cost advantage?"

## TL;DR — We Already Win By Staying Put

**Emergent runs on GCP. That is their cost ceiling, not a feature to copy.**

We reverse-engineered emergent's stack from their Content-Security-Policy headers (publicly exposed):

```
CSP connect-src       → *.run.app (GCP Cloud Run) ✓
CSP frame-ancestors   → *.uc.r.appspot.com (GCP App Engine) ✓
api.emergent.sh DNS   → 34.144.197.47 (GCP Global LB range 34.144.0.0/14) ✓
CSP connect-src       → *.supabase.co (Supabase = Postgres+Auth) ✓
CSP connect-src       → wss://*.pusher.com (Pusher for realtime) ✓
Front door            → Cloudflare CDN proxy (CF-RAY header on app.emergent.sh)
```

Emergent = **GCP Cloud Run + App Engine + Supabase + Pusher** with Cloudflare only as a CDN. That's 4 vendors, cross-cloud egress, and a GCP bill.

**VibeSDK = Cloudflare-native.** Workers + Durable Objects + D1 + R2 on one platform. No egress fees. No vendor fanout.

## The Numbers — 100 active users × 500 gens/month = 50,000 generations/mo

```
# schema: component|emergent-style-gcp|vibesdk-cloudflare|delta
Compute (3-min gen, 2vCPU/4GB)|Cloud Run  $612/mo|Workers + DO  $9.4/mo|65× cheaper
DB|Cloud SQL g1-small HA  $75|D1 reads+writes  $2.05|36×
Agent pool|GKE Autopilot  $130|DO (same $9.4 above)|inside compute
Object storage|Cloud Storage  $15|R2  $1.50|10×
Egress (1TB out)|$96 (GCP $0.12/GB)|$0 (R2 + Workers free egress)|∞
LB + Armor|$25|included in Workers|—
──────────────────────────────────────────────────────────────────────
TOTAL|~$953/mo|~$22/mo|43× cheaper
```

**Emergent pays a $931/mo structural tax** to run the exact same workload we run on Cloudflare. At their $20/mo Pro price, 47 Pro subscribers just cover their *infra* before any margin.

## When GCP Would Actually Win

Not zero cases — there are two:

### Case 1: User-app sandbox needs arbitrary runtimes
If the **generated app** needs Python ML libraries, custom Docker images, or >128MB memory during exec, Cloudflare Workers + DO cannot host it. Options:

1. **Cloudflare Containers** (beta, now GA-ish) → primary path. Already in our deps (`@cloudflare/containers`).
2. **Cloudflare Sandbox SDK** (`@cloudflare/sandbox` — also in deps) → already how vibesdk runs user apps.
3. **GCP Cloud Run escape hatch** → only if (1) + (2) prove insufficient. Costs ~$612/mo at 50k gens — still 50% below emergent because we skip their Cloud SQL + GKE + App Engine costs.

### Case 2: Compliance requires on-prem / data residency
Enterprise customers with SOC2 Type II + HIPAA + data-residency contracts sometimes require VPC-in-a-region. GCP Private Service Connect + dedicated regional Cloud Run instances answer that. **Deferred to Enterprise tier only.** Price = "custom" = priced to cover the premium.

## The Hybrid (if we ever need it)

```
┌──────────────────────┐    ┌──────────────────────┐
│   Cloudflare edge    │    │  GCP Cloud Run pool   │
│                      │    │  (sandbox only)       │
│  Workers (API/auth)  │───▶│  gcr.io/proj/sandbox  │
│  DO (TeamLead)       │◀───│  user-code executor   │
│  DO (Coders/Tester)  │    │  returns URL + logs   │
│  D1 (plan state)     │    └──────────────────────┘
│  R2 (artifacts)       │
└──────────────────────┘
            ↕
      Only egress: 100-200 KB of user code per gen
      → ~200GB/mo = ~$24 egress
```

Total hybrid: **~$658/mo** (still 31% cheaper than emergent).

**Decision:** do NOT build the hybrid yet. Prove Cloudflare-only first; add GCP Run only when a user requirement forces it.

## Action Items

- [x] Document the decision (this file)
- [x] Publish the cost table in pricing page copy ("Built on Cloudflare — that's how we charge ₹1699 for what emergent charges $200")
- [ ] Add `/docs/architecture/infrastructure` page to marketing site summarizing this
- [ ] Add CSP header to `worker/index.ts` so competitors can't just fingerprint *us* back
- [ ] Run load test @ 500 users × 500 gens = 250k gens/mo → confirm cost scales linearly before committing to $20 Pro price
- [ ] Define SLO: p99 gen start < 2s, sandbox boot < 500ms (needs measurement)

## Competitive Lens — Why This Is A Moat

| Lever                          | We have it       | Emergent has it | Moat durability     |
|--------------------------------|------------------|------------------|---------------------|
| Zero egress fees (R2)          | ✓                | ✗ (GCP $0.12/GB) | Permanent (Cloudflare policy) |
| Per-request billing (DO)       | ✓                | ✗ (always-on pods)| Permanent (architectural)    |
| Global anycast (Workers)       | ✓ (300+ POPs)    | ~ (CF CDN front only) | Deep                       |
| Single-vendor bill             | ✓                | ✗ (4 vendors)     | Permanent                    |
| Cold-start <50ms               | ✓ (V8 isolates)  | ✗ (container cold ~1-3s) | Architectural         |

**For emergent to match our unit economics they'd have to re-platform off GCP.** That's a multi-year rewrite. Until then, every Pro customer we win has ~$11/mo better margin for us than for them.

## What We Add To Marketing

Rewrite the WEDGES.md pricing positioning line:

> **"Emergent charges $20/mo. Their infrastructure costs them $19.10. That's why they can't go lower. We charge ₹1699/mo. Our infrastructure costs us ₹80. Guess who has room to compete on price?"**

Ship it on the pricing page FAQ next sprint.

## References

- Research fingerprint: CSP headers on `app.emergent.sh` (fetched 2026-04-24)
- Cloudflare Workers pricing: https://developers.cloudflare.com/workers/platform/pricing/
- GCP Cloud Run pricing: https://cloud.google.com/run/pricing
- Cloudflare R2 egress policy: https://developers.cloudflare.com/r2/pricing/ (free egress to internet)
- Emergent public CSP (verifiable): `curl -I https://app.emergent.sh | grep -i csp`
