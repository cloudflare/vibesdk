# Phase Debug Skill

## Purpose
Structured debugging workflow for vibesdk phase failures — guides you from symptom to root cause using the project's specific architecture patterns.

## When to Invoke
- A code generation phase failed or produced broken output
- WebSocket streaming stopped mid-phase
- EvalGate blocked a phase (faithfulness < 0.6 or hallucination > 0.2)
- A sub-agent (CoderAgent, PlannerAgent, CriticAgent, TesterAgent) errored

## Diagnostic Protocol (follow in order)

### Step 1 — Identify Phase State
```bash
# Check current dev state in DO logs
# Look for: IDLE | PHASE_GENERATING | PHASE_IMPLEMENTING | REVIEWING
grep "currentDevState\|phaseError\|PhaseWorkflow" worker/logs
```
The state machine: `IDLE → PHASE_GENERATING → PHASE_IMPLEMENTING → REVIEWING → IDLE`

### Step 2 — Find the Failing Component
```
Phase failure sources (in priority order):
1. PlannerAgent — produced malformed PhaseConceptType (check schemas)
2. CoderAgent — timeout or context-length exceeded (check tokensSpent)
3. CriticAgent — red-teamed itself into a block loop
4. EvalGate — judge returned scores below FAITHFULNESS_FLOOR (0.6)
5. PhaseWorkflow — Mastra workflow step threw (check logs for 'plan-phase' | 'implement-phase' | 'eval-phase')
```

### Step 3 — Check EvalGate Scores
```typescript
// EvalGate thresholds (worker/agents/operations/EvalGate.ts)
FAITHFULNESS_FLOOR = 0.6   // below → gate blocks
HALLUCINATION_CEILING = 0.2 // above → gate blocks

// Score breakdown in eval_results table:
// SELECT * FROM eval_results WHERE session_id = ':id' ORDER BY created_at DESC LIMIT 5;
```

### Step 4 — Check PhaseWorkflow Run
```
The PhaseWorkflow emits state_delta events with eval scores.
Frontend receives them as: vibesdk:state_delta custom event.
Check browser DevTools → Application → Events for 'vibesdk:state_delta'.
```

### Step 5 — Check Sub-Agent DO Bindings
```typescript
// wrangler.jsonc must declare all 4 sub-agent DOs:
// CoderAgent, PlannerAgent, CriticAgent, TesterAgent
// Missing binding → 'getAgentStub returned null' error
```

## Common Fixes

| Symptom | Fix |
|---------|-----|
| Phase stuck in PHASE_GENERATING | Abort controller did not fire — check `getOrCreateAbortController()` |
| EvalGate always blocks | Judge API key missing — check ANTHROPIC_API_KEY in env |
| PhaseWorkflow `implement-phase` step fails | `runImpl` closure lost DO `this` — pass as arrow function |
| tokensSpent = 0 | Sub-agents did not accumulate — check `TeamLeadCoordinator.runParallelPhase` return |
| state_delta not received on frontend | AG-UI event dispatch missing — check `handle-websocket-message.ts` case `'state_delta'` |

## Key Files
```
worker/agents/core/behaviors/phasic.ts     — phase lifecycle, emitCostPreview, recordPhaseTokens
worker/agents/operations/PhaseWorkflow.ts  — Mastra workflow: plan → implement → eval
worker/agents/operations/EvalGate.ts       — eval judge, FAITHFULNESS_FLOOR, HALLUCINATION_CEILING
worker/services/mastra/evalGate.ts         — Mastra scorer adapter
worker/agents/subagents/TeamLeadCoordinator.ts — runParallelPhase orchestration
worker/agents/core/behaviors/base.ts       — RUN_STARTED / RUN_FINISHED emission
```
