# Skill: vibesdk MCP Client

**Trigger:** Use when an AI client (Claude Code, Cursor, Windsurf) needs to
interact with a running vibesdk session programmatically, or when investigating
vibesdk session state from a developer context.

---

## Overview

vibesdk exposes a stateless MCP 2024-11-05 endpoint at `POST /api/mcp`.
Each POST is a complete JSON-RPC exchange — no persistent connection.

**Base URL:** `https://vibesdk.dev/api/mcp` (production)  
**Auth:** `Authorization: Bearer <user-jwt>`  
**Content-Type:** `application/json`

---

## Quick Start

### 1. Configure MCP server in Claude Code

```json
// .claude/mcp-servers.json
{
  "vibesdk": {
    "transport": "http",
    "url": "https://vibesdk.dev/api/mcp",
    "headers": {
      "Authorization": "Bearer ${VIBESDK_TOKEN}"
    }
  }
}
```

Or use the Mastra-generated client:
```typescript
import { MCPClient } from '@mastra/mcp';

const client = new MCPClient({
  servers: {
    vibesdk: {
      url: new URL('https://vibesdk.dev/api/mcp'),
      requestInit: {
        headers: { Authorization: `Bearer ${process.env.VIBESDK_TOKEN}` },
      },
    },
  },
});
```

### 2. Initialize the connection

```http
POST /api/mcp
Authorization: Bearer <token>

{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": "2024-11-05",
    "capabilities": {},
    "clientInfo": { "name": "claude-code", "version": "1.0.0" }
  }
}
```

Response includes `serverInfo`, `capabilities`, and usage instructions.

---

## Tools

### `vibesdk_get_status`

Poll generation progress. Use to track phases, cost, and current activity.

**Input:**
```json
{ "sessionId": "abc123" }
```

**Output (JSON string in `content[0].text`):**
```json
{
  "sessionId": "abc123",
  "status": "done",          // planning | coding | done | failed | idle
  "progress": {
    "completed": 4,
    "total": 4
  },
  "cost": {
    "tokensSpent": 28500,
    "creditsSpent": 114
  },
  "agents": { "running": 0, "done": 4, "failed": 0 },
  "currentActivity": null,
  "elapsedMs": 187430,
  "lastEventAt": 1747234567890
}
```

**Polling pattern:**
```typescript
const poll = async (sessionId: string): Promise<void> => {
  while (true) {
    const result = await client.callTool('vibesdk_get_status', { sessionId });
    const data = JSON.parse(result.content[0].text);
    if (data.status === 'done' || data.status === 'failed') break;
    await new Promise(r => setTimeout(r, 3000));
  }
};
```

---

### `vibesdk_get_quality`

Inspect eval gate verdicts per phase. Returns faithfulness, hallucination risk,
composite score (0–1), and pass/fail for each completed phase.

**Input:**
```json
{ "sessionId": "abc123" }
```

**Output:**
```json
{
  "sessionId": "abc123",
  "hasResults": true,
  "overallCompositeScore": 0.891,
  "overallPassed": true,
  "phases": [
    {
      "phaseName": "auth",
      "attempt": 1,
      "passed": true,
      "compositeScore": 0.89,
      "faithfulness": 0.92,
      "answerRelevancy": 0.88,
      "toolCorrectness": 0.85,
      "hallucinationRisk": 0.04,
      "blockedReason": null,
      "judgeTokens": { "input": 2100, "output": 280 }
    }
  ]
}
```

**Quality thresholds:**
- `compositeScore >= 0.7` — acceptable
- `compositeScore >= 0.85` — good
- `passed = false` — phase below quality floor (review blockedReason)

---

### `vibesdk_describe_app`

Read app metadata. Returns title, original prompt, framework, status.

**Input:**
```json
{ "sessionId": "abc123" }
```

**Output:**
```json
{
  "id": "abc123",
  "title": "My Todo App",
  "description": "A full-stack React todo app",
  "originalPrompt": "Build me a todo app with auth and real-time sync",
  "framework": "react",
  "status": "completed",     // generating | completed
  "visibility": "private",
  "createdAt": "2026-05-14T10:30:00.000Z",
  "sessionUrl": "/chat/abc123"
}
```

---

## Error Handling

All errors follow JSON-RPC 2.0 format:
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32603,
    "message": "Session not found"
  }
}
```

| HTTP Status | JSON-RPC Code | Meaning |
|---|---|---|
| 401 | -32000 | Missing / invalid Bearer token |
| 200 | -32601 | Method not found |
| 200 | -32600 | Malformed JSON-RPC envelope |
| 200 | -32602 | Invalid tool arguments |
| 200 | -32603 | Tool error (session not found, ownership mismatch, DB error) |

Note: JSON-RPC errors return HTTP 200 (per MCP spec). Auth errors return HTTP 401.

---

## CF Workers Compatibility

This server runs natively on Cloudflare Workers (no Node.js built-ins):
- Transport: HTTP POST (no SSE / WebSocket)
- Schema validation: Zod (V8-compatible)
- Database: D1 via Drizzle ORM (CF Workers native)
- Auth: JWT + CF KV session store

The `CfWorkerJsonSchemaValidator` from `@modelcontextprotocol/sdk/validation/cfworker`
is available for clients that need schema validation in V8 isolates.

---

## Architecture Notes

```
MCP Client (Claude Code / Cursor)
    │  POST /api/mcp  Authorization: Bearer <jwt>
    ▼
mcpRoutes.ts (Hono) → validateToken() → handleMcpRequest()
    │
    ├── initialize          → server info + capabilities
    ├── tools/list          → tool schemas
    └── tools/call
          ├── vibesdk_get_status    → SessionMonitorService (D1)
          ├── vibesdk_get_quality   → EvalResultsService (D1)
          └── vibesdk_describe_app  → AppService (D1)
```

All tools use existing DB services. No DO RPC calls — pure D1 read queries.
Ownership enforced per tool (DB-level, same as REST controllers).

---

## Roadmap: Planned S10 Tools

| Tool | Status | Description |
|---|---|---|
| `vibesdk_get_status` | SHIPPED (S9) | Session progress |
| `vibesdk_get_quality` | SHIPPED (S9) | Eval verdicts |
| `vibesdk_describe_app` | SHIPPED (S9) | App metadata |
| `vibesdk_create_session` | PLANNED (S10) | Start new generation |
| `vibesdk_run_phase` | PLANNED (S10) | Execute specific phase |
| `vibesdk_get_files` | PLANNED (S10) | Read generated files |
