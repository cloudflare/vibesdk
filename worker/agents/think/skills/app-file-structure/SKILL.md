---
name: cloudflare-bundler-apps
description: Author Cloudflare Worker Bundler-compatible apps that build and preview correctly inside a space. Use this skill whenever you scaffold, modify, or deploy a project that will be built with `@cloudflare/worker-bundler` (i.e. anything served from `/space/:name/preview/:branch/`). Covers wrangler config, project layout, static asset rules, server entry conventions, npm dependency limits, and the most common cause of blank previews (JSX in browser scripts).
---

This skill teaches how to build apps that deploy cleanly through the space deploy pipeline. Every project committed to a space is built by `@cloudflare/worker-bundler` (`createApp` when there are static assets, `createWorker` when there are none) and served on a Dynamic Worker via `WorkerLoader`. Get the conventions right and the preview "just works". Get them wrong and you get a blank page, a 500, or a `Build failed` error.

## How the pipeline works

When `deploy_space(branch)` is called, the space DO:

1. Reads every file from the branch's working tree (skipping `.git/`).
2. Parses `wrangler.json` / `wrangler.jsonc` / `wrangler.toml` for `main`, `compatibility_date`, `compatibility_flags`, and `[assets]`.
3. If `[assets].directory` is set, files under that directory become static assets served host-side by `handleAssetRequest`. Everything else is built into a Worker via `createApp` (with `server: <main>`).
4. If no assets directory is configured, only `createWorker({ entryPoint: <main> })` is run. The output is loaded as a Dynamic Worker; all requests go to the Worker.
5. Previews are served at `/space/:name/preview/:branch/*`. Responses with `content-type: text/html` are run through `HTMLRewriter`, which prefixes root-relative `src` / `href` / `action` attributes with the preview base path. **JS-side fetches and dynamic imports are NOT rewritten.**

Practical consequences:

- **You can rely on root-relative `src="/foo.js"` and `href="/style.css"` in HTML.** They will be rewritten to the preview path automatically.
- **You cannot rely on root-relative paths inside JS strings**: `fetch("/api/x")`, `new URL("/foo", location.origin)`, dynamic `import("/lib.js")`. These hit the wrong path under the preview prefix. Use relative paths (`./api/x`, `import.meta.url`) or read the base path from `<base href>` / a meta tag injected at build time.
- The `<base href>` tag is also rewritten if present — using it lets all relative URLs resolve against the preview path.

## Project layout

A typical full-stack space project:

```
/
├── wrangler.json          # required for non-trivial setups
├── package.json           # npm deps (text-only packages, see limits below)
├── src/
│   └── index.ts           # server entry: export default { fetch }
└── public/                # static assets directory (configurable)
    ├── index.html
    ├── app.js             # compiled, no JSX
    └── styles.css
```

A static-only SPA can skip `src/` entirely — just `wrangler.json` + `public/` is enough as long as `main` points to a minimal pass-through worker or you accept that all requests fall through assets.

## Wrangler config

Minimum viable `wrangler.json`:

```json
{
  "main": "src/index.ts",
  "compatibility_date": "2025-04-01",
  "assets": {
    "directory": "./public",
    "html_handling": "auto-trailing-slash",
    "not_found_handling": "single-page-application"
  }
}
```

Notes:

- `main` is required when there's any server code. The bundler also auto-detects `src/index.ts`, `src/index.js`, `index.ts`, `index.js` if missing.
- `compatibility_date` defaults to `2025-04-01` if omitted. Set it explicitly for newer features.
- Add `"compatibility_flags": ["nodejs_compat"]` only if you actually need Node built-ins.
- `assets.directory` is the **only** way to ship static files. Files outside this directory are bundled into the Worker or ignored — they will **not** be reachable via URL.
- `html_handling: "auto-trailing-slash"` is usually what you want for multi-page sites; SPAs should also set `not_found_handling: "single-page-application"` so deep links return `index.html`.

TOML works too (`wrangler.toml`), but the parser only handles top-level scalar fields plus an `[assets]` table — no inline tables, no env overrides. Prefer JSON.

## Server entry: one Durable Object class named `App`

**Your entire backend is one Durable Object.** Your main module exports
a class named `App` extending `DurableObject`. The platform loads it as
a [Cloudflare Durable Object
Facet](https://developers.cloudflare.com/dynamic-workers/usage/durable-object-facets/)
of the host SpaceDO and forwards every non-asset request — including
WebSocket upgrades — to your `App.fetch(request)`.

**Do not `export default { fetch }`.** A default fetch handler will be
ignored. There is no separate worker; the DO is the worker.

```ts
// src/index.ts
import { DurableObject } from "cloudflare:workers";

export class App extends DurableObject {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Lazy schema init on the first request. Idempotent.
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        body TEXT NOT NULL
      )
    `);

    if (url.pathname === "/api/notes" && request.method === "POST") {
      const { body } = await request.json<{ body: string }>();
      this.ctx.storage.sql.exec(`INSERT INTO notes (body) VALUES (?)`, body);
      return new Response(null, { status: 201 });
    }
    if (url.pathname === "/api/notes") {
      const rows = this.ctx.storage.sql
        .exec(`SELECT id, body FROM notes ORDER BY id DESC`)
        .toArray();
      return Response.json(rows);
    }
    return new Response("Not found", { status: 404 });
  }
}
```

Or with Hono inside the DO:

```ts
import { DurableObject } from "cloudflare:workers";
import { Hono } from "hono";

export class App extends DurableObject {
  private app = new Hono()
    .get("/api/hello", (c) => c.json({ msg: "hi" }))
    .post("/api/notes", async (c) => {
      const { body } = await c.req.json<{ body: string }>();
      this.ctx.storage.sql.exec(`INSERT INTO notes (body) VALUES (?)`, body);
      return c.json({ ok: true });
    });

  async fetch(request: Request) {
    return this.app.fetch(request);
  }
}
```

When `[assets]` is configured, static files take priority — your `fetch`
only sees requests that didn't match an asset. For a SPA, put
`index.html` in `public/` and `App.fetch` only handles `/api/*`.

### State and storage

State lives on `this.ctx.storage`. No `env.DB` exists; you do not need
to declare any binding. The DO's storage is a per-(space, branch)
SQLite database that survives redeploys.

- `this.ctx.storage.sql.exec(sql, ...params)` — full SQLite. Returns a
  cursor with `.toArray()`, `.one()`, `.columnNames`, etc.
- `this.ctx.storage.kv.get(key)` / `.put(key, value)` — simple KV
  backed by SQLite.
- `this.ctx.storage.transactionSync(() => { ... })` — atomic batch
  inside the same DO instance.

```ts
// SQL
this.ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS counter (n INTEGER)`);
const cur = this.ctx.storage.sql.exec(`SELECT n FROM counter LIMIT 1`).toArray();
const n = (cur[0]?.n as number) ?? 0;

// KV
const last = this.ctx.storage.kv.get<number>("last_seen") ?? 0;
this.ctx.storage.kv.put("last_seen", Date.now());
```

**Use the DO's storage for all persistent state** — users, sessions,
content, settings, anything that should survive a reload. Do not use
`localStorage` or `sessionStorage` for primary data; they are
per-browser, per-origin, and lost on incognito or any other browser.

### WebSockets

The platform forwards `Upgrade: websocket` requests transparently into
`App.fetch`. Use the standard Durable Object hibernation API:

```ts
export class App extends DurableObject {
  async fetch(request: Request) {
    const upgrade = request.headers.get("Upgrade");
    if (upgrade === "websocket") {
      const { 0: client, 1: server } = new WebSocketPair();
      this.ctx.acceptWebSocket(server);
      return new Response(null, { status: 101, webSocket: client });
    }
    return new Response("not found", { status: 404 });
  }

  webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    // Broadcast to every connected client (chat-style fan-out).
    for (const peer of this.ctx.getWebSockets()) {
      peer.send(typeof message === "string" ? message : new Uint8Array(message));
    }
  }

  webSocketClose(_ws: WebSocket, _code: number, _reason: string, _wasClean: boolean) {
    // Cleanup if needed.
  }
}
```

`acceptWebSocket` + `webSocketMessage` is the right pattern for
multi-connection use cases (chat rooms, multiplayer, presence) because
the DO can hibernate between messages without losing connections.

### Per-entity grouping (chat rooms, per-user records)

You get **one App DO per (space, branch)** — a single instance, not a
namespace. Do not call `idFromName` or try to declare a DO binding in
`wrangler.json`; both are rejected. For multi-room / multi-user state,
**partition rows with a column** in the App's SQLite:

```sql
CREATE TABLE messages (
  room_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  body TEXT NOT NULL,
  ts INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
);
CREATE INDEX messages_by_room ON messages (room_id, ts);
```

Then route by `room_id` inside `App.fetch`. SQLite is fast enough that
sharing the same table across rooms is fine for prototyping; if you
later need stronger isolation, attach `room_id` to a tag and use
`acceptWebSocket(ws, [room_id])` so `getWebSockets(room_id)` returns
only that room's sockets.

### What you cannot declare

- **`durable_objects.bindings` in `wrangler.json`.** The platform
  extracts your `App` class automatically. Adding bindings fails the
  deploy with a clear error.
- **`new_sqlite_classes` / migrations.** Same reason. Your App's
  storage is set up by the platform.
- **`d1_databases`, `r2_buckets`, `kv_namespaces`.** Not available.
  Everything goes in `this.ctx.storage`.

## Static asset rules (read this twice)

This is where most preview failures happen. The browser eventually runs your assets — the bundler does **not** transform them. So:

### **NEVER ship JSX in a `<script type="module">` (or any other script tag).** Browsers cannot parse JSX.

This page **will be blank** with a `SyntaxError: Unexpected token '<'`:

```html
<script type="module">
  import React from "https://esm.sh/react@18";
  const App = () => <div>hi</div>;   // ← browser dies here
</script>
```

Fix one of these three ways:

1. **Pre-compile** — write JSX in a build step (Vite/esbuild/tsup) and emit plain JS into `public/`. Best for production.
2. **`React.createElement` by hand** — works without a build step but is verbose.
3. **`@babel/standalone`** — only for prototypes. Load Babel **before** the script and use `type="text/babel"`. The modern `@babel/preset-react` defaults to the **automatic JSX runtime**, which emits `import { jsx } from "react/jsx-runtime"`. Browsers will reject that bare specifier unless your importmap maps it. **Always ship a complete importmap alongside the Babel script:**

   ```html
   <script type="importmap">
   {
     "imports": {
       "react": "https://esm.sh/react@18.3.1",
       "react/jsx-runtime": "https://esm.sh/react@18.3.1/jsx-runtime",
       "react-dom": "https://esm.sh/react-dom@18.3.1",
       "react-dom/client": "https://esm.sh/react-dom@18.3.1/client"
     }
   }
   </script>
   <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
   <script type="text/babel" data-type="module" data-presets="react">
     import React from "react";
     import { createRoot } from "react-dom/client";
     const App = () => <div>hi</div>;
     createRoot(document.getElementById("root")).render(<App />);
   </script>
   ```

   `data-type="module"` is required for `import` to work inside the Babel script. Import React from the importmap key (`"react"`) — not from a hard-coded `esm.sh` URL — so your code and Babel's emitted `react/jsx-runtime` import resolve to the **same** React instance.

   If you really cannot ship `react/jsx-runtime` in the importmap, force Babel to the legacy classic runtime instead so it emits `React.createElement` calls and never touches `react/jsx-runtime`:

   ```html
   <script
     type="text/babel"
     data-type="module"
     data-presets="react"
     data-plugins='[["transform-react-jsx", { "runtime": "classic" }]]'
   >
     import React from "https://esm.sh/react@18.3.1";  /* must be in scope */
     const App = () => <div>hi</div>;
   </script>
   ```

   The classic runtime requires `React` to be in lexical scope (because `<div>` becomes `React.createElement("div")`). The automatic runtime (default) does not, but needs `react/jsx-runtime` resolvable.

### Symptom-to-fix index

| Console error | Cause | Fix |
| --- | --- | --- |
| `Uncaught SyntaxError: Unexpected token '<'` (inside `<script type="module">`) | JSX shipped raw to the browser | Pre-compile, or use `@babel/standalone` with `type="text/babel"` |
| `Uncaught TypeError: Failed to resolve module specifier "react/jsx-runtime". Relative references must start with either "/", "./", or "../".` | Automatic JSX runtime emits `import "react/jsx-runtime"` but importmap doesn't map it | Add `"react/jsx-runtime": "https://esm.sh/react@<same-version>/jsx-runtime"` to the importmap **before** the Babel/script tag — or force the classic runtime (see above) |
| `Uncaught TypeError: Failed to resolve module specifier "react"` (or any bare name) | No importmap entry for that package | Add it to the importmap; importmap script tag must appear **before** any module script that uses the specifier |
| `TypeError: Cannot read properties of null (reading 'useContext')` | Dual-React (two copies loaded) | Append `?external=react,react-dom` to every esm.sh URL with React as a peer dep — see the dual-React trap below |

### Other asset gotchas

- **Binary assets are not extracted from npm packages.** Fonts, images, and `.wasm` shipped via npm tarballs will be missing. Put binaries directly in `public/` instead.
- **Paths in JS need care under preview**: prefer `import.meta.url`, relative paths, or a runtime base detected from `document.baseURI`. Don't hard-code `/api/...` in client code; use `./api/...` or read a base from a `<meta>` tag.
- **Trailing slashes matter** for `auto-trailing-slash` mode: `/about` serves `about.html`, `/about/` serves `about/index.html`. Pick one shape and link consistently.
- **No CSS preprocessors at runtime** — ship `.css`, not `.scss`. Compile first if you need Sass.
- **Importmaps work** since they're inline JSON. Use them to avoid bundling React/etc. for prototypes — but watch the dual-React trap below.

### The dual-React trap (the #1 cause of "blank page + `useContext` is null`)

`esm.sh` bundles a package's peer dependencies *into the package itself* unless you tell it otherwise. So this importmap looks correct but ships **two copies of React** — one for your app, another nested inside `framer-motion`:

```html
<!-- BROKEN: framer-motion has its own React inside, hooks crash with `Cannot read properties of null (reading 'useContext')` -->
<script type="importmap">
{
  "imports": {
    "react": "https://esm.sh/react@18.2.0",
    "react-dom": "https://esm.sh/react-dom@18.2.0/client",
    "framer-motion": "https://esm.sh/framer-motion@11"
  }
}
</script>
```

The symptom is exactly: blank background + console errors like

```
TypeError: Cannot read properties of null (reading 'useContext')
  at u (SwitchLayoutGroupContext.mjs:1:1)
```

because the nested React instance has no provider in the tree.

**Fix: append `?external=react,react-dom` (and any other shared peers) to every esm.sh URL that has React as a peer dep.** Pin the exact same React version everywhere too.

```html
<!-- CORRECT: one React shared across the whole importmap -->
<script type="importmap">
{
  "imports": {
    "react": "https://esm.sh/react@18.3.1",
    "react/jsx-runtime": "https://esm.sh/react@18.3.1/jsx-runtime",
    "react-dom": "https://esm.sh/react-dom@18.3.1",
    "react-dom/client": "https://esm.sh/react-dom@18.3.1/client",
    "framer-motion": "https://esm.sh/framer-motion@11?external=react,react-dom",
    "lucide-react": "https://esm.sh/lucide-react@0.400.0?external=react,react-dom"
  }
}
</script>
```

Apply `?external=...` to **every** React-consuming dep (UI libraries, icon sets, animation libs, headless components). Same rule for `vue`, `solid-js`, etc. if you swap the framework.

If a project needs more than two or three of these packages, stop using the importmap path — switch to option 1 (pre-compile with Vite/esbuild) so the bundler can dedupe React for you.

## npm dependencies

The bundler installs deps from npm at build time. Limits to respect:

- **Flat node_modules.** No two versions of the same package can coexist — peer-dep conflicts will pick one and break the other. Keep dep graphs shallow.
- **Text-only files** are extracted from tarballs. `.js`, `.ts`, `.json`, `.css`, `.md` work. `.wasm`, `.node`, native binaries, fonts, images do not.
- **No PAX tar headers** — packages whose internal paths exceed 100 chars may have those files silently dropped. Avoid deeply-nested monorepo packages.
- **No build scripts run** — `postinstall`, `prepare`, etc. are ignored. Packages that compile native code or run codegen at install time will not work.
- **`cloudflare:*` imports are always external** and resolved by the runtime (`cloudflare:workers`, etc.). Don't add them to `package.json`.

Safe and well-tested deps: `hono`, `zod`, `itty-router`, `nanoid`, `valibot`, `@hono/zod-validator`. Avoid anything that needs node-native modules unless you set `compatibility_flags: ["nodejs_compat"]` and the package is pure JS under that flag.

## Project shapes

| Project shape                       | What you need                                                                          |
| ----------------------------------- | -------------------------------------------------------------------------------------- |
| Pure static site (HTML+JS+CSS only) | `wrangler.json` with `[assets]`, files in `public/`. No `main`. No App class.          |
| SPA + API                           | `[assets]` for the SPA, `main` exporting `class App extends DurableObject`             |
| API only (JSON, no frontend)        | `main` exporting `class App extends DurableObject`, no `[assets]`                      |
| Realtime (WebSocket / multiplayer)  | Same as SPA + API; `App.fetch` upgrades to WebSocket and uses `ctx.acceptWebSocket`    |

## Pre-flight checklist before `deploy_space`

Run through every item — most "preview is broken" reports trace back to one of these.

- `wrangler.json` exists at repo root with `main` and (if static assets exist) `[assets].directory`.
- Every browser-loaded `.js` / `.mjs` / `<script type="module">` is **plain JS, no JSX**, or wrapped with `@babel/standalone` + `type="text/babel"`.
- If you use React via importmap (Babel-standalone or pre-compiled with the automatic JSX runtime), the importmap maps **all** of `react`, `react/jsx-runtime`, `react-dom`, and `react-dom/client` — same version on every entry. Missing `react/jsx-runtime` produces `Failed to resolve module specifier "react/jsx-runtime"` and a blank page.
- The `<script type="importmap">` tag appears **before** any `<script type="module">` (or `type="text/babel" data-type="module"`) that depends on the mapped specifiers.
- Static files live under the configured `assets.directory` (default suggestion: `public/`).
- HTML uses root-relative paths (`/foo.js`) — they get rewritten. JS uses relative paths (`./foo`).
- No binary assets are imported from npm packages. Binaries live in `public/`.
- `package.json` deps are pure-JS, no native modules, no install scripts.
- SPA routing? Set `not_found_handling: "single-page-application"`.
- Server entry exports `class App extends DurableObject` from your `main` module (no `export default { fetch }`).
- No `durable_objects` / `d1_databases` / `kv_namespaces` / `r2_buckets` blocks in `wrangler.json`.
- `compatibility_date` is set if you use APIs newer than the default.

If any of these are off, fix them in the working tree, commit, and redeploy. The preview will pick up the new build on the next `deploy_space` call (the dynamic worker is keyed by commit hash, so old builds are not reused).

## Minimal end-to-end example

A working SPA with a tiny API:

```
wrangler.json
package.json
src/index.ts
public/index.html
public/app.js
public/style.css
```

`wrangler.json`:

```json
{
  "main": "src/index.ts",
  "compatibility_date": "2025-04-01",
  "assets": {
    "directory": "./public",
    "html_handling": "auto-trailing-slash",
    "not_found_handling": "single-page-application"
  }
}
```

`package.json`:

```json
{ "name": "demo", "type": "module", "dependencies": { "hono": "^4.6.0" } }
```

`src/index.ts`:

```ts
import { DurableObject } from "cloudflare:workers";
import { Hono } from "hono";

export class App extends DurableObject {
  private app = new Hono()
    .get("/api/time", (c) => c.json({ now: new Date().toISOString() }))
    .post("/api/visit", async (c) => {
      this.ctx.storage.sql.exec(
        `CREATE TABLE IF NOT EXISTS visits (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER)`
      );
      this.ctx.storage.sql.exec(`INSERT INTO visits (ts) VALUES (?)`, Date.now());
      const cnt = this.ctx.storage.sql
        .exec(`SELECT COUNT(*) AS c FROM visits`)
        .one().c as number;
      return c.json({ count: cnt });
    });

  async fetch(request: Request) {
    return this.app.fetch(request);
  }
}
```

`public/index.html`:

```html
<!doctype html>
<html>
<head>
  <link rel="stylesheet" href="/style.css">
</head>
<body>
  <div id="root">Loading…</div>
  <script type="module" src="/app.js"></script>
</body>
</html>
```

`public/app.js`:

```js
const res = await fetch("./api/time");
const data = await res.json();
document.getElementById("root").textContent = data.now;

// Increment + display visit counter (server state lives in App.ctx.storage.sql)
const v = await fetch("./api/visit", { method: "POST" }).then((r) => r.json());
document.getElementById("root").textContent += `  ·  visits: ${v.count}`;
```

Note `./api/time` (relative) in JS, `/style.css` (root-relative) in HTML. The HTML href is rewritten by the preview; the JS fetch resolves against the document's base URL.

Commit this, call `deploy_space("main")`, and the preview at `/space/<name>/preview/main/` will render the timestamp and an incrementing visit counter persisted in the App DO's SQLite.
