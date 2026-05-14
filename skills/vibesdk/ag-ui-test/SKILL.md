# AG-UI Integration Test Skill

## Purpose
Verify that vibesdk's AG-UI protocol events are emitting correctly for third-party integrations (CopilotKit, custom AG-UI clients).

## When to Invoke
- Building an AG-UI client against vibesdk
- Verifying S6 AG-UI protocol alignment
- `run_started` / `run_finished` / `state_snapshot` events not firing
- Testing the `toAgUiEvent()` translator

## Protocol Overview
vibesdk emits BOTH native events AND AG-UI companion events:
```
generation_started → run_started   (with runId, sessionId)
generation_complete → run_finished (with runId, sessionId)
agent_connected → state_snapshot   (with snapshot: full agent state)
error → run_error                  (with message, code)
state_delta → STATE_DELTA          (RFC 6902 JSON Patch array)
```

## Quick Verification Test
```javascript
// Browser DevTools Console — listen for all AG-UI events
['run_started', 'run_finished', 'run_error', 'state_snapshot', 'state_delta'].forEach(t => {
  window.addEventListener(`vibesdk:${t}`, e => console.log(`[AG-UI] ${t}`, e.detail));
});
// Trigger a generation — all 5 event types should fire in sequence:
// vibesdk:run_started → [streaming...] → vibesdk:run_finished
// vibesdk:state_snapshot fires on initial connect
// vibesdk:state_delta fires on state mutations
```

## AG-UI Event Shape Verification
```typescript
// run_started
{ type: 'RUN_STARTED', threadId: string, runId: string, timestamp: number }

// run_finished
{ type: 'RUN_FINISHED', threadId: string, runId: string, timestamp: number }

// state_snapshot
{ type: 'STATE_SNAPSHOT', snapshot: Record<string,unknown>, timestamp: number }

// state_delta
{ type: 'STATE_DELTA', delta: Array<{ op: string, path: string, value?: unknown }>, timestamp: number }

// run_error
{ type: 'RUN_ERROR', message: string, code?: string, timestamp: number }
```

## toAgUiEvent() Translator Test
```typescript
// worker/agents/core/agui-adapter.ts
import { toAgUiEvent } from './agui-adapter';

// Test mapping
toAgUiEvent({ type: 'run_started', sessionId: 'test', runId: 'r1' })
// → { type: 'RUN_STARTED', threadId: 'test', runId: 'r1', timestamp: <n> }

toAgUiEvent({ type: 'state_snapshot', snapshot: { x: 1 } })
// → { type: 'STATE_SNAPSHOT', snapshot: { x: 1 }, timestamp: <n> }

toAgUiEvent({ type: 'generation_started' })
// → null (intentionally skipped — run_started is the canonical event)

toAgUiEvent({ type: 'file_chunk_generated', filePath: 'a.ts', chunk: 'hello' })
// → { type: 'TEXT_MESSAGE_CONTENT', messageId: 'file:a.ts', delta: 'hello', timestamp: <n> }

toAgUiEvent({ type: 'error', error: 'oops' })
// → { type: 'RUN_ERROR', message: 'oops', timestamp: <n> }
```

## Diagnostic: Why Events Might Not Fire

| Symptom | Likely Cause |
|---------|-------------|
| `run_started` missing | `base.ts` buildWrapper not emitting RUN_STARTED — check S6 changes |
| `state_snapshot` missing | `codingAgent.ts` AGENT_CONNECTED handler not sending STATE_SNAPSHOT |
| `state_delta` events 0 | No state mutations happened (normal for short sessions) |
| Events fire but AG-UI client can't parse | Check event type casing: vibesdk uses lowercase, AG-UI uses UPPER_SNAKE |
| `runId` is undefined in run_started | `generateNanoId()` import missing in `base.ts` |

## Key Files
```
worker/agents/core/agui-adapter.ts        — toAgUiEvent() translator (S6)
worker/agents/core/behaviors/base.ts      — buildWrapper: RUN_STARTED / RUN_FINISHED emission
worker/agents/core/codingAgent.ts         — AGENT_CONNECTED: STATE_SNAPSHOT emission
worker/api/websocketTypes.ts             — RunStartedMessage, StateSnapshotMessage, StateDeltaMessage
worker/agents/constants.ts               — RUN_STARTED, RUN_FINISHED, STATE_SNAPSHOT, STATE_DELTA
src/routes/chat/utils/handle-websocket-message.ts — event dispatch for all AG-UI types
```

## CopilotKit Integration Example
```typescript
// To consume vibesdk events in CopilotKit:
import { useAgUiStream } from '@copilotkit/react-core';

const { messages, status } = useAgUiStream({
  wsUrl: `wss://vibesdk.example.com/ws/${sessionId}`,
  // CopilotKit auto-handles RUN_STARTED, TEXT_MESSAGE_CONTENT, RUN_FINISHED
});
```
