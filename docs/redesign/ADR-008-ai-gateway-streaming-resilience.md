# ADR-008: AI Gateway Streaming Resilience for WebSocket Reconnect

**Status:** PROPOSED — implementation deferred S12
**Date:** 2026-05-14
**Author:** @Architect (run025 finding)

---

## Context

vibesdk uses CF AI Gateway today for all main LLM calls (`core.ts`):
- `env.AI.gateway(env.CLOUDFLARE_AI_GATEWAY)` → builds gateway URL
- OpenAI client with `baseURL: gatewayUrl` → all requests proxy through AI Gateway
- Metadata header `cf-aig-metadata` → per-session cost tracking

**Current gap:** If a WebSocket disconnects mid-phase (mobile, flaky connection), the LLM call must be re-invoked from scratch. The in-progress LLM tokens are lost. This costs LLM credits (double-spend on reconnect) and degrades UX (phase resets).

**CF Agents Week announcement (May 2026):** AI Gateway now buffers streaming responses independently of the caller's lifetime. The buffer persists in AI Gateway's edge cache, keyed by a `cf-aig-request-id` response header. A reconnected agent can retrieve the buffered content without re-invoking the LLM.

---

## Decision

**S11:** Defer full implementation. Document architecture and unblock with ADR.

**S12:** Implement streaming resilience in 3 phases:

### Phase 1 — Capture request ID (1d)

In `core.ts`, intercept the response headers from AI Gateway to extract `cf-aig-request-id`:

```typescript
// In the response handling of client.chat.completions.create(), access raw headers.
// The OpenAI SDK v4+ exposes response.headers on the raw response.
const rawResponse = await client.chat.completions.create(
    { ...params },
    { stream: true, headers: { 'cf-aig-metadata': JSON.stringify(metadata) } }
).withResponse();  // .withResponse() returns { data: stream, response: Response }

const requestId = rawResponse.response.headers.get('cf-aig-request-id');
```

Store `requestId` in DO state alongside the active phase:

```typescript
// In CodeGenState / PhasicState:
activeGatewayRequestId?: string;
```

### Phase 2 — Resume on reconnect (1d)

In `WebSocket.onConnect()` / `agent_connected` handler, check if `activeGatewayRequestId` is set. If yes, call the AI Gateway resume endpoint:

```typescript
// CF AI Gateway resume API (exact endpoint TBD — check CF docs when implementing):
// GET https://{gateway-id}.gateway.ai.cloudflare.com/v1/resume/{requestId}
const gateway = env.AI.gateway(env.CLOUDFLARE_AI_GATEWAY);
const resumeUrl = `${await gateway.getUrl()}resume/${state.activeGatewayRequestId}`;
const resumedStream = await fetch(resumeUrl, {
    headers: { Authorization: `Bearer ${env.CLOUDFLARE_AI_GATEWAY_TOKEN}` }
});
// Pipe resumedStream back to the new WebSocket connection.
```

### Phase 3 — Cleanup (0.5d)

- Clear `activeGatewayRequestId` when phase completes normally
- Set TTL expectation: AI Gateway buffers for ~5 minutes (verify in CF docs)
- Add metric: `ws_reconnect_resume_success` / `ws_reconnect_fresh_invoke`

---

## Alternatives Considered

**A. Store last N tokens in DO state (simpler):** Cache the last 4k tokens of in-progress stream in DO hibernation storage. On reconnect, replay to client. Does NOT save LLM re-invocation cost (LLM call still restarts). Saves UX (user sees progress), not cost.

**B. Phase checkpoint (current implementation):** Each phase is an atomic unit — if WS drops, the phase re-runs from the start of that phase. Users see the previous phase output already committed. Cost: 1 full LLM call per disconnect per phase.

**C. Streaming resilience via AI Gateway (this ADR):** Best outcome — zero LLM re-invocation, zero UX regression on mobile. Requires CF API clarity on resume endpoint format.

---

## Action Required Before Implementation

1. Verify `cf-aig-request-id` header is exposed in OpenAI client `.withResponse()`
2. Confirm AI Gateway resume endpoint URL format (check CF Agents Week docs / `developers.cloudflare.com/ai-gateway`)
3. Confirm buffer TTL (expected: ~5 minutes, matches WS reconnect window)
4. Test with: stub WebSocket drop mid-stream → verify resume retrieves correct tokens

---

## Cost Impact

- **Today (no resilience):** N reconnects = N × LLM cost per phase
- **With resilience:** N reconnects = 1 × LLM cost per phase
- **For 5% reconnect rate @ 10 phases/session:** ~5% LLM cost reduction per session
- **At $22/mo operational target:** saves ~$1.10/mo at current scale; meaningful at 100+ users/day

---

## Dependencies

- CF AI Gateway streaming buffer must be GA (confirmed from Agents Week — GA)
- `cf-aig-request-id` header must be accessible through OpenAI SDK response headers
- DO state migration to include `activeGatewayRequestId?: string`
