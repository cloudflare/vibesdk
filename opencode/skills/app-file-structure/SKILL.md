---
name: cloudflare-bundler-apps
description: Author Cloudflare Worker Bundler-compatible apps that build and preview correctly inside an opencode space. Use this skill whenever you scaffold, modify, or deploy a project that will be built with `@cloudflare/worker-bundler` (i.e. anything served from `/space/:name/preview/:branch/`). Covers wrangler config, project layout, static asset rules, server entry conventions, npm dependency limits, and the most common cause of blank previews (JSX in browser scripts).
---

This skill teaches how to build apps that deploy cleanly through the opencode space deploy pipeline. Every project committed to a space is built by `@cloudflare/worker-bundler` (`createApp` when there are static assets, `createWorker` when there are none) and served on a Dynamic Worker via `WorkerLoader`. Get the conventions right and the preview "just works". Get them wrong and you get a blank page, a 500, or a `Build failed` error.

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

## Server entry conventions

The server must use the standard ES module Worker format:

```ts
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "content-type": "application/json" }
      });
    }
    return new Response("Not found", { status: 404 });
  }
};
```

Or with Hono:

```ts
import { Hono } from "hono";
const app = new Hono();
app.get("/api/hello", (c) => c.json({ msg: "hi" }));
export default app;
```

When `[assets]` is configured, static files take priority — your `fetch` handler only sees requests that didn't match an asset. So for a SPA, put `index.html` in `public/` and the worker only handles `/api/*`.

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
3. **`@babel/standalone`** — only for prototypes. Load Babel **before** the script and use `type="text/babel"`:

   ```html
   <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
   <script type="text/babel" data-type="module" data-presets="react">
     import React from "https://esm.sh/react@18";
     const App = () => <div>hi</div>;
   </script>
   ```

   `data-type="module"` is required for `import` to work inside the Babel script.

### Other asset gotchas

- **Binary assets are not extracted from npm packages.** Fonts, images, and `.wasm` shipped via npm tarballs will be missing. Put binaries directly in `public/` instead.
- **Paths in JS need care under preview**: prefer `import.meta.url`, relative paths, or a runtime base detected from `document.baseURI`. Don't hard-code `/api/...` in client code; use `./api/...` or read a base from a `<meta>` tag.
- **Trailing slashes matter** for `auto-trailing-slash` mode: `/about` serves `about.html`, `/about/` serves `about/index.html`. Pick one shape and link consistently.
- **No CSS preprocessors at runtime** — ship `.css`, not `.scss`. Compile first if you need Sass.
- **Importmaps work** since they're inline JSON. Use them to avoid bundling React/etc. for prototypes:

  ```html
  <script type="importmap">
    { "imports": { "react": "https://esm.sh/react@18.2.0" } }
  </script>
  ```

## npm dependencies

The bundler installs deps from npm at build time. Limits to respect:

- **Flat node_modules.** No two versions of the same package can coexist — peer-dep conflicts will pick one and break the other. Keep dep graphs shallow.
- **Text-only files** are extracted from tarballs. `.js`, `.ts`, `.json`, `.css`, `.md` work. `.wasm`, `.node`, native binaries, fonts, images do not.
- **No PAX tar headers** — packages whose internal paths exceed 100 chars may have those files silently dropped. Avoid deeply-nested monorepo packages.
- **No build scripts run** — `postinstall`, `prepare`, etc. are ignored. Packages that compile native code or run codegen at install time will not work.
- **`cloudflare:*` imports are always external** and resolved by the runtime (`cloudflare:workers`, etc.). Don't add them to `package.json`.

Safe and well-tested deps: `hono`, `zod`, `itty-router`, `nanoid`, `valibot`, `@hono/zod-validator`. Avoid anything that needs node-native modules unless you set `compatibility_flags: ["nodejs_compat"]` and the package is pure JS under that flag.

## Choosing build mode

| Project shape                       | What runs                  | What you need                                    |
| ----------------------------------- | -------------------------- | ------------------------------------------------ |
| Pure static site (HTML+JS+CSS)      | `createApp` (assets only)  | `wrangler.json` with `[assets]`, files in public |
| SPA + API                           | `createApp`                | Server `main` + `[assets]` with SPA not-found    |
| Worker only (JSON API, no frontend) | `createWorker`             | Server `main`, no `[assets]`                     |
| Worker + DO                         | `createApp` / `createWorker` | Export DO class from `main`; loader picks it up |

If you need a Durable Object inside the deployed app, export it as a named class from the server module. The preview is mounted as a regular Worker fetch, so DOs only work if the app's host code in `main` instantiates them via a binding declared in its own wrangler config — note this is more advanced and most prototypes don't need it.

## Pre-flight checklist before `deploy_space`

Run through every item — most "preview is broken" reports trace back to one of these.

- `wrangler.json` exists at repo root with `main` and (if static assets exist) `[assets].directory`.
- Every browser-loaded `.js` / `.mjs` / `<script type="module">` is **plain JS, no JSX**, or wrapped with `@babel/standalone` + `type="text/babel"`.
- Static files live under the configured `assets.directory` (default suggestion: `public/`).
- HTML uses root-relative paths (`/foo.js`) — they get rewritten. JS uses relative paths (`./foo`).
- No binary assets are imported from npm packages. Binaries live in `public/`.
- `package.json` deps are pure-JS, no native modules, no install scripts.
- SPA routing? Set `not_found_handling: "single-page-application"`.
- Server entry uses `export default { fetch }` (or a Hono/itty-router app that exports one).
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
import { Hono } from "hono";
const app = new Hono();
app.get("/api/time", (c) => c.json({ now: new Date().toISOString() }));
export default app;
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
```

Note `./api/time` (relative) in JS, `/style.css` (root-relative) in HTML. The HTML href is rewritten by the preview; the JS fetch resolves against the document's base URL.

Commit this, call `deploy_space("main")`, and the preview at `/space/<name>/preview/main/` will render the timestamp.
