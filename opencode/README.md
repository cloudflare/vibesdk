# @opencode-do/opencode

Reusable Cloudflare Durable Object classes — `SessionDO` and `SpaceDO` — that
together implement an OpenCode-compatible agent backend on the Workers
runtime. The sibling `@opencode-do/worker` package is a thin sample worker
that demonstrates how to host them; this package is what you import from
your own worker.

There are two supported integration models:

- **Same-worker** — your worker's entrypoint re-exports `SessionDO` and
  `SpaceDO`, declares them in its own `wrangler.toml`, and calls them
  directly via `env.SESSION_DO.idFromName(...)`.
- **Cross-script binding** — deploy the sample `opencode-worker` (or any
  worker that re-exports these classes) once, then bind to its DOs from a
  separate worker using `script_name`.

## Install

```bash
npm install @opencode-do/opencode
```

Peer expectations: `compatibility_date >= 2024-09-23` and
`compatibility_flags = ["nodejs_compat"]`. The classes use the SQLite-backed
Durable Object storage API.

## Usage

The three things you almost always want to do from a worker that binds
`SessionDO`:

### 1. Provision an agent space for a session

The agent's workspace tools (`read`, `write`, `edit`, `grep`, `glob`,
`patch`, `git_commit`, `git_log`, `git_status`, `deploy`, …) no longer
take a `space` parameter — they resolve the working space from the
session's context. The binding worker is responsible for telling the
DO which space to use:

```ts
import type { SessionDO } from "@opencode-do/opencode"

const stub = env.SESSION_DO.get(env.SESSION_DO.idFromName("main")) as DurableObjectStub<SessionDO>

// 1. Create (or reuse) the session.
const session = await stub.createSessionAndBroadcast(undefined, "Refactor")

// 2. Attach a pre-provisioned SpaceDO to it. The SpaceDO auto-initialises
//    on first tool call — no separate "create" step is needed.
await stub.attachSpace(session.id, "my-project")
```

That's it — every subsequent prompt the agent receives in `session.id`
will see workspace tools that operate on the `my-project` SpaceDO. The
LLM never has to call `create_space` / `attach_space` itself.

**Resolution order** when a tool needs to know the session's space:

1. **First space attached** to the session via `attachSpace()`.
2. **`defaultSpace`** in `SessionConfigOverrides` (set once via
   `configure()` — applies to every session on this DO that hasn't
   been explicitly attached).
3. **Auto-generated fallback** — `session-<id-prefix>`. The DO records
   this attachment so the same name is reused for the rest of the
   session.

Set a DO-wide default if you don't want to call `attachSpace()` per
session:

```ts
await stub.configure({ defaultSpace: "my-project" })
```

The space-management tools (`create_space`, `attach_space`,
`detach_space`, `delete_space`, `list_session_spaces`) are still
exposed for multi-space agents that need to manipulate more than one
workspace, but they're optional — single-space workflows can ignore
them entirely.

### 2. Configure CF AI Gateway + default model

`SessionDO.configure()` is an RPC method that merges per-DO env overrides
(persisted in DO storage). Use it when the credentials live with your
*binding* worker — typical for cross-script deployments where the host
worker is generic and the consumer brings its own gateway/model config.

```ts
import type { SessionDO, SessionConfigOverrides } from "@opencode-do/opencode"

const stub = env.SESSION_DO.get(env.SESSION_DO.idFromName("main")) as DurableObjectStub<SessionDO>

await stub.configure({
  // CF AI Gateway — routes every provider call through your gateway
  CLOUDFLARE_ACCOUNT_ID: env.CLOUDFLARE_ACCOUNT_ID,
  CLOUDFLARE_GATEWAY_ID: env.CLOUDFLARE_GATEWAY_ID,
  CLOUDFLARE_API_TOKEN:  env.CLOUDFLARE_API_TOKEN,

  // Optional direct-provider key (used when gateway is not set)
  ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY,

  // Default model picked up by new sessions
  defaultModel: { providerID: "anthropic", modelID: "claude-sonnet-4-20250514" },
} satisfies SessionConfigOverrides)
```

Call this once at cold-start (or whenever values change) — overrides are
persisted, so you don't need to re-send them on every request. The
gateway path takes precedence over direct provider keys. To override the
model for a single prompt, pass `model: { providerID, modelID }` in the
`POST /session/:id/message` body.

Full resolution rules, env-var fallback paths, and the override field
table live further down under
[Configuring LLM providers, AI Gateway, and model selection](#configuring-llm-providers-ai-gateway-and-model-selection).

### 3. Consume code-generation events (no shims required)

Forward `GET /event` (and `POST /session/:id/message`) to the DO stub
and you've got the full OpenCode SSE event stream — no `Bus` import, no
listener registration, no shim code. The DO does the streaming; your
worker just proxies the `Response`.

```ts
import type { Env, SessionDO, StoredMessage, StoredPart } from "@opencode-do/opencode"
export { SessionDO, SpaceDO } from "@opencode-do/opencode"

export default {
  async fetch(req: Request, env: Env) {
    const url = new URL(req.url)
    const stub = env.SESSION_DO.get(env.SESSION_DO.idFromName("main")) as DurableObjectStub<SessionDO>

    // SSE event stream — token-by-token deltas, tool calls, session lifecycle
    if (url.pathname === "/event") return stub.fetch(req)

    // Submit a prompt (streams response back)
    if (url.pathname.startsWith("/session/") && req.method === "POST") {
      return stub.fetch(req)
    }

    // Snapshot the current message history (same shape as SSE events)
    if (url.pathname.startsWith("/session/") && req.method === "GET") {
      return stub.fetch(req)  // returns StoredMessage[]
    }

    return new Response("not found", { status: 404 })
  },
} satisfies ExportedHandler<Env>
```

Each SSE `data:` line is a JSON `BusEventPayload`:

```jsonc
{ "id": "evt_…", "type": "message.part.delta", "properties": { "sessionID": "ses_…", "partID": "prt_…", "text": "Hello" } }
```

The event types you'll typically render:

| `type` | When | Useful for |
|---|---|---|
| `message.part.delta` | Incremental text / reasoning delta | Token-by-token streaming |
| `message.part.updated` | A part transitions state (`text`, `tool`, `reasoning`, `step-start`, `step-finish`) | Tool-call UI, per-step rendering |
| `message.updated` | Assistant message info changes (cost, tokens, `finish`) | Progress + final state |
| `session.status` | Busy ↔ idle | Spinner / busy indicator |
| `session.updated` | Session created / renamed / finished | Session list refresh |

The payload types are exported for typed consumers:

```ts
import type { StoredMessage, StoredPart } from "@opencode-do/opencode"
```

If your consumer is the stock OpenCode TUI binary, route `/global/event`
to the DO and pass `?global=1`; the DO wraps each event in
`{ directory: "global", payload }` so the TUI's directory filter
accepts it. See
[Consuming code-generation events](#consuming-code-generation-events-no-shims-required)
for the cross-script variant and history-without-streaming snippet.

## Same-worker integration

### 1. Re-export the DO classes from your worker entrypoint

```ts
// src/worker.ts
import type { Env } from "@opencode-do/opencode"
export { SessionDO, SpaceDO } from "@opencode-do/opencode"

export default {
  async fetch(req: Request, env: Env) {
    const url = new URL(req.url)
    const stub = env.SESSION_DO.get(env.SESSION_DO.idFromName("main"))

    // One-time setup: bind creds + workspace to the DO. Persisted in
    // DO storage — call when values change, not on every request.
    if (url.pathname === "/setup") {
      await stub.configure({
        CLOUDFLARE_ACCOUNT_ID: env.CLOUDFLARE_ACCOUNT_ID,
        CLOUDFLARE_GATEWAY_ID: env.CLOUDFLARE_GATEWAY_ID,
        CLOUDFLARE_API_TOKEN:  env.CLOUDFLARE_API_TOKEN,
        defaultSpace: "my-project",
        defaultModel: { providerID: "anthropic", modelID: "claude-sonnet-4-20250514" },
      })
      return new Response("ok")
    }

    // Forward /event SSE, prompts, and history reads to the singleton SessionDO.
    if (url.pathname === "/event" || url.pathname.startsWith("/session/")) {
      return stub.fetch(req)
    }
    return new Response("not found", { status: 404 })
  },
} satisfies ExportedHandler<Env>
```

### 2. Declare bindings + migrations in your wrangler.toml

```toml
name = "my-worker"
main = "src/worker.ts"
compatibility_date = "2025-01-01"
compatibility_flags = ["nodejs_compat"]

[[durable_objects.bindings]]
name = "SESSION_DO"
class_name = "SessionDO"

[[durable_objects.bindings]]
name = "SPACE_DO"
class_name = "SpaceDO"

[[worker_loaders]]
binding = "LOADER"   # required by SpaceDO's deploy engine

[ai]
binding = "AI"       # optional — enables AI Gateway zero-config fallback

[[migrations]]
tag = "v1"
new_sqlite_classes = ["SessionDO"]

[[migrations]]
tag = "v2"
new_sqlite_classes = ["SpaceDO"]
```

### 3. (Recommended) Point wrangler at the pre-built `dist/`

The library ships pre-bundled JS in `dist/`. Adding an alias keeps your
worker build from re-traversing the library's source tree:

```toml
[alias]
"@opencode-do/opencode" = "./node_modules/@opencode-do/opencode/dist/index.js"
```

## Cross-script binding

If you've already deployed a worker that re-exports `SessionDO` and
`SpaceDO` (the sample `opencode-worker` is one such deployment), other
workers can bind to those classes without bundling the library:

```toml
# wrangler.toml of the *consumer* worker
[[durable_objects.bindings]]
name = "SESSION_DO"
class_name = "SessionDO"
script_name = "opencode-worker"   # name of the worker hosting the DOs

[[durable_objects.bindings]]
name = "SPACE_DO"
class_name = "SpaceDO"
script_name = "opencode-worker"
```

The consumer worker does not declare migrations and does not need
`worker_loaders` / `ai` bindings — those live on the host worker. From
code, call them the same way:

```ts
const stub = env.SESSION_DO.get(env.SESSION_DO.idFromName("main"))
return stub.fetch(req)
```

## Env shape

The library expects bindings matching the `Env` interface exported from
`@opencode-do/opencode`. See `src/env.ts` for the full list. The minimum
viable set for `SessionDO`-only usage is `SESSION_DO` + at least one LLM
provider key (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, or `GOOGLE_API_KEY`).
`SpaceDO` additionally requires `LOADER` for deployment previews.

## Configuring LLM providers, AI Gateway, and model selection

All provider/gateway configuration is read from `env` by `SessionDO` at
runtime — there are no library init calls. Set the values that match your
deployment via `wrangler secret put` (secrets) or `[vars]` in
`wrangler.toml` (non-secret). The provider registry picks a path in this
order:

1. **Cloudflare AI Gateway (explicit creds)** — set `CLOUDFLARE_ACCOUNT_ID`,
   `CLOUDFLARE_GATEWAY_ID`, and `CLOUDFLARE_API_TOKEN` (or `CF_AIG_TOKEN`).
   All providers are routed through the gateway. Provider API keys become
   optional (gateway BYOK / stored keys handle auth).
2. **Direct provider key** — when a request resolves to a provider whose
   key is set (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_API_KEY`),
   the SDK is used directly.
3. **AI binding fallback** — if only `[ai]` is bound, the registry calls
   `env.AI.gateway(CLOUDFLARE_GATEWAY_ID ?? "default").getUrl(provider)`
   and points the SDK's `baseURL` there. No provider key required when
   the gateway is configured for BYOK.

```toml
# wrangler.toml of your worker hosting SessionDO

[vars]
CLOUDFLARE_ACCOUNT_ID = "your-account-id"
CLOUDFLARE_GATEWAY_ID = "your-gateway-slug"
# CLOUDFLARE_API_TOKEN is a secret — set via `wrangler secret put`

[ai]
binding = "AI"   # enables the zero-config fallback
```

```bash
wrangler secret put CLOUDFLARE_API_TOKEN
wrangler secret put ANTHROPIC_API_KEY    # optional with gateway
```

### Selecting the model per prompt

The model is chosen by the request body sent to
`POST /session/:id/message`. `SessionDO` accepts either the
`{ model: { providerID, modelID } }` shape (matches upstream) or the flat
`{ providerID, modelID }` shape:

```ts
await env.SESSION_DO.get(env.SESSION_DO.idFromName("main")).fetch(
  new Request("https://do/session/abc/message", {
    method: "POST",
    body: JSON.stringify({
      parts: [{ type: "text", text: "Refactor src/index.ts" }],
      model: { providerID: "anthropic", modelID: "claude-sonnet-4-20250514" },
      agent: "build",
    }),
  }),
)
```

If `model` is omitted, the session's stored default is used (initialised
to `anthropic / claude-sonnet-4-20250514` on session creation). The
provider half of `model` must match one of the providers configured via
the env rules above.

### Setting a DO-wide default model

Set `defaultModel` once via `configure()` and every new session inherits
it. Already-created sessions keep their stored model — pass
`{ model: { providerID, modelID } }` in the prompt body to override
per-call. See [Passing CF gateway + provider creds from the binding
worker](#passing-cf-gateway--provider-creds-from-the-binding-worker)
below for the full `configure()` API.

### Passing CF gateway + provider creds from the binding worker

Cross-script bindings cannot inject env vars into the host worker that
owns the DO. To support deployments where credentials live with the
*consumer* worker (e.g., loaded from its own `.dev.vars` or secrets),
`SessionDO` exposes a `configure()` RPC that merges per-DO overrides on
top of the host's `this.env` and persists them in DO storage.

```ts
import type { SessionDO, SessionConfigOverrides } from "@opencode-do/opencode"

const stub = env.SESSION_DO.get(env.SESSION_DO.idFromName("main")) as DurableObjectStub<SessionDO>

// Push the consumer worker's creds into the DO once (e.g., on cold-start,
// or whenever they change). Persisted across DO eviction.
await stub.configure({
  CLOUDFLARE_ACCOUNT_ID:  env.CLOUDFLARE_ACCOUNT_ID,
  CLOUDFLARE_GATEWAY_ID:  env.CLOUDFLARE_GATEWAY_ID,
  CLOUDFLARE_API_TOKEN:   env.CLOUDFLARE_API_TOKEN,
  ANTHROPIC_API_KEY:      env.ANTHROPIC_API_KEY,        // optional
  OPENCODE_DIRECTORY:     env.OPENCODE_DIRECTORY,        // optional
  defaultModel: { providerID: "anthropic", modelID: "claude-sonnet-4-20250514" },
} satisfies SessionConfigOverrides)
```

Overrides win over the host's `this.env`. Pass `undefined`/`null` for a
field to clear it (the merge falls through to the host env). Read the
currently-applied overrides with `await stub.getConfig()`.

Recognised override fields (all optional):

| Field | Purpose |
|---|---|
| `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_API_KEY` | Provider keys for the direct path |
| `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_GATEWAY_ID`, `CLOUDFLARE_API_TOKEN`, `CF_AIG_TOKEN` | AI Gateway routing (takes precedence over direct keys) |
| `OPENCODE_DIRECTORY` | Working directory reported via `/path` |
| `defaultModel` | `{ providerID, modelID }` used when a new session is created without a model |
| `defaultSpace` | SpaceDO name used by sessions that haven't been explicitly attached via `attachSpace()` |

Because overrides are persisted, the consumer only needs to call
`configure()` when values change — not on every request.

## Consuming code-generation events (no shims required)

`SessionDO` already implements the OpenCode SSE protocol. Any consumer —
your own UI, a webhook bridge, the stock TUI — connects to the same
`GET /event` endpoint and receives the full event stream. You do **not**
need to import `Bus`, write a subscriber shim, or bundle the library to
read events: forwarding the request to the DO stub is enough.

### From the same worker

```ts
import type { Env } from "@opencode-do/opencode"
export { SessionDO, SpaceDO } from "@opencode-do/opencode"

export default {
  async fetch(req: Request, env: Env) {
    const url = new URL(req.url)
    if (url.pathname === "/event" || url.pathname.startsWith("/session/")) {
      const stub = env.SESSION_DO.get(env.SESSION_DO.idFromName("main"))
      return stub.fetch(req)   // DO returns a streaming Response
    }
    return new Response("not found", { status: 404 })
  },
} satisfies ExportedHandler<Env>
```

### From a separate worker (cross-script binding)

Same call pattern — `script_name` makes the stub resolve to the host
worker:

```ts
const stub = env.SESSION_DO.get(env.SESSION_DO.idFromName("main"))
return stub.fetch(new Request("https://do/event", { method: "GET" }))
```

Pass `?global=1` (or hit `/global/event` on the upstream-compatible app)
when the consumer is the stock TUI binary, which filters events on
`directory === "global"`.

### Event payload shape

Each SSE `data:` line is a JSON event matching the upstream
`BusEventPayload` shape:

```jsonc
{
  "id": "evt_018f...",
  "type": "message.part.updated",
  "properties": {
    "sessionID": "ses_...",
    "part": { /* StoredPart */ }
  }
}
```

Event types you'll typically handle:

| `type` | When | Useful for |
|---|---|---|
| `session.updated` | Session created/renamed/finished | UI session list refresh |
| `message.updated` | Assistant message info changes (cost, tokens, finish) | Progress + final state |
| `message.part.updated` | A part transitions state (`text`, `tool`, `reasoning`, `step-start`, `step-finish`) | Render tool calls / per-step UI |
| `message.part.delta` | Incremental text/reasoning delta | Token-by-token streaming |
| `session.status` | Busy ↔ idle | Spinner / busy indicator |

Strongly-typed consumers can import the part/message types directly:

```ts
import type { StoredMessage, StoredPart } from "@opencode-do/opencode"
```

### Reading history without streaming

For UIs that just need the current state of a session (e.g. a server-side
render), call the DO's REST endpoint instead of subscribing:

```ts
const stub = env.SESSION_DO.get(env.SESSION_DO.idFromName("main"))
const res  = await stub.fetch(new Request(`https://do/session/${id}/message`))
const messages: StoredMessage[] = await res.json()
```

This returns the same `StoredMessage[]` shape used in the SSE
`message.updated` events, so consumers can share a single renderer.

## HTTP contract

Both DOs are addressed by forwarding a `Request` to a stub returned from
`env.SESSION_DO.get(...)` / `env.SPACE_DO.get(...)`. Routes the DOs
themselves handle:

| DO | Path | Notes |
|---|---|---|
| SessionDO | `GET /event` | SSE event stream (set `?global=1` for `directory: "global"` wrapping) |
| SessionDO | `POST /session/:id/message` | Submit a prompt; streams response |
| SessionDO | `GET /session/:id/message` | Read message history (returns `StoredMessage[]`) |
| SessionDO | `GET /test-stream` | Diagnostic streaming endpoint |
| SpaceDO | `GET\|POST /repo.git/*` | Git Smart HTTP (clone/push) |
| SpaceDO | `* /preview/:branch[/*]` | Dynamic Worker preview for a deployed branch |
| SpaceDO | `* /*` | RPC-style file/git operations (see SpaceDO methods) |

For cross-DO traffic within a single worker, prefer DO RPC (`stub.fetch`
or typed RPC methods) over re-routing through HTTP.

## RPC surface (SessionDO)

Methods callable on a `DurableObjectStub<SessionDO>`. All are typed when
the stub is cast as `DurableObjectStub<SessionDO>` so the consumer gets
autocomplete + return types without an extra wrapper layer.

| Method | Purpose |
|---|---|
| `configure(overrides)` | Merge per-DO env overrides (gateway creds, provider keys, `defaultModel`, `defaultSpace`, …). Persisted across eviction. |
| `getConfig()` | Return the currently-applied overrides. |
| `attachSpace(sessionId, spaceName)` | Bind a SpaceDO to a session. Idempotent. Auto-registers in `known_spaces`. |
| `createSessionAndBroadcast(id?, title?)` | Create a session and emit `session.created` + `session.updated` SSE events. Returns the session info. |
| `prompt(sessionId, body, host)` | Fire-and-forget prompt submission. Returns `null` on accept or an error string. |
| `promptWait(sessionId, body, host)` | Same as `prompt` but awaits the assistant message. Returns `StoredMessage` or error string. |
| `getMessagesForSession(sessionId)` | Read message history synchronously (same shape as `GET /session/:id/message`). |
| `getSessionById(id)` / `listSessions()` | Session metadata accessors. |
| `getSessionSpaces(sessionId)` / `listAllSpaces()` | Inspect session↔space bindings. |

See `src/session/durable-object.ts` for full signatures.

## Building

```bash
npm run build       # esbuild → dist/index.js + dist/index.d.ts
npm run typecheck
```
