# Architecture Review + Manus-Style Upgrade Path

**Owner:** @Architect
**Status:** DRAFT — awaiting Decision Panel

## Current State (baseline)

```
Browser (React 19 + Vite + PartySocket)
    │ WS
    ▼
Cloudflare Worker (worker/index.ts, 7860 LOC)
    │ RPC
    ▼
SimpleCodeGeneratorAgent (Durable Object, 2800 LOC)
    ├── State machine: IDLE → PHASE_GENERATING → PHASE_IMPLEMENTING → REVIEWING
    ├── FileManager (isomorphic-git + SQLite FS)
    ├── Operations: PhaseGeneration, PhaseImplementation, UserConversationProcessor
    ├── Tools: read-files, run-analysis, regenerate-file, codeDebugger (Gemini 2.5 Pro)
    └── Sandbox: custom container service
    │
    ▼
D1 (Drizzle) + User Secrets DO (XChaCha20-Poly1305)
```

**Strengths:**
- DO-per-session → persistent state, single-threaded consistency
- Git history in SQLite → full rebase/clone protocol
- Message dedup solved (tool exec causes duplicates)

**Weaknesses (why we're upgrading):**
| # | Pain                                                  | Impact                         |
|---|-------------------------------------------------------|--------------------------------|
| 1 | Single-agent serial execution                         | Slow: 4× parallelizable work   |
| 2 | 2800-LOC monolith DO → hard to extend                 | Every new role = merge risk    |
| 3 | No explicit plan-critique step → hallucinated scope   | Wasted phase regenerations     |
| 4 | Single model per op → no tiering, wastes Opus budget  | ~4× cost vs tiered             |
| 5 | UI = monolithic chat; no plan/preview/tool panes      | Feels like chatbot, not IDE    |

## Target State (Manus-style multi-agent)

```
Browser
    │ WS (PartySocket, multi-channel)
    ▼
Worker router
    ▼
TeamLeadAgent (DO) ◄── owner of session state & plan
    │
    ├── spawns ──► PlannerAgent  (DO)  [Sonnet-H]  → blueprint, milestones
    ├── spawns ──► CoderAgent    (DO)  [Sonnet-M]  → parallel file writes
    ├── spawns ──► TesterAgent   (DO)  [Sonnet-L]  → sandbox run, error capture
    └── spawns ──► CriticAgent   (DO)  [Opus]      → red-team plan pre-execute

Internal bus: DO-to-DO RPC + shared D1 "plan" table
Merge strategy: TeamLead owns file-tree CRDT-ish; sub-agents propose patches
```

### Agent Contracts (stable interfaces)

```ts
interface SubAgent {
  id: string;
  role: 'planner' | 'coder' | 'tester' | 'critic';
  execute(task: Task, ctx: SharedCtx): AsyncIterator<Event>;
  abort(): void;
}

interface SharedCtx {
  blueprint: Blueprint;
  fileTree: FileSnapshot;   // read-only view, TeamLead mutates
  plan: PlanNode[];
  budget: { opus: n, sonnet: n, haiku: n };
}
```

### Migration Plan (non-breaking)

| Step | Change                                                          | Risk  |
|------|-----------------------------------------------------------------|-------|
| 1    | Extract PlannerAgent from current PhaseGeneration op            | LOW   |
| 2    | Add TeamLeadAgent as thin wrapper over SimpleCodeGeneratorAgent | LOW   |
| 3    | Spawn CoderAgents for parallel file writes (feature-flag)       | MED   |
| 4    | Add TesterAgent = existing sandbox loop, isolated DO            | LOW   |
| 5    | Add CriticAgent for plan red-team (flag-gated)                  | LOW   |
| 6    | Route via model-tier proxy (Opus/Sonnet-H/M/L)                  | MED   |
| 7    | Deprecate SimpleCodeGeneratorAgent monolith path                | HIGH  |

## Framework Decision (Decision Panel scope)

**Options:**
1. **Custom DO fan-out** — stay on-platform, full control, 2-3 sprints
2. **LangGraph on Workers** — mature graph, Python footprint awkward
3. **smolagents (HF)** — lightweight Python, not Workers-native
4. **CopilotKit AG-UI** — frontend-heavy, backend-agnostic

**@Arch-Pragmatist recommends:** Option 1 (custom DO fan-out) — already on platform, DO primitives = ideal for this.
**@Arch-Scale:** Option 1 scales linearly w/ DO count.
**@Arch-Security:** Option 1 — no net-new attack surface.
**@Arch-Maintainability:** Split monolith regardless of framework → Option 1 wins.

**Verdict:** HIGH confidence → **Option 1**. ADR-001 drafts this.

## API Contracts (new)

```
POST /api/sessions/:id/plan        → PlannerAgent triggers
GET  /api/sessions/:id/plan        → current plan tree
POST /api/sessions/:id/plan/accept → TeamLead starts CoderAgents
WS   /ws/sessions/:id              → multiplexed channels:
                                     - chat
                                     - plan-updates
                                     - file-stream
                                     - preview-events
                                     - agent-status (NEW: per sub-agent)
```

## Data Model Additions

```sql
-- new in D1
CREATE TABLE plan_nodes (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  parent_id TEXT,
  role TEXT NOT NULL,           -- 'milestone' | 'task' | 'subtask'
  title TEXT NOT NULL,
  status TEXT NOT NULL,         -- 'pending' | 'running' | 'done' | 'failed'
  assigned_agent TEXT,          -- 'planner' | 'coder-N' | 'tester' | 'critic'
  critique TEXT,                -- CriticAgent output
  created_at INTEGER,
  updated_at INTEGER
);

CREATE TABLE agent_budgets (
  session_id TEXT PRIMARY KEY,
  tier TEXT NOT NULL,           -- 'free' | 'pro' | 'team' | 'enterprise'
  opus_tokens_used INTEGER DEFAULT 0,
  sonnet_tokens_used INTEGER DEFAULT 0,
  reset_at INTEGER
);
```

## Risks + Mitigations

| Risk                                   | Mitigation                             |
|----------------------------------------|----------------------------------------|
| DO count explosion (cost)              | Cap sub-agents at 4/session, pool idle |
| Race conditions on file-tree           | TeamLead = single writer, sub = patch  |
| Critic loops forever                   | Max 2 critique rounds, then force-go   |
| Model tier drift (Opus when Sonnet ok) | @Analyst-Commercial budget check/turn  |

## Open Questions → @Critic

1. Do we version the plan tree? (rollback plan vs rollback code)
2. Sub-agent failures — retry, escalate, or fail-hard?
3. Who owns conversation memory — TeamLead or dedicated MemoryAgent?
