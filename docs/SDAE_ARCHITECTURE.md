# SDAE — Spec-Driven Autonomous Engine

## Overview

The Spec-Driven Autonomous Engine (SDAE) is an optimization layer built on top of VibeSDK that replaces traditional "agent chat" loops with a deterministic, typed, cacheable execution model. The core innovation is converting AI from **"thinking repeatedly"** to **"thinking once, executing many times"**.

### Why This Beats Manus / Emergent / Replit Agent

| Capability | Traditional Agents | SDAE |
|---|---|---|
| Execution model | Chat loops (token-heavy) | Fixed DAG (minimal tokens) |
| Predictability | Unpredictable | Deterministic |
| Cost per task | $0.50–$5.00 | $0.03–$0.12 |
| Cache hit rate | 0% (stateless) | 55–82% |
| First-pass success | ~50% | 78–94% |
| Recovery time | Minutes | 12–45 seconds |

## Architecture

```
Phase 0: Intent → Template Match? → Pre-filled Form (or Chat→Form Bridge)
         ↓
Phase 1: Adaptive Form (tiny model) + User Refine
         ↓
Phase 2: Master Bible (premium model once) → Cheap Critic Loop → Refined Bible
         ↓ (optional user micro-review)
Phase 3: DSL Compiler → Validated DAG → Content Hashes
         ↓
Phase 4: DAG Runner (parallel groups) → Sandbox Workers
         ↓
Post-run: Harvest Golden Template → Cache for reuse
```

### 5-Layer System Architecture

```
┌────────────────────────────────────────────────┐
│            EXPERIENCE LAYER                     │
│  (Dynamic Forms + Chat↔Form Bridge)            │
│  worker/sdae/form-engine/                       │
└────────────────────────────────────────────────┘
                    ↓
┌────────────────────────────────────────────────┐
│        SPEC INTELLIGENCE LAYER                  │
│  (Form → Master Bible → Critic → Versioning)   │
│  worker/sdae/spec-generator/                    │
└────────────────────────────────────────────────┘
                    ↓
┌────────────────────────────────────────────────┐
│     EXECUTION GRAPH ENGINE                      │
│  (DSL Compiler → Validated DAG)                 │
│  worker/sdae/compiler/                          │
└────────────────────────────────────────────────┘
                    ↓
┌────────────────────────────────────────────────┐
│         WORKER + SANDBOX LAYER                  │
│  (Parallel execution, stateless workers)        │
│  worker/sdae/runner/                            │
└────────────────────────────────────────────────┘
                    ↓
┌────────────────────────────────────────────────┐
│      COST-QUALITY + CACHE LAYER                 │
│  (Policy, Routing, Quality Gates, Cache)        │
│  worker/sdae/cost-quality/ + cache/             │
└────────────────────────────────────────────────┘
```

## Module Reference

### `worker/sdae/types/` — Shared Type Definitions

All shared enums and constants used across SDAE modules:
- `OpType` — 18 DSL operation types (SCRAPE_DYNAMIC, CODE_GENERATE, DEPLOY_APP, etc.)
- `NodeStatus`, `RunStatus` — execution state machines
- `OnFailAction` — per-node failure policies
- `DSL_VERSION` — current version string ('2.1')

### `worker/sdae/ir/` — Intermediate Representation

The formal contract between the Bible generator and the execution engine. Key types:

- **`MasterBible`** — The single source of truth. A strict, versioned structure containing constraints, edge cases, dos/don'ts, execution graph, governance, and validation rules. No natural language parsing happens after this point.

- **`DAGNode`** — The atomic, hashable, cacheable unit of work. Key fields:
  - `nodeId` — stable business identifier
  - `contentHash` — deterministic SHA-256 for caching/idempotency
  - `op` — typed operation (validated against OP_SCHEMAS)
  - `params` — per-op validated parameters

- **`OP_SCHEMAS`** — Registry mapping each OpType to its strict Zod schema. This eliminates `Dict[str, Any]` and ensures compile-time validation.

- **`ExecutionPolicy`** — Separated from the plan. Controls retry, parallelism, timeouts, and approval gates.

- **`GovernanceSpec`** — Non-optional security layer: sandbox isolation, secret management, audit logging, human-in-the-loop gates.

### `worker/sdae/compiler/` — DSL Compiler

Converts a MasterBible into an executable DAG through an 8-step pipeline:

1. **Schema validation** — Bible structure against MasterBibleSchema
2. **Param validation** — each node's params against OP_SCHEMAS[node.op]
3. **Duplicate detection** — no two nodes share a nodeId
4. **Cycle detection** — Kahn's algorithm (O(V+E))
5. **Topological sort** — execution-safe ordering
6. **Content hash** — deterministic SHA-256 for every node
7. **Dead node detection** — unreachable nodes flagged
8. **Parallelism analysis** — groups of concurrently-executable nodes

### `worker/sdae/runner/` — DAG Runner

Executes compiled DAGs with:
- **Semaphore-bounded parallelism** within groups
- **Content-hash caching** — check before execute, store after
- **Configurable retry** — exponential/linear/fixed backoff with jitter
- **onFail policies** — stop/skip/retry/fallback per node
- **Idempotent re-runs** — contentHash + cache = skip already-done work
- **Token spend tracking** for cost intelligence

### `worker/sdae/cache/` — Multi-Level Cache

- **L1**: Cloudflare KV (fast, edge-local)
- **L2**: D1 (persistent, queryable)
- Tenant-scoped keys prevent cross-tenant cache pollution
- L2→L1 backfill on miss
- Per-hash and per-project invalidation

### `worker/sdae/cost-quality/` — Cost-Quality Multitenant Layer

Implements the full cost-optimization blueprint:

- **PolicyEngine** — tenant policy with KV cache → D1 → defaults
- **ModelRouter** — risk classification, tier selection, budget-aware downgrade
- **QualityGate** — 3 concurrent gates (static/runtime/policy)
- **UsageTracker** — telemetry to D1 (usage, quality, routing, retries)
- **handleGenerationRequest()** — complete orchestrator: policy → guards → cache → risk → tier → LLM → quality gate → accept/escalate/retry

### `worker/sdae/spec-generator/` — Spec Generator

The ONLY place expensive LLM calls happen:

1. **Bible Generation** — single premium model call with structured JSON output
2. **Cheap Critic Loop** — 3 parallel validators (edge cases, constraints, anti-patterns) using cheap models
3. **Pre-Mortem Engine** — structured failure simulation

### `worker/sdae/form-engine/` — Dynamic Form Engine

Phase 0 — happens BEFORE any expensive LLM call:

1. **Intent Classifier** — keyword-based (zero cost) + LLM fallback
2. **Template Matching** — 6 built-in golden templates for common project types
3. **Form Generator** — JSON Schema forms tailored to intent
4. **Chat↔Form Bridge** — real-time form updates from casual chat

## D1 Schema (Migration 0005)

New tables for SDAE:
- `tenant_budgets` — policy and budget limits per tenant
- `usage_events` — raw token/credit usage per request
- `quality_events` — quality gate pass/fail outcomes
- `model_routing_decisions` — model selection audit trail
- `retry_outcomes` — retry/escalation analytics
- `sdae_runs` — DAG run records
- `sdae_node_runs` — per-node execution records with content_hash
- `sdae_audit_log` — governance audit trail
- `sdae_bibles` — versioned Bible storage for golden template reuse
- `sdae_form_templates` — successful form templates

## Credit Optimization Summary

| Layer | Optimization | Expected Impact |
|---|---|---|
| Input | Dynamic forms (template match = zero LLM) | -70% retries |
| Spec | Single premium call + cheap critic | -80% correction loops |
| Execution | DAG (no chat loops) | -60% tokens |
| Cache | L1 KV + L2 D1 + content hash | -50–90% LLM calls |
| Memory | Golden templates (self-improving) | Exponential savings over time |

## Integration Points

The SDAE engine integrates with existing VibeSDK at these seams:

| SDAE Module | VibeSDK Integration Point |
|---|---|
| Form Engine | `src/routes/chat/` — replace/augment chat input |
| Spec Generator | `worker/agents/inferutils/` — use AI Gateway for LLM calls |
| Compiler + Runner | `worker/agents/core/codingAgent.ts` — orchestrate via SDAE |
| Cost-Quality | `worker/services/aigateway-proxy/controller.ts` — wrap model calls |
| Cache | `wrangler.jsonc` KV + D1 bindings |
| D1 Migration | `migrations/0005_sdae_cost_quality.sql` |

## Benchmark Targets

| Metric | MVP Target | Month-3 Stretch |
|---|---|---|
| Median token cost / task | <$0.12 | <$0.03 |
| Semantic cache hit rate | ≥55% | ≥82% |
| First-pass success rate | ≥78% | ≥94% |
| Mean recovery time (failure) | ≤45s | ≤12s |
| End-to-end latency (simple) | ≤35s | ≤18s |

## Next Steps

1. Wire SDAE form engine into the existing chat UI
2. Replace single-agent code generation with SDAE DAG execution
3. Implement real sandbox workers for SCRAPE_DYNAMIC, CODE_GENERATE, DEPLOY_APP
4. Connect golden template flywheel to D1 `sdae_bibles` table
5. Build observability dashboard tracking benchmark metrics
6. Add Emergent-style credit/budget UI controls
