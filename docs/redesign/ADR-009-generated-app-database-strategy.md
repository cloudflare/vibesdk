# ADR-009: Generated App Database Strategy — DO SQLite vs D1 vs DO Facets

**Status:** ACCEPTED (S14)
**Date:** 2026-05-16
**Deciders:** @Architect (ralph-loop iter 72)
**Supersedes:** None. Supplements ADR-007 (parallel sub-agents) and D1ProvisionService (S13).

---

## Context

vibesdk generates full-stack apps. Many generated apps need a persistent backend database (user data, content, sessions). Three Cloudflare storage options exist:

| Option | Provisioning | Availability | Isolation | S14 viability |
|--------|-------------|--------------|-----------|--------------|
| **D1** (REST API provision) | Manual (wrangler + DB ID) | GA | Shared across Workers | VIABLE (D1ProvisionService shipped S13) |
| **DO SQLite** (`ctx.storage.sql`) | Zero-config (auto on DO create) | GA — all DO | Per-DO instance | VIABLE — selected for S14 |
| **DO Facets** (`ctx.facets.get()`) | Automatic via Dynamic Workers | Open beta, requires Dynamic Workers | Per-facet (strongest) | NOT VIABLE S14 — requires Dynamic Workers |

### Why DO Facets are NOT viable for S14

CF Blog ("Durable Objects in Dynamic Workers"): "Facets are a feature of Dynamic Workers and require the Dynamic Worker Loader API to function. They cannot be used standalone."

vibesdk's generated apps are deployed as standard Cloudflare Workers via `wrangler deploy`. The Dynamic Worker Loader API requires a different deployment model where worker code is loaded at runtime (not bundled at deploy time). This changes the entire generated app output format.

**DO Facets remain S15 architecture scope** — when we build the platform-managed deployment path, each generated app can be a Dynamic Worker with its own Facet-backed SQLite.

---

## Decision

**S14: Use DO SQLite scaffolding for generated apps that need a backend database.**

### Rationale

1. **Zero provisioning required:** The Durable Object is instantiated automatically when first accessed. No `wrangler d1 create`, no database ID to copy, no binding ID to manage.

2. **Per-user isolation by default:** Each user's Durable Object instance has its own SQLite. No data leakage between users of the same generated app.

3. **GA, no beta risk:** `ctx.storage.sql` is stable Cloudflare API, not open beta.

4. **Consistent with vibesdk DO architecture:** vibesdk itself uses Durable Objects. Generated apps using DOs follows the same pattern the platform uses.

5. **SQLite is real SQL:** Full SQL including transactions, JOINs, indexes. Not key-value.

6. **S15 migration path:** When DO Facets GA with Dynamic Workers, each DO can become a Facet with vibesdk-managed provisioning. Same code, different deployment wrapper.

### When to use D1 instead

D1 is correct when:
- Multiple Workers in the same app need to write to the same database (D1 is shared; DO SQLite is per-instance)
- The app requires server-side admin access to all user records from a single endpoint
- Row count exceeds ~5M (D1 scales to billions; DO SQLite ~500MB per instance)

vibesdk generates D1 setup docs (D1ProvisionService.generateSetupDoc()) for these cases.

---

## Implementation

### S14 deliverable: `D1ProvisionService.generateDurableObjectSQLiteCode()`

New method on the existing `D1ProvisionService` that generates:
1. A complete TypeScript Durable Object class with typed RPC methods
2. Wrangler binding configuration snippet
3. Worker integration example

### S15 upgrade path: DO Facets via Dynamic Workers

When vibesdk ships platform-managed deployment (S15):
1. Generated app code loaded via Worker Loader API
2. `ctx.facets.get(userId, ...)` provisions per-user SQLite in one call
3. No user provisioning steps at all — fully automated

---

## Consequences

**Positive:**
- Zero-setup database for generated apps (no manual D1 provisioning)
- Per-user isolation without extra configuration
- Removes the wrangler.setup.md requirement for most generated apps
- Clear S15 upgrade path to Facets

**Negative:**
- DO SQLite is per-instance; multi-Worker DB access requires D1 fallback
- `ctx.storage.sql` cursor API is slightly different from standard D1 SQL API (minor DX friction)
- DO hibernate + storage eviction policy applies (SQLite persists but large data costs storage $)

---

## References

- CF Blog: "Durable Objects in Dynamic Workers: Give each AI-generated app its own database" (Agents Week 2026)
- DEC-047-B: DO Facets Dynamic Workers constraint (run047, S14 spike, iter 70)
- D1ProvisionService: `worker/services/d1/D1ProvisionService.ts` (S13, DEC-035-D)
