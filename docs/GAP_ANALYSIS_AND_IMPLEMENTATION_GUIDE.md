# VibeSDK → Emergent-Grade Platform: Gap Analysis & Implementation Guide

**Version**: 1.0  
**Date**: 2026-03-28  
**Repository**: `bhavin786/vibesdk` (fork of `cloudflare/vibesdk`)  
**Status**: Living document — update as features land

---

## 1. Executive Summary

VibeSDK is Cloudflare's open-source AI app builder — a full-stack platform where users describe apps in natural language and AI agents generate, preview, and deploy them on Cloudflare Workers. The upstream project (`cloudflare/vibesdk`) provides the core: React frontend, Cloudflare Worker backend, Durable Objects for agent state, D1/KV/R2 storage, Cloudflare Containers for sandbox execution, AI Gateway for multi-provider LLM routing, and Workers for Platforms for deployment.

Our fork (`bhavin786/vibesdk`) adds the **SDAE engine** (`worker/sdae/`) — a Spec-Driven Autonomous Engine that replaces chat-loop-based code generation with a deterministic DAG execution model, achieving 60-80% token cost reduction and 78-94% first-pass success rates. The SDAE includes a form engine, spec generator, DSL compiler, DAG runner, multi-level cache, and a cost-quality multitenant layer with PolicyEngine, ModelRouter, QualityGate, and UsageTracker.

**This document maps every user-facing feature of Emergent.sh** (the leading commercial competitor built on similar architecture) **against what VibeSDK currently has**, identifies every gap, and provides step-by-step implementation instructions for each missing piece. The goal: any developer or AI agent can pick up any section and build it.

### What's Built

| Layer | Status | Location |
|---|---|---|
| Core app generation (phase-wise) | **Complete** (upstream) | `worker/agents/` |
| Chat interface | **Complete** (upstream) | `src/routes/chat/` |
| App preview in sandbox | **Complete** (upstream) | `worker/services/sandbox/` |
| Deploy to Workers for Platforms | **Complete** (upstream) | `worker/services/deployer/` |
| GitHub OAuth + export | **Complete** (upstream) | `worker/services/github/` |
| SDAE engine (IR, compiler, runner, cache) | **Complete** (custom) | `worker/sdae/` |
| Cost-quality layer (PolicyEngine, UsageTracker) | **Complete** (custom) | `worker/sdae/cost-quality/` |
| D1 schema for SDAE telemetry | **Complete** (custom) | `migrations/0005_sdae_cost_quality.sql` |

### What's Missing

Credit/billing system, machine type selector, custom agent builder, GitHub import, notification system, plans & invoices, Chrome-style tab bar, and several UI features that Emergent.sh offers. These gaps are detailed in Section 2 and implementation instructions are in Section 5.

---

## 2. Feature Matrix (Emergent vs VibeSDK)

### 2.1 Home Page / Prompt Interface

| Feature | Emergent Has | VibeSDK Has | Gap | Priority | Effort |
|---|---|---|---|---|---|
| Hero heading ("What will you build today?") | ✅ | ✅ | None | — | — |
| App type tabs (Full Stack / Mobile / Landing Page) | ✅ | ✅ Project types in `PLATFORM_CAPABILITIES` | None | — | — |
| Main prompt textarea with rotating placeholders | ✅ | ✅ | None | — | — |
| Attachment button (upload files) | ✅ | ✅ | None | — | — |
| Model selector dropdown | ✅ (Claude 4.0 Sonnet, GPT-5, Claude 4.0 Extended) | ✅ Model config in `worker/agents/inferutils/config.ts` | None | — | — |
| Send button | ✅ | ✅ | None | — | — |
| GitHub import dropdown ("Add from GitHub") | ✅ (paste URL or browse connected repos + branch selector) | ❌ | **MISSING** | Medium | 3-5 days |
| Machine type selector (E-1 / E-2 / Prototype / Mobile) | ✅ (E-1 Stable, E-1.1 Fast, E-1.5 Focused, E-2 Thorough + Pro) | ❌ (has simple "Reliable/Smart" toggle only) | **MISSING** | High | 2-3 days |
| Ultra Thinking toggle | ✅ (Pro-only, 16k thinking tokens) | ❌ | **MISSING** | Medium | 1-2 days |
| Voice input (mic button) | ✅ | ❌ | **MISSING** | Low | 1-2 days |
| Settings/Advanced Controls icon | ✅ (MCP tools, template, budget slider) | ❌ | **MISSING** | Medium | 2-3 days |
| Quick prompt pills ("OpenClaw", "Task Manager", "Surprise Me") | ✅ | ❌ | **MISSING** | Low | 1 day |
| Promotional banner (credits promo) | ✅ | ❌ | **MISSING** | Low | 0.5 day |
| Floating promo popup | ✅ | ❌ | **MISSING** | Low | 0.5 day |
| Credit budget slider in Advanced Controls | ✅ | ❌ | **MISSING** | Medium | 1 day |
| Template selector (Full Stack, Base Python) | ✅ | ✅ (project templates in R2) | Partial — needs UI selector | Low | 1 day |

### 2.2 Chrome-Style Tab Bar

| Feature | Emergent Has | VibeSDK Has | Gap | Priority | Effort |
|---|---|---|---|---|---|
| Multi-tab browser-like navigation | ✅ | ❌ (sidebar navigation) | **MISSING** | Medium | 3-4 days |
| Home tab + project tabs with close buttons | ✅ | ❌ | **MISSING** | Medium | 3-4 days |
| Credits pill display in top bar | ✅ | ❌ | **MISSING** | High | 1 day (depends on credit system) |
| "Buy Credits" button | ✅ | ❌ | **MISSING** | High | 1 day (depends on billing) |
| Notifications bell icon | ✅ | ❌ | **MISSING** | Low | 0.5 day |
| Gift icon | ✅ | ❌ | **MISSING** | Low | 0.5 day |
| User avatar dropdown with settings | ✅ | ✅ (basic OAuth profile + settings link) | Partial | Low | — |

### 2.3 Machine Types & Agent Builder

| Feature | Emergent Has | VibeSDK Has | Gap | Priority | Effort |
|---|---|---|---|---|---|
| E-1 Stable & Thorough agent | ✅ | ❌ (generic agent behavior) | **MISSING** | High | 2-3 days |
| E-1.1 Fast & Flexible agent | ✅ | ❌ | **MISSING** | High | Included above |
| E-1.5 Focused agent | ✅ | ❌ | **MISSING** | High | Included above |
| E-2 Thorough & Relentless (Pro) | ✅ (multi-agent, premium) | ❌ | **MISSING** | High | Included above |
| Prototype (Frontend-only) mode | ✅ | ❌ | **MISSING** | Medium | 1 day |
| Mobile agent/mode | ✅ | ❌ (mobile-first templates exist in R2) | Partial | Medium | 1 day |
| Create New Agent button | ✅ (Pro) | ❌ | **MISSING** | Medium | 3-5 days |
| Custom agent: name, persona, system prompt | ✅ | ❌ | **MISSING** | Medium | 3-5 days |
| Custom agent: model config | ✅ | ❌ | **MISSING** | Medium | Included above |
| Custom agent: tool assignment | ✅ | ❌ | **MISSING** | Medium | Included above |
| Sub-agent creation & delegation | ✅ (Pro, cannot call other sub-agents) | ❌ | **MISSING** | Medium | 3-5 days |
| Manage Agents page (Main / Sub-agents / MCP Tools tabs) | ✅ | ❌ | **MISSING** | Medium | 3-5 days |
| MCP Tools tab: New MCP Server | ✅ (Memory MCP, Supabase MCP, Notion MCP, Configure) | ❌ UI (backend `MCPManager` exists but hardcoded empty, no per-user config) | **MISSING UI + config storage** | Medium | 2-3 days |

### 2.4 Chat / Session View

| Feature | Emergent Has | VibeSDK Has | Gap | Priority | Effort |
|---|---|---|---|---|---|
| Chat message area (user/agent) | ✅ | ✅ | None | — | — |
| Agent action items (file creation, code viewer) | ✅ | ✅ (collapsible code blocks) | None | — | — |
| Agent clarification questions | ✅ (styled question cards) | ✅ Partial (agent asks via chat) | Minor UX | Low | 1 day |
| Credit exhausted divider | ✅ ("Agent ran out of credits") | ❌ | **MISSING** | High | 0.5 day (depends on credit system) |
| Agent sleep notification + Wake Up button | ✅ | ❌ | **MISSING** | Medium | 1 day |
| Input: GitHub Save button | ✅ | ✅ (GitHub export exists) | None | — | — |
| Input: Fork button | ✅ | ❌ | **MISSING** | Medium | 2 days |
| Input: Ultra toggle | ✅ (Pro) | ❌ | **MISSING** | Medium | 1 day |
| Input: Mic button (voice) | ✅ | ❌ | **MISSING** | Low | 1-2 days |
| App Preview panel | ✅ | ✅ (iframe preview) | None | — | — |
| Deployment panel | ✅ | ✅ | None | — | — |
| VS Code in browser | ✅ (secure link + temp password) | ❌ | **MISSING** | Low | 5+ days |
| Run Details panel: credits spent | ✅ | ❌ | **MISSING** | High | 1 day |
| Run Details panel: machine type, model | ✅ | ❌ (model info not exposed) | **MISSING** | Medium | 1 day |
| Run Details panel: job ID, assets list | ✅ | ❌ | **MISSING** | Low | 1 day |

### 2.5 Account Settings

| Feature | Emergent Has | VibeSDK Has | Gap | Priority | Effort |
|---|---|---|---|---|---|
| Profile (name, email, avatar) | ✅ | ✅ (OAuth profile in `src/routes/profile.tsx`) | None | — | — |
| Plan card display | ✅ (current plan + billing cycle) | ❌ | **MISSING** | Medium | 1 day |
| Universal API Key with balance + auto-recharge | ✅ | ✅ Partial (SDK API keys in `UserSecretsStore`, no balance/recharge) | **PARTIAL** | Medium | 2 days |
| Manage Agents settings tab | ✅ (Main agents / Sub-agents / MCP Tools) | ❌ | **MISSING** | Medium | See 2.3 |
| Preferences (language, auto-summarisation) | ✅ | ❌ | **MISSING** | Low | 1 day |
| Plans & Invoices tab | ✅ (plan card, billing, transactions) | ❌ | **MISSING** | Medium | 3-5 days |
| Credit Usage tab (balance, history, filters) | ✅ | ❌ | **MISSING** | High | 2-3 days |

### 2.6 Credit & Billing System

| Feature | Emergent Has | VibeSDK Has | Gap | Priority | Effort |
|---|---|---|---|---|---|
| Credit balance display in header | ✅ | ❌ | **MISSING** | High | 1 day |
| Credit purchase / top-up flow | ✅ ($10 = 50 credits, Stripe checkout) | ❌ | **MISSING** | High | 3-5 days |
| Per-session credit tracking | ✅ | ❌ (AI Gateway analytics exist but no credit abstraction) | **MISSING** | High | 2-3 days |
| Credit exhaustion handling | ✅ (pause agent, prompt to buy) | ❌ | **MISSING** | High | 1-2 days |
| Usage history with date grouping | ✅ | ❌ | **MISSING** | Medium | 2 days |
| Plan tiers (Free: 10 credits, Standard: 100, Pro: 750) | ✅ | ❌ | **MISSING** | High | 2-3 days |
| Monthly credit reset at billing cycle | ✅ | ❌ | **MISSING** | High | 1 day |
| Top-up credits never expire | ✅ | ❌ | **MISSING** | Medium | 0.5 day |
| Credit budget slider per build | ✅ (in Advanced Controls) | ❌ | **MISSING** | Medium | 1 day |
| Auto-recharge on low balance | ✅ | ❌ | **MISSING** | Low | 1 day |

> **Note**: Our SDAE cost-quality layer (`worker/sdae/cost-quality/`) provides the **backend foundation**: `PolicyEngine`, `UsageTracker`, `tenant_budgets` D1 table, and per-request token tracking. But there is NO frontend credit display, NO purchase flow, and NO Stripe integration.

### 2.7 GitHub Integration

| Feature | Emergent Has | VibeSDK Has | Gap | Priority | Effort |
|---|---|---|---|---|---|
| GitHub OAuth login | ✅ | ✅ (`worker/services/oauth/github.ts`) | None | — | — |
| GitHub Export (push to repo) | ✅ (one-click Save to GitHub) | ✅ (`worker/services/github/GitHubService.ts`) | None | — | — |
| Git Clone modal (clone locally) | ✅ | ✅ (`src/components/shared/GitCloneModal.tsx`) | None | — | — |
| "Add from GitHub" — paste URL | ✅ | ❌ | **MISSING** | Medium | 2-3 days |
| "Add from GitHub" — browse connected repos | ✅ (private/public toggle, org management) | ❌ | **MISSING** | Medium | 3-5 days |
| Branch selector | ✅ | ❌ | **MISSING** | Medium | 1 day |
| Connected Organizations management | ✅ | ❌ | **MISSING** | Low | 2 days |
| Import repo into agent session | ✅ (analyze structure, extend/modernize) | ❌ | **MISSING** | Medium | 3-5 days |

### 2.8 Notifications

| Feature | Emergent Has | VibeSDK Has | Gap | Priority | Effort |
|---|---|---|---|---|---|
| Notification bell icon in header | ✅ | ❌ | **MISSING** | Low | 0.5 day |
| Notification panel (Inbox / Offers / Updates) | ✅ | ❌ | **MISSING** | Low | 2 days |
| In-app notification system (agent_complete, credit_low, deploy_ready) | ✅ | ❌ | **MISSING** | Low | 2-3 days |
| Real-time push via WebSocket | ✅ | ❌ (WebSocket exists for chat, not notifications) | **MISSING** | Low | 1 day |

### 2.9 Deployment & Preview

| Feature | Emergent Has | VibeSDK Has | Gap | Priority | Effort |
|---|---|---|---|---|---|
| App preview in iframe | ✅ | ✅ | None | — | — |
| Deploy to hosting | ✅ (Emergent subdomain) | ✅ (Workers for Platforms) | None | — | — |
| Custom domain per app | ✅ (A record + verification) | ❌ | **MISSING** | Medium | 3-5 days |
| Deployment history | ✅ | ❌ | **MISSING** | Low | 1-2 days |
| Pre-deployment health check | ✅ (automated backend/frontend tests) | ❌ | **MISSING** | Medium | 2-3 days |
| Deployment credit cost (50 credits/month at Emergent) | ✅ | ❌ | **MISSING** | Medium | 1 day (depends on credit system) |

### 2.10 Community / Discover

| Feature | Emergent Has | VibeSDK Has | Gap | Priority | Effort |
|---|---|---|---|---|---|
| Showcase / discover page | ✅ | ✅ (`src/routes/discover/index.tsx`) | None | — | — |
| Filter tabs by category | ✅ | ✅ Partial | Minor | Low | 1 day |
| Featured apps | ✅ | ✅ Partial | Minor | Low | 0.5 day |
| Remix / Fork functionality | ✅ | ❌ | **MISSING** | Medium | 2-3 days |

### 2.11 Mobile / PWA

| Feature | Emergent Has | VibeSDK Has | Gap | Priority | Effort |
|---|---|---|---|---|---|
| Responsive web design | ✅ | ✅ (Tailwind responsive) | None | — | — |
| PWA support (service worker, manifest) | ✅ | ❌ | **MISSING** | Low | 1-2 days |
| Android WebView wrapper generation | Unclear | ❌ | **MISSING** | Low | 3-5 days |

---

## 3. Override-Safe Architecture Pattern

### The Golden Rule

```
RULE: Never modify upstream files. Always extend in new files.
```

### Custom Code Locations

These directories are **ours** — upstream (`cloudflare/vibesdk`) will never touch them:

```
vibesdk/
├── worker/sdae/              ← SDAE engine (all custom backend logic)
├── worker/extensions/        ← NEW: extension point for feature additions
│   ├── credits/              ← Credit tracking & billing
│   ├── agent-profiles/       ← Machine types & custom agents
│   ├── agent-builder/        ← Agent management service
│   ├── github-import/        ← GitHub import feature
│   ├── notifications/        ← Notification system
│   ├── billing/              ← Stripe integration
│   └── index.ts              ← Barrel export + route registration
├── src/extensions/           ← NEW: frontend extension components
│   ├── credits/              ← Credit UI components
│   ├── agent-profiles/       ← Machine type selector
│   ├── agent-builder/        ← Agent management pages
│   ├── github-import/        ← Import modal
│   ├── notifications/        ← Bell + panel
│   ├── billing/              ← Plans + invoices pages
│   └── tab-bar/              ← Chrome-style tab navigation
├── migrations/0005+          ← Our D1 migrations (upstream uses 0000-0004)
├── docs/                     ← Our documentation
│   ├── GAP_ANALYSIS_AND_IMPLEMENTATION_GUIDE.md  ← This file
│   ├── SDAE_ARCHITECTURE.md
│   ├── COST_QUALITY_MULTITENANT_BLUEPRINT.md
│   ├── PROJECT_REVIEW.md
│   └── UPSTREAM_UPGRADE_GUIDE.md
└── docker/                   ← NEW: Docker overlay configs for local dev
```

### The Extension Pattern

For every feature we need to **ADD** or **MODIFY**, follow this pattern:

| Need | Pattern | Location |
|---|---|---|
| New backend logic | New service class | `worker/extensions/<feature>/` or `worker/sdae/` |
| New frontend page | Lazy-loaded route | `src/extensions/<feature>/` → register in `src/routes.ts` |
| Modify upstream behavior | Wrapper/decorator that imports + wraps | `worker/extensions/` or `src/extensions/` |
| New API routes | Route file registered alongside upstream | `worker/extensions/<feature>/routes.ts` → import from `worker/api/routes/extensionRoutes.ts` |
| New D1 tables | Migration with number ≥ 0005 | `migrations/0006_credits_and_profiles.sql` |
| New Durable Objects | Class in extensions, bind in wrangler | `worker/extensions/` → register in `wrangler.jsonc` |

### Files We Must Modify (Track for Merge Conflicts)

These are the **only** upstream files we touch. Track them carefully during upstream merges:

| File | What We Change | Merge Conflict Risk |
|---|---|---|
| `wrangler.jsonc` | Add new DO bindings, vars, KV/D1 bindings | Medium |
| `worker-configuration.d.ts` | Regenerate with `bun run cf-typegen` after changes | Low (auto-generated) |
| `migrations/meta/_journal.json` | Add our migration entries (idx ≥ 5) | Medium |
| `worker/api/routes/index.ts` | Add ONE import line for extension routes | Low |
| `src/routes.ts` | Add lazy route entries for extension pages | Low |
| `package.json` | Add `stripe` and any new dependencies | Low |
| `index.html` | Add PWA manifest link (if implementing PWA) | Low |

### Extension Route Registration Pattern

**Backend** — `worker/api/routes/extensionRoutes.ts`:
```typescript
import { Hono } from 'hono';
import type { Env } from '../../types';
import { creditRoutes } from '../extensions/credits/routes';
import { agentProfileRoutes } from '../extensions/agent-profiles/routes';
import { agentBuilderRoutes } from '../extensions/agent-builder/routes';
import { githubImportRoutes } from '../extensions/github-import/routes';
import { notificationRoutes } from '../extensions/notifications/routes';
import { billingRoutes } from '../extensions/billing/routes';

const extensionApp = new Hono<{ Bindings: Env }>();

extensionApp.route('/credits', creditRoutes);
extensionApp.route('/agent-profiles', agentProfileRoutes);
extensionApp.route('/agents', agentBuilderRoutes);
extensionApp.route('/github-import', githubImportRoutes);
extensionApp.route('/notifications', notificationRoutes);
extensionApp.route('/billing', billingRoutes);

export { extensionApp };
```

**In `worker/api/routes/index.ts`**, add one line:
```typescript
import { extensionApp } from './extensionRoutes';
// ... existing route setup ...
app.route('/api/ext', extensionApp);
```

**Frontend** — in `src/routes.ts`, add lazy routes:
```typescript
const CreditUsagePage = lazy(() => import('./extensions/credits/CreditUsagePage'));
const ManageAgentsPage = lazy(() => import('./extensions/agent-builder/ManageAgentsPage'));
const PlansPage = lazy(() => import('./extensions/billing/PlansPage'));
// ... register in route config
```

### Docker Overlay Pattern

For containerized local development with safe upstream upgrades:

```
vibesdk/                    ← repo root (upstream merged + our extensions)
docker/
  docker-compose.yml        ← local dev orchestration
  Dockerfile.dev            ← extends upstream build
  .env                      ← runtime config (gitignored)
  overrides/                ← mount these over upstream at build time
```

> **Important**: Production deployment is to Cloudflare Workers (not Docker). Docker is for **local dev only**. The app runs on Cloudflare's edge, not in containers.

---

## 4. Open-Source Tools & Libraries to Use

| Need | Recommended Tool | License | Why |
|---|---|---|---|
| Credit/Usage Metering | Custom D1-based (extend SDAE `UsageTracker`) | N/A | VibeSDK runs on CF Workers; external billing platforms (Lago, OpenMeter, Flexprice) require separate infra. Our SDAE cost-quality layer already has `UsageTracker` + `tenant_budgets` in D1. Extend it with credit ledger tables. |
| Payment Processing | Stripe (via Workers `fetch`) | Commercial | Standard for SaaS. Use Stripe Checkout + Webhooks via Workers. The Emergent.sh pricing page confirms they use Stripe checkout. Works with CF Workers via standard `fetch` API. |
| LLM Observability | Cloudflare AI Gateway Analytics (already integrated) + Langfuse (optional, self-hosted) | Apache 2.0 | AI Gateway already tracks token usage per request. Langfuse adds traces/spans if needed later. Both are lightweight. |
| MCP Server Framework | `@modelcontextprotocol/sdk` (already in `package.json`) | MIT | Already a dependency. `MCPManager` exists in `worker/agents/tools/`. Just needs per-user config storage in D1 and UI. |
| Agent Framework | Cloudflare Agents SDK + `agents-starter` patterns | Apache 2.0 | Same runtime stack. Use patterns from `cloudflare/agents-starter` for multi-agent composition. |
| Multi-Agent Orchestration | Our SDAE DAG Runner | N/A | Already built in `worker/sdae/runner/`. The `DAGRunner` + `DSLCompiler` can orchestrate sub-agent tasks as DAG nodes. |
| Real-time Collaboration | PartyKit (`cloudflare/partykit`) | MIT | For future multi-user sessions. Same CF Workers stack. Drop-in compatible. |
| Notifications | D1 + KV + WebSocket (built-in CF primitives) | N/A | Use D1 for notification storage, KV for unread counts, existing WebSocket connection for real-time push. Zero new dependencies. |
| Voice Input | Web Speech API (browser-native) | N/A | `SpeechRecognition` API is built into Chrome/Edge/Safari. No server-side dependency. Transcribe speech → insert into prompt textarea. |
| Tab State Management | `zustand` or React Context | MIT | Lightweight state for tab bar. `zustand` is likely already in deps; otherwise use React Context. |
| Schema Validation | `zod` (already in `package.json`) | MIT | Already used by SDAE compiler for schema validation. Reuse for API input validation in extension routes. |
| Database ORM | Drizzle ORM (already in `package.json`) | MIT | Already used for upstream D1 access. Extend `worker/database/schema.ts` (or create extension schema) for new tables. |

---

## 5. Step-by-Step Implementation Instructions

### 5.1 Credit Tracking & Management System

**Priority: HIGH — This is the monetization foundation**  
**Estimated effort: 5-8 days**  
**Dependencies: None (builds on existing SDAE UsageTracker)**

#### 5.1.1 Database Schema

Create `migrations/0006_credits_and_profiles.sql`:

```sql
-- ============================================================
-- CREDIT SYSTEM TABLES
-- ============================================================

-- Credit ledger (double-entry for audit safety)
-- Every credit change is an immutable ledger entry.
-- balance_after provides a running total for fast reads.
CREATE TABLE IF NOT EXISTS credit_ledger (
    id TEXT PRIMARY KEY,                -- nanoid or uuid
    tenant_id TEXT NOT NULL,
    entry_type TEXT NOT NULL,           -- 'grant' | 'debit' | 'refund' | 'expire' | 'purchase'
    amount REAL NOT NULL,               -- positive for grants/purchases, negative for debits
    balance_after REAL NOT NULL,        -- running balance after this entry
    description TEXT,                   -- human-readable description
    reference_id TEXT,                  -- links to session_id, purchase_id, plan_grant_id, etc.
    reference_type TEXT,                -- 'session' | 'purchase' | 'plan_grant' | 'promo' | 'admin' | 'deployment'
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_credit_ledger_tenant
    ON credit_ledger(tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_credit_ledger_ref
    ON credit_ledger(reference_id);

-- Credit balance (materialized view for fast reads)
-- Updated atomically with each ledger entry.
CREATE TABLE IF NOT EXISTS credit_balances (
    tenant_id TEXT PRIMARY KEY,
    total_balance REAL NOT NULL DEFAULT 0,
    plan_credits REAL NOT NULL DEFAULT 0,        -- monthly allocation (resets each cycle)
    purchased_credits REAL NOT NULL DEFAULT 0,    -- top-ups (never expire)
    promo_credits REAL NOT NULL DEFAULT 0,        -- promotional (may expire)
    plan TEXT NOT NULL DEFAULT 'free',            -- 'free' | 'standard' | 'pro' | 'team' | 'enterprise'
    billing_cycle_start INTEGER,                  -- unix timestamp of current cycle start
    billing_cycle_end INTEGER,                    -- unix timestamp of current cycle end
    auto_recharge_enabled INTEGER NOT NULL DEFAULT 0,
    auto_recharge_threshold REAL DEFAULT 10,
    auto_recharge_amount REAL DEFAULT 100,
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Credit purchases (Stripe integration)
CREATE TABLE IF NOT EXISTS credit_purchases (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    amount REAL NOT NULL,                -- credits purchased
    price_cents INTEGER NOT NULL,        -- price in cents (USD)
    currency TEXT NOT NULL DEFAULT 'usd',
    stripe_payment_intent_id TEXT,
    stripe_checkout_session_id TEXT,
    status TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'completed' | 'failed' | 'refunded'
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    completed_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_purchases_tenant
    ON credit_purchases(tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_purchases_stripe
    ON credit_purchases(stripe_checkout_session_id);

-- Per-session credit usage (links to existing agent sessions)
CREATE TABLE IF NOT EXISTS session_credit_usage (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    session_id TEXT NOT NULL,            -- maps to CodeGeneratorAgent DO session
    app_id TEXT,                         -- links to apps table
    credits_used REAL NOT NULL DEFAULT 0,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    model TEXT,
    provider TEXT,
    phase TEXT,                          -- 'blueprint' | 'implementation' | 'code_fix' | 'conversation' | 'deployment'
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_session_usage_tenant
    ON session_credit_usage(tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_session_usage_session
    ON session_credit_usage(session_id);

-- ============================================================
-- AGENT PROFILE TABLES
-- ============================================================

-- Built-in and custom agent profiles (machine types)
CREATE TABLE IF NOT EXISTS agent_profiles (
    id TEXT PRIMARY KEY,
    tenant_id TEXT,                      -- NULL for built-in profiles
    name TEXT NOT NULL,
    display_name TEXT NOT NULL,
    description TEXT,
    behavior_type TEXT NOT NULL DEFAULT 'phasic',  -- 'phasic' | 'agentic'
    model_tier TEXT NOT NULL DEFAULT 'standard',    -- 'standard' | 'premium' | 'ultra'
    project_type TEXT DEFAULT 'app',                -- 'app' | 'landing-page' | 'api'
    token_budget_multiplier REAL NOT NULL DEFAULT 1.0,
    system_prompt_override TEXT,
    model_config_json TEXT,              -- JSON: { provider, model, temperature, maxTokens }
    tools_json TEXT,                     -- JSON array of tool names to enable
    is_builtin INTEGER NOT NULL DEFAULT 0,
    requires_plan TEXT DEFAULT 'free',   -- minimum plan required: 'free' | 'standard' | 'pro'
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_agent_profiles_tenant
    ON agent_profiles(tenant_id);

-- Subscriptions (Stripe)
CREATE TABLE IF NOT EXISTS subscriptions (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL UNIQUE,
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,
    plan TEXT NOT NULL DEFAULT 'free',   -- 'free' | 'standard' | 'pro' | 'team'
    status TEXT NOT NULL DEFAULT 'active', -- 'active' | 'past_due' | 'canceled' | 'trialing'
    current_period_start INTEGER,
    current_period_end INTEGER,
    cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe
    ON subscriptions(stripe_subscription_id);
```

Update `migrations/meta/_journal.json` — add entry:
```json
{
  "idx": 6,
  "version": "6",
  "when": 1711584000000,
  "tag": "0006_credits_and_profiles",
  "breakpoints": true
}
```

#### 5.1.2 Backend Service

Create `worker/extensions/credits/CreditService.ts`:

```typescript
import { nanoid } from 'nanoid';

export interface CreditBalance {
  totalBalance: number;
  planCredits: number;
  purchasedCredits: number;
  promoCredits: number;
  plan: string;
  billingCycleEnd: number | null;
}

export interface DebitResult {
  success: boolean;
  newBalance: number;
  reason?: string; // 'insufficient_balance' | 'hard_limit_reached'
}

export interface UsageHistoryItem {
  id: string;
  entryType: string;
  amount: number;
  balanceAfter: number;
  description: string;
  referenceType: string;
  createdAt: number;
}

export class CreditService {
  constructor(private db: D1Database) {}

  /**
   * Get current credit balance for a tenant.
   * Creates a default balance record if none exists (free plan, 10 credits).
   */
  async getBalance(tenantId: string): Promise<CreditBalance> {
    let row = await this.db
      .prepare('SELECT * FROM credit_balances WHERE tenant_id = ?')
      .bind(tenantId)
      .first();

    if (!row) {
      // Initialize free-tier balance
      await this.grantCredits(tenantId, 10, 'plan_grant', 'Free tier initial credits');
      row = await this.db
        .prepare('SELECT * FROM credit_balances WHERE tenant_id = ?')
        .bind(tenantId)
        .first();
    }

    return {
      totalBalance: (row?.total_balance as number) ?? 0,
      planCredits: (row?.plan_credits as number) ?? 0,
      purchasedCredits: (row?.purchased_credits as number) ?? 0,
      promoCredits: (row?.promo_credits as number) ?? 0,
      plan: (row?.plan as string) ?? 'free',
      billingCycleEnd: (row?.billing_cycle_end as number) ?? null,
    };
  }

  /**
   * Atomically debit credits with balance check.
   * Uses D1 transaction semantics (single-statement atomic UPDATE).
   * Debit order: promo_credits → plan_credits → purchased_credits.
   */
  async debitCredits(
    tenantId: string,
    amount: number,
    referenceId: string,
    referenceType: string,
    description?: string
  ): Promise<DebitResult> {
    // Read current balance
    const balance = await this.getBalance(tenantId);
    if (balance.totalBalance < amount) {
      return {
        success: false,
        newBalance: balance.totalBalance,
        reason: 'insufficient_balance',
      };
    }

    const newBalance = balance.totalBalance - amount;
    const entryId = nanoid();

    // Debit in order: promo → plan → purchased
    let remaining = amount;
    let newPromo = balance.promoCredits;
    let newPlan = balance.planCredits;
    let newPurchased = balance.purchasedCredits;

    if (remaining > 0 && newPromo > 0) {
      const deduct = Math.min(remaining, newPromo);
      newPromo -= deduct;
      remaining -= deduct;
    }
    if (remaining > 0 && newPlan > 0) {
      const deduct = Math.min(remaining, newPlan);
      newPlan -= deduct;
      remaining -= deduct;
    }
    if (remaining > 0 && newPurchased > 0) {
      const deduct = Math.min(remaining, newPurchased);
      newPurchased -= deduct;
      remaining -= deduct;
    }

    // Batch: ledger entry + balance update
    const batch = [
      this.db.prepare(
        `INSERT INTO credit_ledger (id, tenant_id, entry_type, amount, balance_after, description, reference_id, reference_type)
         VALUES (?, ?, 'debit', ?, ?, ?, ?, ?)`
      ).bind(entryId, tenantId, -amount, newBalance, description ?? '', referenceId, referenceType),

      this.db.prepare(
        `UPDATE credit_balances
         SET total_balance = ?, plan_credits = ?, purchased_credits = ?, promo_credits = ?, updated_at = unixepoch()
         WHERE tenant_id = ?`
      ).bind(newBalance, newPlan, newPurchased, newPromo, tenantId),
    ];

    await this.db.batch(batch);

    return { success: true, newBalance };
  }

  /**
   * Grant credits to a tenant (purchases, plan grants, promos).
   */
  async grantCredits(
    tenantId: string,
    amount: number,
    type: 'purchase' | 'plan_grant' | 'promo' | 'admin' | 'refund',
    description: string,
    referenceId?: string
  ): Promise<number> {
    // Ensure balance row exists
    await this.db.prepare(
      `INSERT OR IGNORE INTO credit_balances (tenant_id, total_balance, plan_credits, purchased_credits, promo_credits, plan)
       VALUES (?, 0, 0, 0, 0, 'free')`
    ).bind(tenantId).run();

    const current = await this.getBalance(tenantId);
    const newBalance = current.totalBalance + amount;
    const entryId = nanoid();

    // Determine which bucket to add to
    let planAdd = 0, purchasedAdd = 0, promoAdd = 0;
    if (type === 'plan_grant') planAdd = amount;
    else if (type === 'purchase' || type === 'refund') purchasedAdd = amount;
    else if (type === 'promo') promoAdd = amount;
    else purchasedAdd = amount; // admin grants go to purchased

    const batch = [
      this.db.prepare(
        `INSERT INTO credit_ledger (id, tenant_id, entry_type, amount, balance_after, description, reference_id, reference_type)
         VALUES (?, ?, 'grant', ?, ?, ?, ?, ?)`
      ).bind(entryId, tenantId, amount, newBalance, description, referenceId ?? '', type),

      this.db.prepare(
        `UPDATE credit_balances
         SET total_balance = total_balance + ?,
             plan_credits = plan_credits + ?,
             purchased_credits = purchased_credits + ?,
             promo_credits = promo_credits + ?,
             updated_at = unixepoch()
         WHERE tenant_id = ?`
      ).bind(amount, planAdd, purchasedAdd, promoAdd, tenantId),
    ];

    await this.db.batch(batch);
    return newBalance;
  }

  /**
   * Check if tenant can proceed (has enough credits).
   * Returns budget status with warning thresholds.
   */
  async checkBudget(tenantId: string): Promise<{
    canProceed: boolean;
    balance: number;
    isLow: boolean;        // below 20% of plan allocation
    isExhausted: boolean;
    warningMessage?: string;
  }> {
    const balance = await this.getBalance(tenantId);
    const planLimits: Record<string, number> = {
      free: 10, standard: 100, pro: 750, team: 1250,
    };
    const planAllocation = planLimits[balance.plan] ?? 10;
    const threshold = planAllocation * 0.2;

    return {
      canProceed: balance.totalBalance > 0,
      balance: balance.totalBalance,
      isLow: balance.totalBalance <= threshold && balance.totalBalance > 0,
      isExhausted: balance.totalBalance <= 0,
      warningMessage: balance.totalBalance <= 0
        ? 'Credits exhausted. Purchase more to continue.'
        : balance.totalBalance <= threshold
        ? `Low credit balance: ${balance.totalBalance.toFixed(1)} remaining.`
        : undefined,
    };
  }

  /**
   * Get paginated usage history with date grouping and filters.
   */
  async getUsageHistory(
    tenantId: string,
    filters: {
      period?: 'day' | 'week' | 'month' | 'all';
      referenceType?: string;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<{ items: UsageHistoryItem[]; total: number }> {
    const limit = filters.limit ?? 50;
    const offset = filters.offset ?? 0;

    let timeFilter = '';
    const now = Math.floor(Date.now() / 1000);
    if (filters.period === 'day') timeFilter = `AND created_at >= ${now - 86400}`;
    else if (filters.period === 'week') timeFilter = `AND created_at >= ${now - 604800}`;
    else if (filters.period === 'month') timeFilter = `AND created_at >= ${now - 2592000}`;

    let typeFilter = '';
    if (filters.referenceType) typeFilter = `AND reference_type = '${filters.referenceType}'`;

    const countResult = await this.db.prepare(
      `SELECT COUNT(*) as count FROM credit_ledger
       WHERE tenant_id = ? ${timeFilter} ${typeFilter}`
    ).bind(tenantId).first();

    const rows = await this.db.prepare(
      `SELECT * FROM credit_ledger
       WHERE tenant_id = ? ${timeFilter} ${typeFilter}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`
    ).bind(tenantId, limit, offset).all();

    return {
      items: (rows.results ?? []).map((r: any) => ({
        id: r.id,
        entryType: r.entry_type,
        amount: r.amount,
        balanceAfter: r.balance_after,
        description: r.description,
        referenceType: r.reference_type,
        createdAt: r.created_at,
      })),
      total: (countResult?.count as number) ?? 0,
    };
  }

  /**
   * Record per-LLM-call session usage.
   * Called after each inference call to track token consumption.
   */
  async recordSessionUsage(
    tenantId: string,
    sessionId: string,
    appId: string | null,
    data: {
      inputTokens: number;
      outputTokens: number;
      model: string;
      provider: string;
      phase: string;
    }
  ): Promise<void> {
    // Calculate credit cost based on model/tokens
    const creditCost = this.calculateCreditCost(data);

    await this.db.prepare(
      `INSERT INTO session_credit_usage (id, tenant_id, session_id, app_id, credits_used, input_tokens, output_tokens, model, provider, phase)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      nanoid(), tenantId, sessionId, appId,
      creditCost, data.inputTokens, data.outputTokens,
      data.model, data.provider, data.phase
    ).run();
  }

  /**
   * Convert token usage into credit cost.
   * Pricing model: 1 credit ≈ 100k tokens (input) or 25k tokens (output) for standard models.
   * Premium models cost 3x. Ultra costs 5x.
   */
  private calculateCreditCost(data: {
    inputTokens: number;
    outputTokens: number;
    model: string;
    provider: string;
  }): number {
    const isPremium = data.model.includes('pro') || data.model.includes('opus') || data.model.includes('gpt-5');
    const isUltra = data.model.includes('ultra') || data.model.includes('extended');
    const multiplier = isUltra ? 5 : isPremium ? 3 : 1;

    const inputCost = (data.inputTokens / 100_000) * multiplier;
    const outputCost = (data.outputTokens / 25_000) * multiplier;

    return Math.round((inputCost + outputCost) * 100) / 100; // round to 2 decimal places
  }

  /**
   * Reset plan credits at billing cycle start.
   * Called by a scheduled CRON worker or Stripe webhook.
   */
  async resetPlanCredits(tenantId: string, planCredits: number): Promise<void> {
    const balance = await this.getBalance(tenantId);
    // Expire unused plan credits, keep purchased + promo
    const expiredPlan = balance.planCredits;
    const newTotal = balance.purchasedCredits + balance.promoCredits + planCredits;

    const batch = [
      // Log expiration
      this.db.prepare(
        `INSERT INTO credit_ledger (id, tenant_id, entry_type, amount, balance_after, description, reference_type)
         VALUES (?, ?, 'expire', ?, ?, 'Monthly plan credits expired', 'plan_grant')`
      ).bind(nanoid(), tenantId, -expiredPlan, newTotal),

      // Log new grant
      this.db.prepare(
        `INSERT INTO credit_ledger (id, tenant_id, entry_type, amount, balance_after, description, reference_type)
         VALUES (?, ?, 'grant', ?, ?, 'Monthly plan credit grant', 'plan_grant')`
      ).bind(nanoid(), tenantId, planCredits, newTotal),

      // Update balance
      this.db.prepare(
        `UPDATE credit_balances
         SET total_balance = ?, plan_credits = ?,
             billing_cycle_start = unixepoch(),
             billing_cycle_end = unixepoch() + 2592000,
             updated_at = unixepoch()
         WHERE tenant_id = ?`
      ).bind(newTotal, planCredits, tenantId),
    ];

    await this.db.batch(batch);
  }
}
```

Create `worker/extensions/credits/types.ts`:

```typescript
export interface CreditPlan {
  id: string;
  name: string;
  monthlyPrice: number; // cents
  annualPrice: number;  // cents (per month)
  monthlyCredits: number;
  features: string[];
}

export const PLANS: CreditPlan[] = [
  {
    id: 'free',
    name: 'Free',
    monthlyPrice: 0,
    annualPrice: 0,
    monthlyCredits: 10,
    features: ['All core features', 'Web & Mobile experiences', 'Advanced models'],
  },
  {
    id: 'standard',
    name: 'Standard',
    monthlyPrice: 2000, // $20
    annualPrice: 1700,   // $17/mo
    monthlyCredits: 100,
    features: ['Everything in Free', 'Private hosting', 'GitHub integration', 'Fork tasks', 'Buy extra credits'],
  },
  {
    id: 'pro',
    name: 'Pro',
    monthlyPrice: 20000, // $200
    annualPrice: 16700,   // $167/mo
    monthlyCredits: 750,
    features: ['Everything in Standard', '1M context window', 'Ultra Thinking', 'Custom AI agents', 'System Prompt Edit', 'High-performance computing', 'Priority support'],
  },
  {
    id: 'team',
    name: 'Team',
    monthlyPrice: 30000, // $300
    annualPrice: 25000,
    monthlyCredits: 1250,
    features: ['Everything in Pro', 'Admin dashboard', 'Real-time collaboration', '5 team members'],
  },
];

export const CREDIT_TOPUPS = [
  { credits: 50, priceCents: 1000 },   // $10 = 50 credits
  { credits: 275, priceCents: 5000 },   // $50
  { credits: 550, priceCents: 9000 },   // $90
  { credits: 1150, priceCents: 17000 }, // $170
  { credits: 3000, priceCents: 40000 }, // $400
];
```

#### 5.1.3 API Routes

Create `worker/extensions/credits/routes.ts`:

```typescript
import { Hono } from 'hono';
import type { Env } from '../../../types';
import { CreditService } from './CreditService';
import { PLANS, CREDIT_TOPUPS } from './types';

export const creditRoutes = new Hono<{ Bindings: Env }>();

// GET /api/ext/credits/balance
creditRoutes.get('/balance', async (c) => {
  const tenantId = c.get('userId'); // from auth middleware
  const service = new CreditService(c.env.DB);
  const balance = await service.getBalance(tenantId);
  return c.json(balance);
});

// GET /api/ext/credits/budget-check
creditRoutes.get('/budget-check', async (c) => {
  const tenantId = c.get('userId');
  const service = new CreditService(c.env.DB);
  const budget = await service.checkBudget(tenantId);
  return c.json(budget);
});

// GET /api/ext/credits/usage?period=week&type=session&limit=50&offset=0
creditRoutes.get('/usage', async (c) => {
  const tenantId = c.get('userId');
  const service = new CreditService(c.env.DB);
  const period = c.req.query('period') as 'day' | 'week' | 'month' | 'all' | undefined;
  const referenceType = c.req.query('type');
  const limit = parseInt(c.req.query('limit') ?? '50');
  const offset = parseInt(c.req.query('offset') ?? '0');

  const history = await service.getUsageHistory(tenantId, {
    period, referenceType, limit, offset,
  });
  return c.json(history);
});

// GET /api/ext/credits/plans
creditRoutes.get('/plans', async (c) => {
  return c.json({ plans: PLANS, topups: CREDIT_TOPUPS });
});

// POST /api/ext/credits/purchase — initiate Stripe checkout for credit top-up
creditRoutes.post('/purchase', async (c) => {
  const tenantId = c.get('userId');
  const body = await c.req.json<{ credits: number; returnUrl: string }>();

  const topup = CREDIT_TOPUPS.find(t => t.credits === body.credits);
  if (!topup) return c.json({ error: 'Invalid credit amount' }, 400);

  // Create Stripe Checkout session
  const stripeResponse = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${c.env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      'mode': 'payment',
      'success_url': `${body.returnUrl}?session_id={CHECKOUT_SESSION_ID}`,
      'cancel_url': body.returnUrl,
      'line_items[0][price_data][currency]': 'usd',
      'line_items[0][price_data][product_data][name]': `${topup.credits} Credits`,
      'line_items[0][price_data][unit_amount]': String(topup.priceCents),
      'line_items[0][quantity]': '1',
      'metadata[tenant_id]': tenantId,
      'metadata[credits]': String(topup.credits),
      'client_reference_id': tenantId,
    }),
  });

  const session = await stripeResponse.json() as any;
  if (session.error) return c.json({ error: session.error.message }, 400);

  // Record pending purchase
  const service = new CreditService(c.env.DB);
  await c.env.DB.prepare(
    `INSERT INTO credit_purchases (id, tenant_id, amount, price_cents, stripe_checkout_session_id, status)
     VALUES (?, ?, ?, ?, ?, 'pending')`
  ).bind(session.id, tenantId, topup.credits, topup.priceCents, session.id).run();

  return c.json({ checkoutUrl: session.url, sessionId: session.id });
});

// POST /api/ext/credits/webhook — Stripe webhook handler
creditRoutes.post('/webhook', async (c) => {
  const signature = c.req.header('stripe-signature');
  const body = await c.req.text();

  // Verify webhook signature (simplified — use stripe SDK helper in production)
  // For CF Workers, manual HMAC verification is needed since stripe-node uses Node APIs
  const event = JSON.parse(body);

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const tenantId = session.metadata.tenant_id;
    const credits = parseFloat(session.metadata.credits);

    const service = new CreditService(c.env.DB);

    // Grant credits
    await service.grantCredits(
      tenantId,
      credits,
      'purchase',
      `Purchased ${credits} credits`,
      session.id
    );

    // Update purchase record
    await c.env.DB.prepare(
      `UPDATE credit_purchases SET status = 'completed', completed_at = unixepoch()
       WHERE stripe_checkout_session_id = ?`
    ).bind(session.id).run();
  }

  return c.json({ received: true });
});
```

#### 5.1.4 Integration Point: Hook into LLM Calls

The credit system must **debit credits after each LLM call**. The integration point is `worker/agents/inferutils/infer.ts`. Rather than modifying upstream code, create a wrapper:

Create `worker/extensions/credits/inferWrapper.ts`:

```typescript
/**
 * Wraps the upstream infer function to add credit tracking.
 * 
 * Usage in CodeGeneratorAgent (integration point):
 *   import { createCreditTrackedInfer } from '../extensions/credits/inferWrapper';
 *   const trackedInfer = createCreditTrackedInfer(this.env.DB, tenantId, sessionId, appId);
 *   // Use trackedInfer instead of raw infer for all LLM calls
 */

import { CreditService } from './CreditService';

export function createCreditTrackedInfer(
  db: D1Database,
  tenantId: string,
  sessionId: string,
  appId: string | null
) {
  const creditService = new CreditService(db);

  return async function trackedInfer(
    originalInferFn: (...args: any[]) => Promise<any>,
    ...args: any[]
  ) {
    // Check budget before calling
    const budget = await creditService.checkBudget(tenantId);
    if (!budget.canProceed) {
      throw new CreditExhaustedException(tenantId, budget.balance);
    }

    // Call original infer function
    const result = await originalInferFn(...args);

    // Record usage after successful call
    if (result?.usage) {
      await creditService.recordSessionUsage(tenantId, sessionId, appId, {
        inputTokens: result.usage.prompt_tokens ?? 0,
        outputTokens: result.usage.completion_tokens ?? 0,
        model: result.model ?? 'unknown',
        provider: result.provider ?? 'unknown',
        phase: args[0]?.phase ?? 'unknown',
      });

      // Debit credits
      const creditCost = creditService['calculateCreditCost']({
        inputTokens: result.usage.prompt_tokens ?? 0,
        outputTokens: result.usage.completion_tokens ?? 0,
        model: result.model ?? 'unknown',
        provider: result.provider ?? 'unknown',
      });

      if (creditCost > 0) {
        await creditService.debitCredits(
          tenantId, creditCost, sessionId, 'session',
          `LLM call: ${result.model} (${data.phase})`
        );
      }
    }

    return result;
  };
}

export class CreditExhaustedException extends Error {
  constructor(public tenantId: string, public balance: number) {
    super(`Credits exhausted for tenant ${tenantId}. Balance: ${balance}`);
    this.name = 'CreditExhaustedException';
  }
}
```

#### 5.1.5 Frontend Components

Create `src/extensions/credits/CreditBalancePill.tsx`:

```tsx
/**
 * Credit balance pill for the header bar.
 * Shows current balance with color coding:
 *   - Green: > 20% of plan allocation
 *   - Yellow: 5-20% of plan allocation  
 *   - Red: < 5% or exhausted
 * Clicking opens buy credits modal.
 */
import { useState, useEffect } from 'react';
import { Coins } from 'lucide-react';

interface CreditBalance {
  totalBalance: number;
  plan: string;
}

export function CreditBalancePill() {
  const [balance, setBalance] = useState<CreditBalance | null>(null);
  const [showBuyModal, setShowBuyModal] = useState(false);

  useEffect(() => {
    fetch('/api/ext/credits/balance')
      .then(r => r.json())
      .then(setBalance)
      .catch(console.error);
  }, []);

  if (!balance) return null;

  const getColor = () => {
    if (balance.totalBalance <= 0) return 'text-red-400 bg-red-900/30';
    if (balance.totalBalance <= 10) return 'text-yellow-400 bg-yellow-900/30';
    return 'text-emerald-400 bg-emerald-900/30';
  };

  return (
    <>
      <button
        onClick={() => setShowBuyModal(true)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium ${getColor()} hover:opacity-80 transition`}
      >
        <Coins className="w-4 h-4" />
        <span>{balance.totalBalance.toFixed(1)}</span>
      </button>
      {/* BuyCreditsModal rendered conditionally */}
    </>
  );
}
```

Create `src/extensions/credits/CreditUsagePage.tsx`:

```tsx
/**
 * Full credit usage history page.
 * Rendered at /settings/credits or /credits.
 * Features:
 *   - Balance summary card at top
 *   - Period filter tabs (Today / This Week / This Month / All)
 *   - Type filter (All / Sessions / Purchases / Grants)
 *   - Paginated ledger table grouped by date
 */
import { useState, useEffect } from 'react';

// ... Standard React component with:
// - useEffect to fetch /api/ext/credits/balance + /api/ext/credits/usage
// - Period selector tabs
// - Table with columns: Date, Description, Type, Amount, Balance After
// - Pagination controls
// - "Buy Credits" CTA when balance is low

export default function CreditUsagePage() {
  // Implementation: fetch balance + usage history, render table
  // Group by date using: new Date(item.createdAt * 1000).toLocaleDateString()
  return <div>{/* ... */}</div>;
}
```

Create `src/extensions/credits/BuyCreditsModal.tsx`:

```tsx
/**
 * Modal for purchasing credit top-ups.
 * Shows available packages, redirects to Stripe Checkout.
 */
// Implementation: 
// - Fetch /api/ext/credits/plans for topup options
// - Render cards for each option (50, 275, 550, 1150, 3000 credits)
// - On select: POST /api/ext/credits/purchase with { credits, returnUrl }
// - Redirect to checkoutUrl from response
// - On return: show success/failure message

export default function BuyCreditsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return <div>{/* ... */}</div>;
}
```

Create `src/extensions/credits/CreditExhaustedBanner.tsx`:

```tsx
/**
 * Banner shown in chat when credits are exhausted.
 * Displays: "Your credits have run out. [Buy Credits] to continue building."
 */
export function CreditExhaustedBanner({ onBuyCredits }: { onBuyCredits: () => void }) {
  return (
    <div className="mx-4 my-2 p-4 bg-red-900/20 border border-red-800 rounded-lg flex items-center justify-between">
      <div>
        <p className="text-red-300 font-medium">Credits exhausted</p>
        <p className="text-red-400 text-sm">Purchase credits to continue building.</p>
      </div>
      <button
        onClick={onBuyCredits}
        className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-sm font-medium"
      >
        Buy Credits
      </button>
    </div>
  );
}
```

#### 5.1.6 Environment Variables

Add to `.dev.vars.example` and `wrangler.jsonc` vars:

```
STRIPE_SECRET_KEY=""           # Stripe secret key (sk_test_... or sk_live_...)
STRIPE_WEBHOOK_SECRET=""       # Stripe webhook signing secret (whsec_...)
STRIPE_PUBLISHABLE_KEY=""      # For frontend (VITE_STRIPE_PUBLISHABLE_KEY)
```

---

### 5.2 Machine Type / Agent Profile System

**Priority: HIGH — Core UX differentiator**  
**Estimated effort: 2-3 days**  
**Dependencies: Agent profiles D1 table (in 0006 migration above)**

#### 5.2.1 Concept

Map Emergent's machine types to agent behavior profiles that control model selection, token budgets, and system prompt customization:

| Profile ID | Display Name | Behavior Type | Model Tier | Token Budget | Min Plan | Description |
|---|---|---|---|---|---|---|
| `e1-stable` | E-1 Stable & Thorough | `phasic` | `standard` | 1.0x | Free | Reliable full-stack builds with testing. Default. |
| `e1-fast` | E-1.1 Fast & Flexible | `phasic` | `standard` | 0.6x | Free | Quick prototyping, fewer tests, faster iteration. |
| `e1-focused` | E-1.5 Focused | `phasic` | `standard` | 0.8x | Standard | Balanced between speed and thoroughness. |
| `e2-thorough` | E-2 Thorough & Relentless | `agentic` | `premium` | 2.0x | Pro | Multi-agent, deep reasoning, maximum quality. |
| `prototype` | Prototype (Frontend Only) | `phasic` | `standard` | 0.4x | Free | Frontend-only, no backend/API, fast preview. |
| `mobile` | Mobile | `phasic` | `standard` | 1.0x | Standard | Mobile-first templates, responsive design. |

#### 5.2.2 Backend Implementation

Create `worker/extensions/agent-profiles/profiles.ts`:

```typescript
export interface AgentProfile {
  id: string;
  name: string;
  displayName: string;
  description: string;
  behaviorType: 'phasic' | 'agentic';
  modelTier: 'standard' | 'premium' | 'ultra';
  projectType: 'app' | 'landing-page' | 'api';
  tokenBudgetMultiplier: number;
  systemPromptOverride?: string;
  modelConfig?: {
    provider?: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
  };
  tools?: string[];
  isBuiltin: boolean;
  requiresPlan: 'free' | 'standard' | 'pro';
}

export const BUILTIN_PROFILES: AgentProfile[] = [
  {
    id: 'e1-stable',
    name: 'E-1 Stable',
    displayName: 'E-1 Stable & Thorough',
    description: 'Reliable builds with comprehensive testing. Best for production apps.',
    behaviorType: 'phasic',
    modelTier: 'standard',
    projectType: 'app',
    tokenBudgetMultiplier: 1.0,
    isBuiltin: true,
    requiresPlan: 'free',
  },
  {
    id: 'e1-fast',
    name: 'E-1.1 Fast',
    displayName: 'E-1.1 Fast & Flexible',
    description: 'Quick prototyping, minimal testing. Good for exploring ideas.',
    behaviorType: 'phasic',
    modelTier: 'standard',
    projectType: 'app',
    tokenBudgetMultiplier: 0.6,
    isBuiltin: true,
    requiresPlan: 'free',
  },
  {
    id: 'e1-focused',
    name: 'E-1.5 Focused',
    displayName: 'E-1.5 Focused',
    description: 'Balanced speed and quality. Good for iterative development.',
    behaviorType: 'phasic',
    modelTier: 'standard',
    projectType: 'app',
    tokenBudgetMultiplier: 0.8,
    isBuiltin: true,
    requiresPlan: 'standard',
  },
  {
    id: 'e2-thorough',
    name: 'E-2 Thorough',
    displayName: 'E-2 Thorough & Relentless',
    description: 'Multi-agent deep reasoning with maximum quality. Pro required.',
    behaviorType: 'agentic',
    modelTier: 'premium',
    projectType: 'app',
    tokenBudgetMultiplier: 2.0,
    isBuiltin: true,
    requiresPlan: 'pro',
  },
  {
    id: 'prototype',
    name: 'Prototype',
    displayName: 'Prototype (Frontend Only)',
    description: 'Frontend-only builds. No backend, fast preview.',
    behaviorType: 'phasic',
    modelTier: 'standard',
    projectType: 'app',
    tokenBudgetMultiplier: 0.4,
    isBuiltin: true,
    requiresPlan: 'free',
  },
  {
    id: 'mobile',
    name: 'Mobile',
    displayName: 'Mobile',
    description: 'Mobile-first apps with responsive design and native patterns.',
    behaviorType: 'phasic',
    modelTier: 'standard',
    projectType: 'app',
    tokenBudgetMultiplier: 1.0,
    isBuiltin: true,
    requiresPlan: 'standard',
  },
];
```

Create `worker/extensions/agent-profiles/routes.ts`:

```typescript
import { Hono } from 'hono';
import type { Env } from '../../../types';
import { BUILTIN_PROFILES } from './profiles';

export const agentProfileRoutes = new Hono<{ Bindings: Env }>();

// GET /api/ext/agent-profiles — list all profiles (builtin + user custom)
agentProfileRoutes.get('/', async (c) => {
  const tenantId = c.get('userId');
  const tenantPlan = c.get('plan') ?? 'free';

  // Get custom profiles from D1
  const customRows = await c.env.DB.prepare(
    'SELECT * FROM agent_profiles WHERE tenant_id = ? ORDER BY created_at'
  ).bind(tenantId).all();

  const customProfiles = (customRows.results ?? []).map((r: any) => ({
    id: r.id,
    name: r.name,
    displayName: r.display_name,
    description: r.description,
    behaviorType: r.behavior_type,
    modelTier: r.model_tier,
    projectType: r.project_type,
    tokenBudgetMultiplier: r.token_budget_multiplier,
    systemPromptOverride: r.system_prompt_override,
    modelConfig: r.model_config_json ? JSON.parse(r.model_config_json) : undefined,
    tools: r.tools_json ? JSON.parse(r.tools_json) : undefined,
    isBuiltin: false,
    requiresPlan: r.requires_plan,
  }));

  // Filter builtin profiles by tenant plan
  const planRank: Record<string, number> = { free: 0, standard: 1, pro: 2, team: 3, enterprise: 4 };
  const available = BUILTIN_PROFILES.filter(
    p => (planRank[tenantPlan] ?? 0) >= (planRank[p.requiresPlan] ?? 0)
  );

  return c.json({
    builtin: available,
    custom: customProfiles,
    currentPlan: tenantPlan,
  });
});

// POST /api/ext/agent-profiles — create custom profile (Pro+ only)
agentProfileRoutes.post('/', async (c) => {
  const tenantId = c.get('userId');
  const body = await c.req.json();

  // Validate Pro plan required
  // ... plan check ...

  const id = `custom-${Date.now()}`;
  await c.env.DB.prepare(
    `INSERT INTO agent_profiles (id, tenant_id, name, display_name, description, behavior_type, model_tier, project_type, token_budget_multiplier, system_prompt_override, model_config_json, tools_json, requires_plan)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id, tenantId, body.name, body.displayName, body.description,
    body.behaviorType ?? 'phasic', body.modelTier ?? 'standard',
    body.projectType ?? 'app', body.tokenBudgetMultiplier ?? 1.0,
    body.systemPromptOverride ?? null,
    body.modelConfig ? JSON.stringify(body.modelConfig) : null,
    body.tools ? JSON.stringify(body.tools) : null,
    'pro'
  ).run();

  return c.json({ id, success: true }, 201);
});

// DELETE /api/ext/agent-profiles/:id — delete custom profile
agentProfileRoutes.delete('/:id', async (c) => {
  const tenantId = c.get('userId');
  const profileId = c.req.param('id');

  await c.env.DB.prepare(
    'DELETE FROM agent_profiles WHERE id = ? AND tenant_id = ?'
  ).bind(profileId, tenantId).run();

  return c.json({ success: true });
});
```

#### 5.2.3 Integration: How Profile Selection Feeds Into Code Generation

The selected profile must influence the `CodeGeneratorAgent` behavior. The integration point is when a new session is created:

1. Frontend sends `profileId` in the session creation request
2. Backend looks up the profile → extracts `behaviorType`, `modelTier`, `tokenBudgetMultiplier`, `systemPromptOverride`
3. These values are passed as `CodeGenArgs` to the Durable Object

In the extension wrapper pattern, create `worker/extensions/agent-profiles/applyProfile.ts`:

```typescript
import { BUILTIN_PROFILES, AgentProfile } from './profiles';

/**
 * Given a profileId, returns the configuration overrides
 * to apply to the CodeGeneratorAgent session.
 */
export async function resolveProfile(
  db: D1Database,
  tenantId: string,
  profileId: string
): Promise<AgentProfile> {
  // Check builtin first
  const builtin = BUILTIN_PROFILES.find(p => p.id === profileId);
  if (builtin) return builtin;

  // Check custom profiles
  const row = await db.prepare(
    'SELECT * FROM agent_profiles WHERE id = ? AND tenant_id = ?'
  ).bind(profileId, tenantId).first();

  if (!row) {
    // Default to e1-stable
    return BUILTIN_PROFILES[0];
  }

  return {
    id: row.id as string,
    name: row.name as string,
    displayName: row.display_name as string,
    description: row.description as string,
    behaviorType: row.behavior_type as 'phasic' | 'agentic',
    modelTier: row.model_tier as 'standard' | 'premium' | 'ultra',
    projectType: row.project_type as 'app' | 'landing-page' | 'api',
    tokenBudgetMultiplier: row.token_budget_multiplier as number,
    systemPromptOverride: row.system_prompt_override as string | undefined,
    modelConfig: row.model_config_json ? JSON.parse(row.model_config_json as string) : undefined,
    tools: row.tools_json ? JSON.parse(row.tools_json as string) : undefined,
    isBuiltin: false,
    requiresPlan: row.requires_plan as 'free' | 'standard' | 'pro',
  };
}
```

#### 5.2.4 Frontend Component

Create `src/extensions/agent-profiles/MachineTypeSelector.tsx`:

```tsx
/**
 * Dropdown selector for machine types / agent profiles.
 * Replaces the upstream "Reliable/Smart" toggle.
 * Shows built-in profiles with plan-locked badges for unavailable ones.
 * Custom profiles appear in a separate section.
 */
import { useState, useEffect } from 'react';
import { ChevronDown, Lock, Cpu, Zap, Brain, Smartphone, Code2 } from 'lucide-react';

// Profile icons mapping
const PROFILE_ICONS: Record<string, any> = {
  'e1-stable': Cpu,
  'e1-fast': Zap,
  'e1-focused': Cpu,
  'e2-thorough': Brain,
  'prototype': Code2,
  'mobile': Smartphone,
};

interface Props {
  selectedProfileId: string;
  onSelect: (profileId: string) => void;
}

export function MachineTypeSelector({ selectedProfileId, onSelect }: Props) {
  // Fetch profiles from /api/ext/agent-profiles
  // Render dropdown with grouped sections:
  //   Built-in: E-1, E-1.1, E-1.5 (if standard+), E-2 (if pro+), Prototype, Mobile
  //   Custom: user-created agents (if any)
  //   + "Create New Agent" button (Pro+ only)
  // Locked profiles show Lock icon and plan badge
  return <div>{/* ... */}</div>;
}
```

---

### 5.3 Agent Builder & Management

**Priority: MEDIUM — Emergent's Pro feature**  
**Estimated effort: 5-8 days**  
**Dependencies: Agent profiles table (5.2), MCP backend (existing MCPManager)**

#### 5.3.1 Database Schema

Add to `migrations/0007_agents_and_import.sql`:

```sql
-- ============================================================
-- CUSTOM AGENT TABLES
-- ============================================================

-- Sub-agents (delegated specialists for main custom agents)
CREATE TABLE IF NOT EXISTS sub_agents (
    id TEXT PRIMARY KEY,
    parent_agent_id TEXT NOT NULL,       -- references agent_profiles.id
    tenant_id TEXT NOT NULL,
    name TEXT NOT NULL,
    display_name TEXT NOT NULL,
    specialization TEXT,                 -- 'code_review' | 'research' | 'design' | 'testing' | custom
    definition TEXT,                     -- Description for main agent (when to delegate)
    task_description TEXT,               -- Description for sub-agent (what to do)
    system_prompt TEXT NOT NULL,
    model_config_json TEXT,
    tools_json TEXT,                     -- JSON array of tool names
    guidelines TEXT,                     -- Operating guidelines/constraints
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY (parent_agent_id) REFERENCES agent_profiles(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_sub_agents_parent
    ON sub_agents(parent_agent_id);
CREATE INDEX IF NOT EXISTS idx_sub_agents_tenant
    ON sub_agents(tenant_id);

-- Per-user MCP server configurations
CREATE TABLE IF NOT EXISTS mcp_server_configs (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    name TEXT NOT NULL,                  -- 'Memory MCP' | 'Supabase MCP' | 'Notion MCP' | custom
    server_url TEXT NOT NULL,            -- MCP server URL
    auth_type TEXT DEFAULT 'none',       -- 'none' | 'api_key' | 'oauth' | 'bearer'
    -- Secrets are NOT stored here — they go to UserSecretsStore DO
    secret_ref TEXT,                     -- Reference key in UserSecretsStore for auth credentials
    enabled INTEGER NOT NULL DEFAULT 1,
    config_json TEXT,                    -- Additional configuration (JSON)
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_mcp_configs_tenant
    ON mcp_server_configs(tenant_id);

-- GitHub imported repositories
CREATE TABLE IF NOT EXISTS github_imports (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    repo_full_name TEXT NOT NULL,        -- 'owner/repo'
    branch TEXT NOT NULL DEFAULT 'main',
    is_private INTEGER NOT NULL DEFAULT 0,
    session_id TEXT,                     -- CodeGeneratorAgent session that cloned it
    app_id TEXT,                         -- resulting app ID
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'cloning' | 'analyzing' | 'ready' | 'failed'
    error_message TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_github_imports_tenant
    ON github_imports(tenant_id, created_at);
```

#### 5.3.2 Backend Services

Create `worker/extensions/agent-builder/AgentProfileService.ts`:

```typescript
/**
 * Service for managing custom agents (CRUD).
 * Custom agents are stored in agent_profiles with tenant_id set.
 * Extends the built-in profile system from 5.2.
 * 
 * Methods:
 * - listAgents(tenantId) → { mainAgents, subAgents }
 * - createAgent(tenantId, data) → AgentProfile
 * - updateAgent(tenantId, agentId, data) → AgentProfile  
 * - deleteAgent(tenantId, agentId) → void
 * - getAgentWithSubAgents(tenantId, agentId) → { agent, subAgents }
 */
export class AgentProfileService {
  constructor(private db: D1Database) {}
  // ... implementation
}
```

Create `worker/extensions/agent-builder/SubAgentService.ts`:

```typescript
/**
 * Service for managing sub-agents.
 * Sub-agents are specialists that a main agent can delegate to.
 * Key rule: sub-agents CANNOT call other sub-agents (only main agent can delegate).
 *
 * Methods:
 * - listSubAgents(tenantId, parentAgentId?) → SubAgent[]
 * - createSubAgent(tenantId, parentAgentId, data) → SubAgent
 * - updateSubAgent(tenantId, subAgentId, data) → SubAgent
 * - deleteSubAgent(tenantId, subAgentId) → void
 */
export class SubAgentService {
  constructor(private db: D1Database) {}
  // ... implementation
}
```

Create `worker/extensions/agent-builder/McpConfigService.ts`:

```typescript
/**
 * Service for managing per-user MCP server configurations.
 * Integrates with existing MCPManager in worker/agents/tools/.
 * Secrets are stored in UserSecretsStore DO, not in D1.
 *
 * Methods:
 * - listMcpServers(tenantId) → McpServerConfig[]
 * - addMcpServer(tenantId, data) → McpServerConfig
 * - updateMcpServer(tenantId, serverId, data) → McpServerConfig
 * - deleteMcpServer(tenantId, serverId) → void
 * - testConnection(tenantId, serverId) → { success, error? }
 * - getActiveServersForAgent(tenantId, agentId) → McpServerConfig[]
 */
export class McpConfigService {
  constructor(
    private db: D1Database,
    private secretsStore: DurableObjectStub  // UserSecretsStore
  ) {}
  // ... implementation
}
```

Create `worker/extensions/agent-builder/routes.ts`:

```typescript
import { Hono } from 'hono';
import type { Env } from '../../../types';

export const agentBuilderRoutes = new Hono<{ Bindings: Env }>();

// ---- Main Agents ----
// GET    /api/ext/agents                   — list all agents
// POST   /api/ext/agents                   — create agent
// GET    /api/ext/agents/:id               — get agent detail
// PUT    /api/ext/agents/:id               — update agent
// DELETE /api/ext/agents/:id               — delete agent

// ---- Sub-Agents ----
// GET    /api/ext/agents/:id/sub-agents    — list sub-agents
// POST   /api/ext/agents/:id/sub-agents    — create sub-agent
// PUT    /api/ext/agents/sub/:subId        — update sub-agent
// DELETE /api/ext/agents/sub/:subId        — delete sub-agent

// ---- MCP Servers ----
// GET    /api/ext/agents/mcp               — list MCP servers
// POST   /api/ext/agents/mcp               — add MCP server
// PUT    /api/ext/agents/mcp/:id           — update MCP server
// DELETE /api/ext/agents/mcp/:id           — delete MCP server
// POST   /api/ext/agents/mcp/:id/test      — test MCP connection
```

#### 5.3.3 Frontend Components

Create `src/extensions/agent-builder/ManageAgentsPage.tsx`:

```tsx
/**
 * Settings page for managing agents.
 * Three tabs: Main Agents | Sub-Agents | MCP Tools
 * 
 * Main Agents tab:
 *   - List of custom agents with edit/delete
 *   - "Create New Agent" button → opens AgentForm
 *   
 * Sub-Agents tab:
 *   - Grouped by parent agent
 *   - Create/edit/delete sub-agents
 *   
 * MCP Tools tab:
 *   - List of configured MCP servers with status indicator
 *   - "New MCP Server" button
 *   - Pre-configured options: Memory MCP, Supabase MCP, Notion MCP
 *   - "Configure" button per server
 *   - "Test Connection" button
 */
export default function ManageAgentsPage() {
  return <div>{/* Tabbed interface */}</div>;
}
```

Create `src/extensions/agent-builder/AgentForm.tsx`:

```tsx
/**
 * Form for creating/editing a custom agent.
 * Fields:
 *   - Name (text)
 *   - Persona/description (textarea, guides: personality, expertise, style)
 *   - System prompt (code editor / textarea)
 *   - Model configuration (provider dropdown, model dropdown, temperature slider)
 *   - Tool selection (checkboxes: web_search, crawl, screenshot, file_read, etc.)
 *   - Token budget multiplier (slider 0.5x - 3.0x)
 * 
 * Save → POST /api/ext/agents
 */
```

Create `src/extensions/agent-builder/McpToolsTab.tsx`:

```tsx
/**
 * MCP Tools configuration tab.
 * Shows:
 *   - Pre-configured MCP options:
 *     • Memory MCP — persistent memory across sessions
 *     • Supabase MCP — database integration  
 *     • Notion MCP — workspace integration
 *   - Custom MCP server URL input
 *   - Auth configuration (none, API key, bearer token)
 *   - Test Connection button with status indicator
 */
```

---

### 5.4 GitHub Import ("Add from GitHub")

**Priority: MEDIUM**  
**Estimated effort: 5-8 days**  
**Dependencies: GitHub OAuth (already exists), github_imports table (in 0007 migration)**

#### 5.4.1 Steps

1. **GitHub App Setup** (not just OAuth App)
   - Current VibeSDK has two GitHub OAuth Apps (login + export)
   - For repo import with org access, create a GitHub App with `contents:read` permission
   - Register at `https://github.com/settings/apps/new`
   - Add installation flow for organizations

2. **Backend Service** — `worker/extensions/github-import/GitHubImportService.ts`:

```typescript
/**
 * Service for importing existing GitHub repositories.
 *
 * Methods:
 * - listUserRepos(accessToken, page, perPage) → { repos, hasMore }
 *   Uses GitHub API: GET /user/repos?sort=updated&per_page=20
 *
 * - listOrgRepos(accessToken, org) → { repos }
 *   Uses GitHub API: GET /orgs/:org/repos
 *
 * - listBranches(accessToken, owner, repo) → string[]
 *   Uses GitHub API: GET /repos/:owner/:repo/branches
 *
 * - importRepo(tenantId, repoFullName, branch, accessToken) → ImportResult
 *   1. Create github_imports record (status: 'cloning')
 *   2. Clone repo contents via GitHub API (GET /repos/:owner/:repo/git/trees/:branch?recursive=1)
 *   3. Download file contents
 *   4. Create CodeGeneratorAgent session with pre-loaded files
 *   5. Update status to 'analyzing'
 *   6. Agent analyzes structure and presents summary to user
 *   7. Update status to 'ready'
 *
 * - getImportStatus(importId) → ImportStatus
 */
export class GitHubImportService {
  constructor(private db: D1Database) {}

  async listUserRepos(accessToken: string, page = 1): Promise<any> {
    const response = await fetch(
      `https://api.github.com/user/repos?sort=updated&per_page=20&page=${page}&type=all`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'VibeSDK',
        },
      }
    );
    return response.json();
  }

  async listBranches(accessToken: string, owner: string, repo: string): Promise<string[]> {
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/branches`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'VibeSDK',
        },
      }
    );
    const branches = (await response.json()) as any[];
    return branches.map((b: any) => b.name);
  }

  async importRepo(
    tenantId: string,
    repoFullName: string,
    branch: string,
    accessToken: string
  ): Promise<{ importId: string; sessionId: string }> {
    // Implementation:
    // 1. Record import in D1
    // 2. Fetch repo tree via GitHub API
    // 3. Download files (up to size limit)
    // 4. Initialize agent session with pre-loaded workspace
    // 5. Return import ID for status polling
    throw new Error('Not implemented');
  }
}
```

3. **API Routes** — `worker/extensions/github-import/routes.ts`:

```typescript
import { Hono } from 'hono';

export const githubImportRoutes = new Hono();

// GET  /api/ext/github-import/repos?page=1       — list user repos
// GET  /api/ext/github-import/repos/:owner/:repo/branches  — list branches
// POST /api/ext/github-import/import              — start import { repoFullName, branch }
// GET  /api/ext/github-import/status/:importId    — poll import status
// GET  /api/ext/github-import/orgs                — list connected orgs
```

4. **Frontend** — `src/extensions/github-import/GitHubImportModal.tsx`:

```tsx
/**
 * Modal for importing an existing GitHub repository.
 * Two modes:
 *   1. Paste URL — input field for https://github.com/owner/repo
 *   2. Browse repos — searchable dropdown of connected repos
 *
 * Flow:
 *   - Select repo → select branch → click "Import"
 *   - Shows progress indicator while cloning
 *   - On complete: redirects to new chat session with imported code
 *
 * Components:
 *   - RepoSearchInput (debounced search with dropdown)
 *   - BranchSelector (dropdown, default to main/master)  
 *   - Private/Public toggle filter
 *   - Connected Orgs section (if GitHub App installed)
 *   - Import button with loading state
 */
```

---

### 5.5 Notification System

**Priority: LOW**  
**Estimated effort: 3-4 days**  
**Dependencies: None (uses existing WebSocket infrastructure)**

#### 5.5.1 Database Schema

Add to `migrations/0008_notifications_and_billing.sql`:

```sql
-- ============================================================
-- NOTIFICATION TABLES
-- ============================================================

CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    type TEXT NOT NULL,              -- 'agent_complete' | 'credit_low' | 'credit_exhausted'
                                     -- | 'deploy_ready' | 'deploy_failed' | 'system_update'
                                     -- | 'plan_renewal' | 'promo' | 'agent_error'
    category TEXT NOT NULL DEFAULT 'inbox',  -- 'inbox' | 'offers' | 'updates'
    title TEXT NOT NULL,
    body TEXT,
    data_json TEXT,                  -- arbitrary payload (e.g., { sessionId, appId, url })
    read INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_notifications_tenant
    ON notifications(tenant_id, read, created_at);

-- ============================================================
-- BILLING TABLES (extend subscriptions from 0006)
-- ============================================================

-- Invoice records (synced from Stripe webhooks)
CREATE TABLE IF NOT EXISTS invoices (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    stripe_invoice_id TEXT,
    amount_cents INTEGER NOT NULL,
    currency TEXT NOT NULL DEFAULT 'usd',
    status TEXT NOT NULL,            -- 'draft' | 'open' | 'paid' | 'void' | 'uncollectible'
    description TEXT,
    period_start INTEGER,
    period_end INTEGER,
    pdf_url TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_invoices_tenant
    ON invoices(tenant_id, created_at);
```

#### 5.5.2 Backend

Create `worker/extensions/notifications/NotificationService.ts`:

```typescript
/**
 * Notification service.
 *
 * Methods:
 * - send(tenantId, type, title, body, data?) → void
 *   Writes to D1 + pushes via WebSocket if user is connected
 *
 * - list(tenantId, filters?) → { items, unreadCount }
 *   Paginated list with category filter
 *
 * - markRead(tenantId, notificationId) → void
 * - markAllRead(tenantId, category?) → void
 * - getUnreadCount(tenantId) → number
 *   Fast read from KV: `notifications:unread:{tenantId}`
 *
 * WebSocket integration:
 *   Notifications are pushed via the existing WebSocket connection.
 *   Add a new message type: { type: 'notification', payload: Notification }
 *   Frontend listens for this type and updates bell icon badge.
 */
export class NotificationService {
  constructor(private db: D1Database, private kv: KVNamespace) {}
  // ... implementation
}
```

#### 5.5.3 Frontend

Create `src/extensions/notifications/NotificationBell.tsx`:

```tsx
/**
 * Bell icon with unread count badge.
 * On click: toggles NotificationPanel slide-out.
 * Badge shows unread count (fetched from KV via /api/ext/notifications/unread).
 * Updates in real-time via WebSocket notification events.
 */
```

Create `src/extensions/notifications/NotificationPanel.tsx`:

```tsx
/**
 * Slide-out panel with three tabs: Inbox | Offers | Updates
 * Each tab shows a list of notification cards with:
 *   - Icon (based on type)
 *   - Title + body
 *   - Timestamp (relative: "2 hours ago")
 *   - Unread indicator (blue dot)
 *   - Click action (navigate to relevant page)
 * 
 * Footer: "Mark all as read" button
 */
```

---

### 5.6 Plans & Invoices

**Priority: LOW — needs Stripe integration first (from 5.1)**  
**Estimated effort: 3-5 days**  
**Dependencies: Credit system (5.1), Stripe integration, subscriptions + invoices tables**

#### 5.6.1 Stripe Setup

1. Create Stripe Products and Prices:
   - Product: "VibeSDK Standard Plan" → Price: $20/mo (or $17/mo annual)
   - Product: "VibeSDK Pro Plan" → Price: $200/mo (or $167/mo annual)
   - Product: "VibeSDK Team Plan" → Price: $300/mo (or $250/mo annual)
   - Product: "Credit Top-Up 50" → Price: $10 one-time
   - (etc. for each top-up tier)

2. Create Stripe Webhook endpoint: `POST /api/ext/billing/webhook`

3. Handle webhook events:
   - `customer.subscription.created` → create subscription record, grant plan credits
   - `customer.subscription.updated` → update plan, adjust credits
   - `customer.subscription.deleted` → downgrade to free, stop credit grants
   - `invoice.paid` → record invoice, send notification
   - `invoice.payment_failed` → send notification, flag subscription

#### 5.6.2 Backend

Create `worker/extensions/billing/StripeService.ts`:

```typescript
/**
 * Stripe integration service for Workers environment.
 * Uses raw fetch() instead of stripe-node (which requires Node APIs).
 *
 * Methods:
 * - createCheckoutSession(tenantId, priceId, mode, returnUrl) → { url, sessionId }
 *   mode: 'subscription' | 'payment'
 *
 * - createBillingPortalSession(tenantId, returnUrl) → { url }
 *   For managing existing subscription (upgrade/downgrade/cancel)
 *
 * - handleWebhook(rawBody, signature) → void
 *   Processes webhook events, updates D1 records
 *
 * - getOrCreateCustomer(tenantId, email) → stripeCustomerId
 *   Creates Stripe customer if not exists, stores ID in subscriptions table
 *
 * - cancelSubscription(tenantId) → void
 *   Cancels at period end
 */
export class StripeService {
  constructor(
    private db: D1Database,
    private stripeKey: string,
    private webhookSecret: string
  ) {}

  private async stripeRequest(path: string, method: string, body?: URLSearchParams): Promise<any> {
    const response = await fetch(`https://api.stripe.com/v1${path}`, {
      method,
      headers: {
        'Authorization': `Bearer ${this.stripeKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body?.toString(),
    });
    return response.json();
  }

  // ... implementation using stripeRequest for all API calls
}
```

Create `worker/extensions/billing/routes.ts`:

```typescript
import { Hono } from 'hono';

export const billingRoutes = new Hono();

// GET    /api/ext/billing/subscription    — current subscription details
// POST   /api/ext/billing/checkout        — create checkout session for plan upgrade
// POST   /api/ext/billing/portal          — create Stripe billing portal session
// POST   /api/ext/billing/webhook         — Stripe webhook (no auth, signature verified)
// GET    /api/ext/billing/invoices        — list invoices
// POST   /api/ext/billing/cancel          — cancel subscription at period end
```

#### 5.6.3 Frontend

Create `src/extensions/billing/PlansPage.tsx`:

```tsx
/**
 * Plans comparison page (accessible from settings or header).
 * Shows:
 *   - Current plan highlighted
 *   - Side-by-side plan cards: Free | Standard | Pro | Team
 *   - Feature comparison checklist
 *   - Monthly/Annual toggle (annual shows savings)
 *   - "Upgrade" / "Downgrade" / "Current" buttons
 *   - Clicking upgrade → Stripe Checkout
 *   - Clicking "Manage Subscription" → Stripe Billing Portal
 */
export default function PlansPage() {
  return <div>{/* ... */}</div>;
}
```

Create `src/extensions/billing/InvoicesPage.tsx`:

```tsx
/**
 * Invoice history page.
 * Shows:
 *   - Table: Date | Description | Amount | Status | PDF link
 *   - Fetches from /api/ext/billing/invoices
 *   - PDF link opens Stripe-hosted invoice PDF
 */
export default function InvoicesPage() {
  return <div>{/* ... */}</div>;
}
```

---

### 5.7 Ultra Thinking Toggle

**Priority: MEDIUM — Pro-only feature**  
**Estimated effort: 1-2 days**  
**Dependencies: Agent profiles (5.2), Credit system (5.1)**

#### Implementation

Ultra Thinking enables extended reasoning tokens (16k+ thinking tokens) for the selected model. Implementation:

1. **Frontend**: Add toggle switch next to model selector in prompt toolbar
   - Disabled + lock icon for non-Pro users
   - When enabled, sends `ultraThinking: true` in session config

2. **Backend**: In `worker/extensions/agent-profiles/applyProfile.ts`:
   ```typescript
   if (ultraThinking && profile.requiresPlan !== 'pro') {
     throw new Error('Ultra Thinking requires Pro plan');
   }
   // If ultra enabled, override model config:
   // - Set maxTokens to extended limit
   // - Enable thinking/reasoning mode (provider-specific)
   // - Apply 5x credit multiplier
   ```

3. **Model-specific implementation**:
   - Anthropic Claude: Set `thinking: { type: "enabled", budget_tokens: 16384 }`
   - OpenAI: Use `reasoning_effort: "high"` or extended model variant
   - Gemini: Use `thinkingConfig: { thinkingBudget: 16384 }`

---

### 5.8 Fork / Remix Functionality

**Priority: MEDIUM**  
**Estimated effort: 2-3 days**  
**Dependencies: Discover page (exists)**

#### Implementation

1. **Backend**: `POST /api/ext/apps/:appId/fork`
   - Copy app record with new ID and new owner
   - Copy last deployed file snapshot from R2
   - Create new CodeGeneratorAgent session with forked files
   - Return new app ID

2. **Frontend**: Add "Fork" button on:
   - Discover page app cards
   - Chat view input area (fork current session)
   - App detail/preview page

3. **D1**: Add `forked_from TEXT` column to existing `apps` table (or add in extension migration)

---

### 5.9 Custom Domain Management

**Priority: MEDIUM**  
**Estimated effort: 3-5 days**  
**Dependencies: Workers for Platforms (exists)**

#### Implementation

1. **D1 table** (add to extension migration):
   ```sql
   CREATE TABLE IF NOT EXISTS app_custom_domains (
       id TEXT PRIMARY KEY,
       app_id TEXT NOT NULL,
       tenant_id TEXT NOT NULL,
       domain TEXT NOT NULL UNIQUE,
       status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'verifying' | 'active' | 'failed'
       cf_custom_hostname_id TEXT,             -- Cloudflare Custom Hostname ID
       created_at INTEGER NOT NULL DEFAULT (unixepoch())
   );
   ```

2. **Backend**: Use Cloudflare Custom Hostnames API
   - `POST /api/ext/domains/add` → Create custom hostname via CF API
   - `GET /api/ext/domains/verify/:id` → Check DNS propagation + SSL status
   - `DELETE /api/ext/domains/:id` → Remove custom hostname

3. **Frontend**: Domain management UI in app settings
   - Input field for domain
   - Instructions: "Add an A record pointing to [IP] and a CNAME for www"
   - Status indicator (pending → verifying → active)

---

### 5.10 Pre-Deployment Health Check

**Priority: MEDIUM**  
**Estimated effort: 2-3 days**  
**Dependencies: Sandbox (exists)**

#### Implementation

Before deployment, run automated checks in the sandbox:

1. **Backend**: `worker/extensions/health-check/HealthCheckService.ts`:
   ```typescript
   interface HealthCheckResult {
     passed: boolean;
     checks: {
       name: string;           // 'build_success' | 'type_check' | 'lint' | 'test' | 'preview_renders'
       status: 'pass' | 'fail' | 'warn' | 'skip';
       message?: string;
       duration?: number;
     }[];
   }
   ```

2. **Checks to run**:
   - `bun run build` — build succeeds without errors
   - `bun run typecheck` — no TypeScript errors
   - `bun run lint` — no critical lint issues
   - Preview URL responds with 200
   - Core routes return expected status codes

3. **Frontend**: Health check results card before the "Deploy" button

---

## 6. File Creation Checklist

### Phase 1: Credits + Machine Types (HIGH priority)

```
NEW FILES:
worker/extensions/credits/CreditService.ts
worker/extensions/credits/routes.ts
worker/extensions/credits/types.ts
worker/extensions/credits/inferWrapper.ts
worker/extensions/agent-profiles/profiles.ts
worker/extensions/agent-profiles/routes.ts
worker/extensions/agent-profiles/applyProfile.ts
worker/extensions/index.ts                        ← barrel export + route registration
worker/api/routes/extensionRoutes.ts               ← registers all extension routes under /api/ext
src/extensions/credits/CreditBalancePill.tsx
src/extensions/credits/CreditUsagePage.tsx
src/extensions/credits/BuyCreditsModal.tsx
src/extensions/credits/CreditExhaustedBanner.tsx
src/extensions/agent-profiles/MachineTypeSelector.tsx
migrations/0006_credits_and_profiles.sql

MODIFIED FILES:
worker/api/routes/index.ts                         ← add 1 import for extensionRoutes
src/routes.ts                                      ← add lazy routes for credits/profiles pages
wrangler.jsonc                                     ← add STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET vars
.dev.vars.example                                  ← add Stripe keys
migrations/meta/_journal.json                      ← add idx:6 entry
```

### Phase 2: Agent Builder + GitHub Import (MEDIUM priority)

```
NEW FILES:
worker/extensions/agent-builder/AgentProfileService.ts
worker/extensions/agent-builder/SubAgentService.ts
worker/extensions/agent-builder/McpConfigService.ts
worker/extensions/agent-builder/routes.ts
worker/extensions/github-import/GitHubImportService.ts
worker/extensions/github-import/routes.ts
src/extensions/agent-builder/ManageAgentsPage.tsx
src/extensions/agent-builder/AgentForm.tsx
src/extensions/agent-builder/SubAgentForm.tsx
src/extensions/agent-builder/McpToolsTab.tsx
src/extensions/github-import/GitHubImportModal.tsx
src/extensions/github-import/RepoSearchInput.tsx
src/extensions/github-import/BranchSelector.tsx
migrations/0007_agents_and_import.sql

MODIFIED FILES:
worker/extensions/index.ts                          ← register new routes
src/routes.ts                                       ← add agent builder + import routes
migrations/meta/_journal.json                       ← add idx:7 entry
```

### Phase 3: Notifications + Plans + Polish (LOW priority)

```
NEW FILES:
worker/extensions/notifications/NotificationService.ts
worker/extensions/notifications/routes.ts
worker/extensions/billing/StripeService.ts
worker/extensions/billing/routes.ts
src/extensions/notifications/NotificationBell.tsx
src/extensions/notifications/NotificationPanel.tsx
src/extensions/billing/PlansPage.tsx
src/extensions/billing/InvoicesPage.tsx
src/extensions/tab-bar/TabBar.tsx
src/extensions/tab-bar/TabStore.ts
migrations/0008_notifications_and_billing.sql

MODIFIED FILES:
worker/extensions/index.ts                          ← register notification + billing routes
src/routes.ts                                       ← add pages
src/App.tsx or src/components/Layout.tsx             ← integrate TabBar, NotificationBell, CreditBalancePill
migrations/meta/_journal.json                       ← add idx:8 entry
```

### Phase 4: Advanced Features (FUTURE)

```
NEW FILES:
worker/extensions/health-check/HealthCheckService.ts
worker/extensions/health-check/routes.ts
worker/extensions/domains/CustomDomainService.ts
worker/extensions/domains/routes.ts
worker/extensions/fork/ForkService.ts
worker/extensions/fork/routes.ts
src/extensions/health-check/HealthCheckCard.tsx
src/extensions/domains/DomainManager.tsx
src/extensions/fork/ForkButton.tsx
public/manifest.json                                ← PWA manifest
public/service-worker.js                            ← PWA service worker
```

---

## 7. Docker Compose Setup

### docker/docker-compose.yml

```yaml
# Local development only — production deploys to Cloudflare Workers
version: '3.8'

services:
  vibesdk-dev:
    build:
      context: ..
      dockerfile: docker/Dockerfile.dev
    ports:
      - "5173:5173"   # Vite dev server (frontend)
      - "8787:8787"   # Wrangler dev server (worker)
    volumes:
      - ..:/app
      - /app/node_modules                  # Don't mount node_modules from host
      - /app/.wrangler                     # Don't mount .wrangler cache
    env_file:
      - ../.dev.vars
    environment:
      - ENVIRONMENT=dev
      - NODE_ENV=development
    command: bun run dev
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:5173"]
      interval: 30s
      timeout: 10s
      retries: 3
```

### docker/Dockerfile.dev

```dockerfile
FROM oven/bun:latest

# Install system dependencies
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies (cached layer)
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Copy source (volume mount overrides in dev)
COPY . .

# Generate Cloudflare types
RUN bun run cf-typegen || true

EXPOSE 5173 8787

# Default command (overridden by docker-compose)
CMD ["bun", "run", "dev"]
```

### Usage

```bash
# Start local dev
cd docker
docker compose up

# Rebuild after dependency changes
docker compose build --no-cache
docker compose up

# Stop
docker compose down
```

> **Important**: Production deployment is to **Cloudflare Workers** via `bun run deploy` or `wrangler deploy`. Docker is strictly for local development. The app is designed to run on Cloudflare's edge, not in containers.

---

## 8. Upstream Sync Checklist

Run this checklist after every upstream merge from `cloudflare/vibesdk`:

### Pre-Merge

```bash
# 1. Tag current state for rollback
git tag pre-upgrade-$(date +%Y%m%d)

# 2. Fetch latest upstream
git fetch upstream main

# 3. Check what changed
git log main..upstream/main --oneline
git diff main..upstream/main --stat

# 4. Verify upstream didn't touch our directories (should be empty)
git diff main..upstream/main --stat -- worker/sdae/ worker/extensions/ src/extensions/ docs/SDAE_* docs/COST_QUALITY_* docs/GAP_ANALYSIS_*
```

### Merge

```bash
# 5. Merge
git checkout main
git merge upstream/main

# 6. If conflicts, resolve in tracked files only:
```

| File | Expected Conflict | Resolution |
|---|---|---|
| `migrations/meta/_journal.json` | Index collision | Keep both entries, renumber ours if needed |
| `wrangler.jsonc` | New bindings | Keep theirs + add our extra bindings |
| `worker-configuration.d.ts` | Types changed | Regenerate (step 7) |
| `.dev.vars.example` | New vars | Merge: keep ours, add new upstream vars |
| `worker/api/routes/index.ts` | Route changes | Keep theirs + re-add our extensionRoutes import |
| `src/routes.ts` | Route changes | Keep theirs + re-add our extension routes |
| `package.json` | Dependency changes | Keep theirs + verify our added deps remain |

### Post-Merge

```bash
# 7. Regenerate Cloudflare types
bun run cf-typegen

# 8. Typecheck
bun run typecheck

# 9. Run tests
bun run test

# 10. Check for new migrations
ls migrations/
# If upstream added 0005, 0006, etc.: renumber ours to avoid collision

# 11. Check for new env vars
git diff HEAD~1 -- .dev.vars.example
# Add any new variables to our .dev.vars.example

# 12. Check if upstream modified files we wrap in extensions
git diff HEAD~1 -- worker/agents/inferutils/ worker/agents/core/ worker/services/aigateway-proxy/
# If changed: verify our extension wrappers still work

# 13. Install any new dependencies
bun install

# 14. Run local D1 migrations
bun run db:migrate:local

# 15. Smoke test
bun run dev
# Verify: home page loads, chat works, preview works, extension routes respond
```

### Automated Script

```bash
#!/bin/bash
# scripts/upstream-sync.sh
set -e

echo "=== VibeSDK Upstream Sync ==="

git tag pre-upgrade-$(date +%Y%m%d) 2>/dev/null || true
git fetch upstream main

echo "--- Changes from upstream ---"
git log main..upstream/main --oneline | head -20

echo "--- Merging ---"
git merge upstream/main || {
  echo "❌ Merge conflicts detected. Resolve manually, then run:"
  echo "   bun run cf-typegen && bun run typecheck && bun run test"
  exit 1
}

echo "--- Post-merge checks ---"
bun install
bun run cf-typegen
bun run typecheck
bun run test
bun run db:migrate:local 2>/dev/null || true

echo "✅ Upstream sync complete"
```

---

## 9. Prioritized Implementation Roadmap

### Sprint 1 (Week 1-2): Monetization Foundation

| Task | Files | Effort | Blocker |
|---|---|---|---|
| Create migration 0006 (credits + profiles) | `migrations/0006_credits_and_profiles.sql` | 0.5 day | None |
| Implement CreditService | `worker/extensions/credits/CreditService.ts` | 2 days | Migration |
| Implement credit API routes | `worker/extensions/credits/routes.ts` | 1 day | CreditService |
| Implement credit balance pill | `src/extensions/credits/CreditBalancePill.tsx` | 0.5 day | API routes |
| Implement buy credits modal | `src/extensions/credits/BuyCreditsModal.tsx` | 1 day | Stripe setup |
| Implement credit usage page | `src/extensions/credits/CreditUsagePage.tsx` | 1 day | API routes |
| Implement credit exhaustion banner | `src/extensions/credits/CreditExhaustedBanner.tsx` | 0.5 day | CreditService |
| Create extension route registration | `worker/api/routes/extensionRoutes.ts` | 0.5 day | None |
| Hook credit tracking into infer | `worker/extensions/credits/inferWrapper.ts` | 1 day | CreditService |
| Stripe webhook handler | Credit routes | 1 day | Stripe account |

### Sprint 2 (Week 2-3): Agent Profiles + UX

| Task | Files | Effort | Blocker |
|---|---|---|---|
| Define built-in profiles | `worker/extensions/agent-profiles/profiles.ts` | 0.5 day | None |
| Implement profile API routes | `worker/extensions/agent-profiles/routes.ts` | 1 day | Migration |
| Implement profile resolver | `worker/extensions/agent-profiles/applyProfile.ts` | 1 day | Profiles |
| Build MachineTypeSelector | `src/extensions/agent-profiles/MachineTypeSelector.tsx` | 1 day | Profile API |
| Implement Ultra Thinking toggle | Frontend + backend | 1 day | Profiles |
| Add quick prompt pills | Frontend only | 0.5 day | None |
| Add Advanced Controls panel | Frontend | 1 day | Profiles + Credits |

### Sprint 3 (Week 3-4): Agent Builder + GitHub Import

| Task | Files | Effort | Blocker |
|---|---|---|---|
| Create migration 0007 | `migrations/0007_agents_and_import.sql` | 0.5 day | None |
| Implement AgentProfileService | `worker/extensions/agent-builder/` | 2 days | Migration |
| Implement SubAgentService | `worker/extensions/agent-builder/` | 1.5 days | AgentProfileService |
| Implement McpConfigService | `worker/extensions/agent-builder/` | 1.5 days | None |
| Build ManageAgentsPage | `src/extensions/agent-builder/` | 2 days | Services |
| Implement GitHubImportService | `worker/extensions/github-import/` | 2 days | GitHub App setup |
| Build GitHubImportModal | `src/extensions/github-import/` | 1.5 days | Service |

### Sprint 4 (Week 4-5): Polish + Lower Priority

| Task | Files | Effort | Blocker |
|---|---|---|---|
| Create migration 0008 | `migrations/0008_notifications_and_billing.sql` | 0.5 day | None |
| Implement NotificationService | `worker/extensions/notifications/` | 1.5 days | Migration |
| Build notification UI | `src/extensions/notifications/` | 1.5 days | Service |
| Implement StripeService (subscriptions) | `worker/extensions/billing/` | 2 days | Stripe |
| Build Plans + Invoices pages | `src/extensions/billing/` | 2 days | StripeService |
| Implement tab bar | `src/extensions/tab-bar/` | 2 days | None |
| Implement fork functionality | Backend + frontend | 1.5 days | None |
| Add deployment history | Backend + frontend | 1 day | None |

---

## 10. Testing Strategy

### Unit Tests

| Module | Test File | What to Test |
|---|---|---|
| CreditService | `worker/extensions/credits/CreditService.test.ts` | Balance CRUD, debit atomicity, grant types, budget check thresholds, usage history pagination |
| Agent profiles | `worker/extensions/agent-profiles/profiles.test.ts` | Profile resolution, plan gating, custom profile CRUD |
| SubAgentService | `worker/extensions/agent-builder/SubAgentService.test.ts` | Sub-agent CRUD, parent relationship, no sub-sub-agent rule |
| McpConfigService | `worker/extensions/agent-builder/McpConfigService.test.ts` | Server CRUD, secret ref management, connection test mock |
| NotificationService | `worker/extensions/notifications/NotificationService.test.ts` | Send, list, mark read, unread count |

### Integration Tests

| Scenario | Endpoints | Validates |
|---|---|---|
| Credit purchase flow | POST /purchase → webhook → GET /balance | Stripe checkout → credit grant → balance update |
| Credit exhaustion | Repeated debits → GET /budget-check | Balance goes to 0 → canProceed: false |
| Profile selection | GET /agent-profiles → session create with profileId | Profile applied to agent config |
| GitHub import | POST /import → GET /status | Repo cloned → session created → status: ready |

### E2E Tests

Using the existing `vitest` setup:

```typescript
// test/e2e/credits.test.ts
describe('Credit System E2E', () => {
  it('should display balance after login');
  it('should debit credits after code generation');
  it('should show exhaustion banner when balance hits 0');
  it('should complete Stripe checkout and update balance');
});
```

---

## 11. Environment Variables Reference

Complete list of new environment variables needed for all extensions:

```bash
# ──────────────────────────────────────────────────────────────
# STRIPE (Required for credits + billing)
# ──────────────────────────────────────────────────────────────
STRIPE_SECRET_KEY=""                   # sk_test_... or sk_live_...
STRIPE_WEBHOOK_SECRET=""               # whsec_... (from Stripe dashboard)
VITE_STRIPE_PUBLISHABLE_KEY=""         # pk_test_... (frontend, compiled into bundle)

# ──────────────────────────────────────────────────────────────
# GITHUB APP (Required for GitHub Import feature)
# ──────────────────────────────────────────────────────────────
GITHUB_APP_ID=""                       # GitHub App ID (for org-level repo access)
GITHUB_APP_PRIVATE_KEY=""              # PEM private key for GitHub App
GITHUB_APP_WEBHOOK_SECRET=""           # GitHub App webhook secret

# ──────────────────────────────────────────────────────────────
# FEATURE FLAGS (Optional — all default to false/disabled)
# ──────────────────────────────────────────────────────────────
# ENABLE_CREDITS="true"               # Enable credit system
# ENABLE_AGENT_PROFILES="true"        # Enable machine type selector
# ENABLE_AGENT_BUILDER="true"         # Enable custom agent creation (Pro)
# ENABLE_GITHUB_IMPORT="true"         # Enable GitHub import
# ENABLE_NOTIFICATIONS="true"         # Enable notification system
# ENABLE_BILLING="true"               # Enable Stripe subscription billing
```

---

## 12. Key Architectural Decisions

| Decision | Rationale |
|---|---|
| **D1 for credit ledger** (not external DB) | VibeSDK is 100% Cloudflare. D1 is the native database. Avoids external infra dependency. D1 batch operations provide sufficient atomicity for credit transactions. |
| **Stripe via raw `fetch`** (not `stripe-node`) | `stripe-node` uses Node.js APIs (crypto, streams) not available in CF Workers. Raw `fetch` to Stripe API is the recommended Workers pattern. |
| **Extension directories** (not modifying upstream) | Keeps merge conflicts near-zero. Only 5-6 upstream files modified (routes, wrangler, journal). All business logic in `worker/extensions/` and `src/extensions/`. |
| **Credit buckets** (plan / purchased / promo) | Emergent uses this model: plan credits expire monthly, top-up credits never expire. Three buckets with ordered debit (promo → plan → purchased) matches this exactly. |
| **Agent profiles as D1 records** (not config files) | Custom agents are per-user, created at runtime. D1 gives CRUD for free. Built-in profiles are in-code constants seeded into D1. |
| **MCP secrets in UserSecretsStore DO** (not D1) | MCP server API keys are sensitive. UserSecretsStore already provides encrypted secret storage. D1 holds config metadata only, secrets go to the DO. |
| **Notification push via existing WebSocket** | VibeSDK already has a WebSocket connection per chat session. Adding a notification message type is simpler than building a separate push channel. For users not in a chat session, notifications appear on next page load. |
| **SDAE DAG Runner for sub-agent orchestration** | Rather than building new multi-agent framework, reuse the SDAE DAG Runner. Each sub-agent task is a DAG node. The runner handles parallelism, retry, and state tracking. |

---

*This document is the master reference for the VibeSDK → Emergent-grade platform transformation. Update it as features land. Every section is designed to be independently implementable by any developer or AI agent with access to the codebase.*
