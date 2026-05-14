# ADR-007 — Parallel Sub-agent Merge Strategy

**Status:** PROPOSED
**Date:** 2026-05-14
**Deciders:** @Architect, @Tech-Lead
**Skill invoked:** `engineering:architecture`, `autonomous-agents`
**Prerequisite:** ADR-001 (multi-agent DO fan-out), S10 parallel sub-agent implementation sprint

## Context

When vibesdk ships parallel sub-agent execution (P0 gap — Replit, Cursor, Devin all live), multiple sub-agents may modify files concurrently. The current PhaseWorkflow is sequential (plan → implement → eval). A parallel workflow (multiple CoderAgents working simultaneously on different file groups) introduces merge conflicts when two sub-agents modify the same file.

Replit Agent 4 ships 90% auto merge-conflict resolution (May 2026). This is the competitor's answer.

vibesdk's architectural advantage: isolated DO-per-sub-agent with git-backed SQLite FS. All file changes are git commits inside the session DO. This gives us first-class git merge tooling as a foundation.

**This ADR must be decided before the S10 parallel sub-agent implementation sprint begins.** Choosing the wrong strategy post-implementation is expensive.

## Decision Options

### Option A — Phase Independence Constraint (Conservative)

**Approach:** Enforce at plan time that no two parallel sub-agents are assigned to files that could conflict. The Planner assigns disjoint file sets to each CoderAgent. If a file appears in two phases, it is assigned to exactly one agent and the other agent receives a read-only view.

**Implementation:**
- `PhaseGeneration.ts`: extend plan output with `fileOwnership: Record<filePath, agentId>`
- `TeamLeadAgent.ts`: validate disjoint sets before dispatching; reject plan if overlap exists
- `PhaseWorkflow.ts`: pass `readOnly: readonly string[]` alongside `files` to CoderAgents that need read access without write permission

**Pros:**
- Zero merge conflicts by construction
- No complex merge logic to implement or test
- Matches vibesdk's correctness-first positioning
- Fast to ship (1-2 sprint days on top of basic parallelism)

**Cons:**
- Some tasks genuinely require concurrent writes to the same file (e.g., two agents adding to `index.ts`)
- Planner must be smarter about file assignment
- 5-10% of parallelization opportunities lost due to shared-file conflicts
- Planner can become a bottleneck if it over-serializes to avoid conflicts

**When it breaks:** Large shared files (App.tsx, index.ts, router config) that every feature phase needs to touch. Cannot parallelize those phases.

---

### Option B — LLM-Mediated Merge (Replit Model)

**Approach:** Allow parallel sub-agents to write to the same files. After all agents complete their phase, run a merge step that uses an LLM judge to resolve conflicts between diff sets.

**Implementation:**
- Each CoderAgent commits to a branch: `phase/agent-N`
- After all parallel agents complete, `MergeAgent` (new) receives all branch diffs and the base content
- `MergeAgent` prompt: "Given these concurrent changes to the same file, produce a conflict-free merged version preserving all intended behaviors"
- Result replaces the working copy; committed to main session branch
- Failures escalate to Option C (human-in-the-loop)

**Implementation detail (git-DO):**
```
Base commit (main) ──┬── branch: phase/agent-1 (CoderAgent 1 writes)
                     └── branch: phase/agent-2 (CoderAgent 2 writes)
                          ↓
                     MergeAgent: diff-both → LLM-resolve → commit to main
```

**Pros:**
- Maximum parallelization — no file ownership constraint
- Matches Replit's approach (90% auto-resolution claimed)
- LLM merge is context-aware (understands intent, not just line diffs)
- Graceful degradation to Option C on failure

**Cons:**
- Additional LLM call per conflict (cost + latency)
- Merge quality depends on LLM reasoning; hallucination risk in merge output
- EvalGate must re-run after merge to verify quality
- Implementation complexity: branch management within the session DO, MergeAgent DO
- Estimated effort: 1 additional sprint on top of basic parallelism

**Merge agent model recommendation:** Gemini 2.5 Pro (same as codeDebugger.ts). Reasoning budget: medium (8k tokens). Input: base file + both branch diffs + agent intent descriptions.

---

### Option C — Human-in-the-Loop Merge UI (Fallback Only)

**Approach:** When Options A or B cannot resolve a conflict automatically, surface a merge conflict UI in the browser. User picks which version to keep or edits the merged result directly.

**Implementation:**
- `ConflictResolutionMessage` WebSocket type: sends both versions + conflict markers
- New UI component: `MergeConflictPanel` — side-by-side diff viewer with accept/reject/edit controls
- User resolution → commit to session DO

**Pros:**
- Always correct (human decides)
- Good UX if rare enough
- Can double as a general "review parallel output" feature

**Cons:**
- Breaks the fully-autonomous generation flow
- Blocks the session until user acts (can be hours in async workflows)
- Not useful for automated vibesdk-as-API workflows (no browser)

**Assessment:** Appropriate as a **fallback only**, not a primary strategy.

---

## Decision

**Adopt Option A (Phase Independence Constraint) as primary, with Option B (LLM Merge) as a planned S11 upgrade, and Option C as fallback scaffolding.**

### Rationale

**Why A first:**
- vibesdk's correctness-first positioning means a merge-corrupted file is a worse outcome than a serialized phase
- Option A ships in the same sprint as parallelism (not a separate sprint)
- The 5-10% parallelization loss is acceptable for S10 — most vibesdk phases are already file-disjoint (auth phase: `auth/*.ts`, UI phase: `components/*.tsx`, API phase: `api/*.ts`)
- Matches vibesdk's "no hallucination" positioning — LLM merge introduces a new hallucination surface

**Why B later (not never):**
- Replit's 90% claim sets a market expectation for auto-resolution
- The git-DO architecture is ideal for branch-based merge (already have git tree operations)
- LLM merge is more powerful for shared config files (tailwind.config.ts, package.json)
- Ship A → measure conflict frequency → if >5% of sessions hit forced serialization, ship B

**Why C as scaffolding:**
- Option A failures (where the Planner can't find a disjoint assignment) need a resolution path
- The merge UI component is reusable for other conflict scenarios (git rebase, etc.)

## Implementation spec (Option A — S10)

### Phase plan extension (PhaseGeneration.ts)

```typescript
type ParallelPhaseGroup = {
    /** Phases that can execute simultaneously. All file sets must be disjoint. */
    phases: PhaseConceptType[];
    /** Ownership map: filePath → phaseName. Enforces disjoint assignment. */
    fileOwnership: Readonly<Record<string, string>>;
};
```

### Validation function (new utility)

```typescript
/** Returns null if file sets are disjoint; returns conflict info if overlap detected. */
function validateDisjointFiles(
    phases: PhaseConceptType[],
): { conflictingFile: string; phases: [string, string] } | null {
    const seen = new Map<string, string>();
    for (const phase of phases) {
        for (const file of phase.files ?? []) {
            const prior = seen.get(file.path);
            if (prior) {
                return { conflictingFile: file.path, phases: [prior, phase.name] };
            }
            seen.set(file.path, phase.name);
        }
    }
    return null;
}
```

### TeamLeadAgent dispatch (core/behaviors extension)

```typescript
// Before dispatching parallel agents:
const conflict = validateDisjointFiles(parallelGroup.phases);
if (conflict) {
    this.logger.warn('Parallel phase group has file conflict — serializing', conflict);
    // Fall back to sequential execution for this group.
    for (const phase of parallelGroup.phases) {
        await this.executePhaseImplementation(phase, ...);
    }
    return;
}
// No conflict: dispatch in parallel.
await Promise.all(parallelGroup.phases.map(phase => this.executePhaseImplementation(phase, ...)));
```

### EvalGate per-agent result aggregation

Each parallel CoderAgent runs its own EvalGate. Results are aggregated:
- `compositScore` = mean of all agent composite scores
- If any agent FAILS: overall phase group FAILS; escalate to review
- `STATE_DELTA` emits per-agent results as separate patches

## Consequences

**Positive:**
- Zero merge conflicts in S10 (by construction)
- Planner gets explicit file ownership signal (improves plan quality)
- Sequential fallback is always available (no regression from current behavior)
- Option B upgrade path is clean: swap serialization fallback for LLM merge

**Negative:**
- Planner must produce disjoint file assignments (additional constraint on PhaseGeneration prompt)
- Shared files (config, router, main entry) cannot be parallelized until Option B ships
- Conflict validation adds O(N×F) per phase group (N phases, F files per phase) — negligible at vibesdk scale

## Metrics to track (S10)

- `parallel_groups_total`: total parallel phase groups dispatched
- `parallel_groups_serialized`: groups forced to serialize due to file conflict
- Threshold: if `parallel_groups_serialized / parallel_groups_total > 0.10`, escalate Option B

## References

- ADR-001: Multi-agent DO fan-out
- run016: Replit Agent 4 — 90% auto merge-conflict resolution (competitor benchmark)
- CUMULATIVE-SUMMARY-CYCLE-4: Parallel sub-agent merge strategy design needed before S10
- worker/agents/operations/PhaseWorkflow.ts: current sequential implementation
- worker/agents/core/behaviors/phasic.ts: phase dispatch logic
