# @space-do/space

A reusable Cloudflare Durable Object class — `SpaceDO` — that provides a
git-backed, isolated workspace with preview and deploy support on the Workers
runtime. It is the file/preview/deploy backend used by VibeSDK's `think`
agent (the agentic loop itself lives in the `@cloudflare/think` `ThinkAgent`).

## Install

```bash
npm install @space-do/space
```

Peer expectations: `compatibility_date >= 2024-09-23` and
`compatibility_flags = ["nodejs_compat"]`. The class uses the SQLite-backed
Durable Object storage API and requires a `LOADER` (Worker Loader) binding
for deployment previews.

## Usage

Re-export `SpaceDO` from your worker entrypoint and declare it in
`wrangler.toml`:

```ts
// src/worker.ts
import type { Env } from "@space-do/space"
export { SpaceDO } from "@space-do/space"
```

```toml
[[durable_objects.bindings]]
name = "SPACE_DO"
class_name = "SpaceDO"

[[worker_loaders]]
binding = "LOADER"   # required by SpaceDO's deploy engine

[[migrations]]
tag = "v1"
new_sqlite_classes = ["SpaceDO"]
```

Each named `SpaceDO` instance is an isolated filesystem + git repo. Address it
by forwarding a `Request` to a stub from `env.SPACE_DO.get(...)`, or call its
typed RPC methods directly via DO RPC.

## HTTP contract

| Path | Notes |
|---|---|
| `GET\|POST /repo.git/*` | Git Smart HTTP (clone/push) |
| `* /preview/:branch[/*]` | Dynamic Worker preview for a deployed branch |
| `* /*` | RPC-style file/git operations (see `src/space/durable-object.ts`) |

## App database inspector

The LLM-generated app exports `class App extends DurableObject`. `SpaceDO`
hosts it as a Facet and exposes a read-only inspector via the
`listAppTables` / `queryAppTable` / `wipeAppDatabase` RPC methods. The
result types are exported for typed consumers:

```ts
import type {
  AppDatabaseTable,
  AppDatabaseColumn,
  AppDatabaseReadResult,
} from "@space-do/space"
```

## Building

```bash
npm run build       # esbuild → dist/index.js
npm run typecheck
```
