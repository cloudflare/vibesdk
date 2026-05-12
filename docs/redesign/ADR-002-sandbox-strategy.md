# ADR-002 — Sandbox Strategy: Cloudflare-Native with e2b Escape Hatch

**Status:** ACCEPTED (2026-05-12)
**Deciders:** @Architect, @Analyst-Commercial, @Arch-Scale
**Supersedes:** none
**Related:** ADR-001 (multi-agent), INFRASTRUCTURE.md, research/2026-05-12-1323-run001.md

## Context

VibeSDK executes generated user apps in a sandbox. Today that sandbox is Cloudflare-native: `@cloudflare/sandbox` + `@cloudflare/containers`, both already in `package.json` and wired through `worker/services/sandbox/`. Research run 001 surfaced **e2b.dev** as the canonical sandbox layer for Manus and other agent platforms (Firecracker microVMs, ≤125ms boot, $0.05/hr per 1 vCPU). The pull is real: Manus shipped on this stack and it is the path of least resistance for arbitrary Python/ML runtimes.

INFRASTRUCTURE.md already priced the alternative. At our 100-active-user / 50k-gen-per-month base case, full Cloudflare-native compute is **$22/mo** vs **$953/mo** on a GCP/e2b-style fan-out — a **43× cost gap**. e2b on its own (Pro plan $150/mo plus per-sandbox-hour) breaks our `₹1699/mo` ($20) pricing wedge the moment we cross a few hundred active sessions.

The question is not "which is technically better." The question is: do we eat the cost gap today for runtime flexibility we do not yet need?

## Decision

**Stay Cloudflare-native.** Continue using `@cloudflare/sandbox` and `@cloudflare/containers` as the sole sandbox runtime. **Defer e2b.dev integration to a documented escape hatch**, triggered only when a specific user-runtime need exceeds Cloudflare Containers' envelope. No code changes today.

## Trigger Conditions for Hybrid (any one fires → re-open this ADR)

1. **Runtime ceiling hit:** a user requests a Python ML / CUDA / >2 GB-RAM container that `@cloudflare/containers` cannot host, and we see this request from **≥10 distinct paying users** in a rolling 30-day window.
2. **Boot-latency SLO miss:** sandbox cold-start p95 exceeds 2.0 s for 7 consecutive days (current target: <500 ms per INFRASTRUCTURE.md).
3. **Concurrency ceiling:** Cloudflare Containers concurrent-instance quota blocks a Team-tier customer's contracted workload and quota-increase is denied.
4. **Compliance pull:** enterprise prospect requires Firecracker isolation or per-tenant VM (contractual, not preference).

Absent all four, the answer remains: ship on Cloudflare.

## Trade-offs

**We give up:**
- Out-of-the-box arbitrary Linux runtimes (Cloudflare Containers covers most but not all)
- Manus-parity marketing line ("we run on the same sandbox")
- Faster path to GPU-backed user apps

**We gain:**
- 43× cost advantage compounded across every generation
- Single-vendor bill, single-region edge consistency, zero egress
- No new dependency surface in `worker/services/sandbox/`
- Pricing wedge stays defensible (see WEDGES.md)

## Consequences

1. **Code:** `worker/services/sandbox/` keeps `@cloudflare/sandbox` as the only adapter. We do NOT add an e2b SDK to `package.json` yet. Interface stays narrow enough to swap later (one provider behind one interface — already the case).
2. **Billing:** sandbox cost stays inside Workers/DO compute lines; no separate per-hour line item to pass through. Pricing in PRICING-TIERS.md does not need a sandbox surcharge.
3. **Docs:** INFRASTRUCTURE.md "Case 1" section remains current and authoritative. Pricing-page copy from WEDGES.md ("Built on Cloudflare — that's how we charge ₹1699...") stays truthful.
4. **Roadmap:** no sandbox-migration epic in ROADMAP.md. Engineering capacity that would have gone to e2b integration goes to ADR-001 sub-agent rollout.
5. **Observability:** add a counter for sandbox-failure-by-runtime-mismatch in worker telemetry so trigger condition #1 is measurable when it arrives.

## Implementation Note

**No code changes required today.** This ADR exists so that when a trigger fires we do not re-derive the decision from scratch. The integration path is pre-thought: keep the existing `Sandbox` interface in `worker/services/sandbox/`, add an `E2bSandboxAdapter` behind a feature flag (`sandboxProvider=e2b`), route only the workloads that hit the trigger to e2b, keep everything else on Cloudflare. Egress stays small because user code is ~100-200 KB per gen (INFRASTRUCTURE.md hybrid section).

## Alternatives Considered

| Option | Verdict | Reason |
|---|---|---|
| **Pure Cloudflare-native** (chosen) | ACCEPT | 43× cost advantage; covers ≥95% of expected workloads; no new deps |
| Pure e2b.dev | REJECT | $150/mo floor + per-hour at 50k gens → >$600/mo, breaks ₹1699 pricing wedge |
| Hybrid from day 1 | REJECT | Added complexity (two providers, two billing lines, two failure modes) for zero current user demand |

## Review Trigger

Re-open this ADR if either:
- **(a)** we hit **≥100 active paying users** AND log **≥3 distinct user-runtime complaints** that map to trigger condition #1 inside a single quarter; OR
- **(b)** **emergent.sh announces a Cloudflare migration** (signals the market has called the cost question the same way we have, and our moat narrative needs a refresh).

## References

- INFRASTRUCTURE.md — cost table, hybrid diagram, Case 1/Case 2 framing
- docs/redesign/research/2026-05-12-1323-run001.md §1, §2, §9, insight #1
- ADR-001-multi-agent.md — sub-agent DO fan-out, sandbox is compute-only target
- `package.json` — `@cloudflare/sandbox`, `@cloudflare/containers` already present
- `worker/services/sandbox/` — current adapter surface area
