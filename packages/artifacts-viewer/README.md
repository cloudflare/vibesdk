# artifacts-viewer

A read-only repository browser for [Cloudflare Artifacts](https://developers.cloudflare.com/artifacts/). Ships a server-side proxy, a typed HTTP client, and unstyled React components.

Your Cloudflare API token stays on the server. The browser only ever talks to your own origin.

> Pre-1.0. The API is still moving; pin an exact version.

## Contents

- [artifacts-viewer](#artifacts-viewer)
  - [Contents](#contents)
  - [How it works](#how-it-works)
    - [Request flow](#request-flow)
  - [Install](#install)
  - [Quick start](#quick-start)
    - [1. Mount the router](#1-mount-the-router)
    - [2. Render the viewer](#2-render-the-viewer)
  - [`artifacts-viewer` — server router](#artifacts-viewer--server-router)
    - [Authorization](#authorization)
    - [Response behaviour](#response-behaviour)
    - [CORS](#cors)
  - [`artifacts-viewer/server/cache` — cache adapters](#artifacts-viewerservercache--cache-adapters)
  - [`artifacts-viewer/client` — typed client](#artifacts-viewerclient--typed-client)
  - [`artifacts-viewer/react` — components and hooks](#artifacts-viewerreact--components-and-hooks)
    - [Components](#components)
      - [`renderStatus` — loading, empty, and error states](#renderstatus--loading-empty-and-error-states)
    - [Hooks](#hooks)
    - [Building your own UI](#building-your-own-ui)
  - [Styling](#styling)
    - [Custom properties](#custom-properties)
    - [Selector hooks](#selector-hooks)
  - [Syntax highlighting](#syntax-highlighting)
    - [Loading](#loading)
      - [`renderCodeFallback` — what the wait looks like](#rendercodefallback--what-the-wait-looks-like)
      - [`preloadCodeView` — how long the wait is](#preloadcodeview--how-long-the-wait-is)
    - [Theming](#theming)
  - [Limits and behaviour](#limits-and-behaviour)
  - [Not included](#not-included)
  - [License](#license)

## How it works

```
browser                    your server                     Cloudflare
┌──────────────────┐      ┌──────────────────────┐      ┌──────────────┐
│ArtifactRepoViewer│      │ routeArtifactRequest │      │ Artifacts    │
│        ↓         │─────▶│  · validates         │─────▶│ REST API     │
│ ArtifactsClient  │      │  · adds API token    │      │              │
└──────────────────┘      │  · optional cache    │      └──────────────┘
     GET /artifacts/…     └──────────────────────┘        Bearer token
```

The router mirrors Cloudflare's namespace-relative paths 1:1 and proxies **only** these seven reads. `accountId` and `namespace` are deliberately absent from the browser-facing URL.

| Mounted route                                        | Purpose                                     |
| ---------------------------------------------------- | ------------------------------------------- |
| `GET {apiPath}/repos/{repo}`                         | Repository metadata                         |
| `GET {apiPath}/repos/{repo}/log?ref=&limit=&offset=` | Commit log                                  |
| `GET {apiPath}/repos/{repo}/commit/{hash}`           | One commit                                  |
| `GET {apiPath}/repos/{repo}/tree/{hash}`             | One directory level                         |
| `GET {apiPath}/repos/{repo}/blob/{hash}`             | File bytes by hash                          |
| `GET {apiPath}/repos/{repo}/file?ref=&path=`         | File bytes by path                          |
| `GET {apiPath}/repos/{repo}/raw/{ref}/{path}`        | File bytes with a browser-safe content type |

Nothing else is reachable. Writes, repository creation, and token endpoints are not proxied at all.

### Request flow

Rendering a repository takes two round trips, then goes content-addressed:

```
getLog({ limit: 1 })       →  commits[0].treeHash    (ref omitted = default branch)
readTree(commit.treeHash)  →  root entries
```

After that every navigation is addressed by git hash — `readTree(entry.hash)` for a directory, `readBlob(entry.hash)` for a file — so responses are immutable and cacheable forever.

## Install

```bash
npm install artifacts-viewer
# or
pnpm install artifacts-viewer
# or
bun install artifacts-viewer
```

`react` and `react-dom` are peer dependencies (`^18.2.0 || ^19.0.0`). `@pierre/diffs` is a direct dependency. It is split from the initial bundle and proactively prefetched when `ArtifactRepoViewer` mounts.

## Quick start

### 1. Mount the router

> **The router allows every request by default.** Add a `beforeRequest` policy before exposing this endpoint; otherwise anyone who can reach it can read any valid repository name in the configured namespace.

```ts
// worker/index.ts
import { routeArtifactRequest } from "artifacts-viewer";
import { createCacheApiAdapter } from "artifacts-viewer/server/cache";

export default {
  async fetch(request, env, ctx) {
    const handled = await routeArtifactRequest(request, {
      accountId: env.ARTIFACTS_ACCOUNT_ID,
      namespace: env.ARTIFACTS_NAMESPACE,
      apiToken: env.ARTIFACTS_API_TOKEN,
      beforeRequest: async ({ request, read }) => {
        const user = await getSessionUser(request);
        if (user === null || !user.repositories.includes(read.repoName)) {
          return new Response("Forbidden", { status: 403 });
        }
      },
      cache: createCacheApiAdapter({
        cache: caches.default,
        baseUrl: new URL(request.url).origin,
      }),
      waitUntil: (promise) => {
        ctx.waitUntil(promise);
      },
    });

    return handled ?? new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
```

`routeArtifactRequest` returns `null` when the request is outside `apiPath`, so you can fall through to your own routing.

If you serve static assets from the same Worker, route the API to the Worker first or the asset handler will answer instead:

```jsonc
// wrangler.jsonc
{
  "assets": {
    "not_found_handling": "single-page-application",
    "run_worker_first": ["/artifacts/*"],
  },
}
```

### 2. Render the viewer

```tsx
import { createArtifactsClient } from "artifacts-viewer/client";
import { ArtifactRepoViewer } from "artifacts-viewer/react";
import "artifacts-viewer/styles.css";

// Module scope: the hooks treat `client` as a dependency, so a new instance
// per render would refetch forever.
const client = createArtifactsClient();

export function Repository() {
  return <ArtifactRepoViewer client={client} repoName="my-repository" />;
}
```

## `artifacts-viewer` — server router

React-free and platform-neutral. Uses only `Request`, `Response`, `Headers`, `URL`, and `fetch`, so it runs on Workers, Node, Deno, or Bun.

```ts
function routeArtifactRequest(
  request: Request,
  options: ArtifactRouterOptions,
): Promise<Response | null>;
```

| Option          | Type                            | Notes                                                     |
| --------------- | ------------------------------- | --------------------------------------------------------- |
| `accountId`     | `string`                        | Required                                                  |
| `namespace`     | `string`                        | Required                                                  |
| `apiToken`      | `string`                        | Required. Cloudflare API token with Artifacts read access |
| `apiPath`       | `string`                        | Default `"/artifacts"`. Matched on a segment boundary     |
| `fetch`         | `typeof fetch`                  | Optional injection point for tests and tracing            |
| `beforeRequest` | `ArtifactBeforeRequestHook`     | Authorization hook. Return a `Response` to deny           |
| `cache`         | `ArtifactsCacheAdapter`         | Consulted for content-addressed reads only                |
| `waitUntil`     | `(p: Promise<unknown>) => void` | Keeps cache writes alive past the response                |
| `onCacheError`  | `(error: unknown) => void`      | Cache failures are reported here, never thrown            |

### Authorization

`beforeRequest` runs **before** the cache, so a cache hit can never bypass it.

```ts
beforeRequest: async ({ request, read, operation }) => {
  if (!(await mayRead(request, read.repoName))) {
    return new Response("Forbidden", { status: 403 });
  }
},
```

`read` is a fully validated discriminated union, so `read.repoName`, `read.hash`, `read.ref`, and `read.path` are safe to use in a policy decision.

### Response behaviour

- Outside `apiPath` → `null`.
- Inside `apiPath` but not a known route → `404`.
- Known route, wrong method → `405` with an `Allow` header.
- Malformed argument → `400`. Nothing is sent upstream.
- Errors use the Cloudflare v4 envelope, so the client has one parser.

Outbound requests are built from scratch with only `Accept` and `Authorization`. A caller's `Authorization`, `Cookie`, and every other inbound header are dropped. Response headers are copied through an allowlist (`Content-Type`, `Content-Length`, `Content-Disposition`, `ETag`, `Last-Modified`); bodies stream and are never buffered.

### CORS

Not handled. You own the response, so add headers after the call. Note that `OPTIONS` returns `405`, so intercept preflight before delegating:

```ts
if (request.method === "OPTIONS") return myPreflight(request);
```

## `artifacts-viewer/server/cache` — cache adapters

Only content-addressed reads (`commit`, `tree`, `blob`) are ever cached. Their values cannot become semantically stale, but the bundled Cache API and KV adapters use one-year freshness or expiration settings and either backend may evict an entry earlier. Ref-addressed reads are never cached.

```ts
type ArtifactsCacheAdapter = {
  get(key: string): Promise<Response | undefined>;
  set(key: string, response: Response): Promise<void>;
};
```

```ts
import { createCacheApiAdapter, createKvCacheAdapter } from "artifacts-viewer/server/cache";

createCacheApiAdapter({ cache: caches.default, baseUrl: new URL(request.url).origin });
createKvCacheAdapter({ kv: env.ARTIFACTS_CACHE });
```

`createCacheApiAdapter` is the recommended backend: it streams, so large blobs never sit in memory. `baseUrl` must be an origin your Worker actually serves — the Cache API is keyed by URL and scoped to the zone.

Adapters may throw. A failing cache degrades to a slower request, never a failed one.

## `artifacts-viewer/client` — typed client

Framework-independent and free of Worker globals.

```ts
const client = createArtifactsClient({
  apiPath: "/artifacts", // must match the router
  fetch: myFetch, // optional
});
```

Every asynchronous request method returns a result union rather than throwing. The synchronous `getRawUrl` helper returns a string:

```ts
type ArtifactsResult<T> = { ok: true; value: T } | { ok: false; error: ArtifactsClientError };

type ArtifactsClientError =
  | { kind: "network"; message: string; cause: unknown }
  | { kind: "not-found"; message: string }
  | { kind: "http"; message: string; status: number }
  | { kind: "malformed"; message: string };
```

| Method                                                 | Returns                     |
| ------------------------------------------------------ | --------------------------- |
| `getRepository({ repoName, signal? })`                 | `ArtifactsRepository`       |
| `getLog({ repoName, ref?, limit?, offset?, signal? })` | `ArtifactsCommitMetadata[]` |
| `readCommit({ repoName, hash, signal? })`              | `ArtifactsCommitMetadata`   |
| `readTree({ repoName, hash, signal? })`                | `ArtifactsTreeEntry[]`      |
| `readBlob({ repoName, hash, signal? })`                | `Response`                  |
| `readFile({ repoName, ref, path, signal? })`           | `Response`                  |
| `getRawUrl({ repoName, ref, path })`                   | `string` (synchronous)      |

Binary reads hand back the `Response` untouched, so you can stream it, size-check it, or discard it. Nothing is buffered or base64-encoded.

JSON payloads are narrowed field by field at the boundary — there are no type assertions — and repository metadata is normalized from the wire's snake_case to camelCase.

```ts
type ArtifactsTreeEntry = {
  name: string;
  mode: string;
  hash: string;
  type: "tree" | "blob" | "symlink" | "gitlink" | "exec";
};
```

`exec` and `symlink` behave like blobs. `gitlink` is a submodule pointer with no content in this repository, and renders as an inert row.

## `artifacts-viewer/react` — components and hooks

### Components

| Component               | Purpose                                                  |
| ----------------------- | -------------------------------------------------------- |
| `ArtifactRepoViewer`    | Two-pane browser: sidebar tree plus content pane         |
| `ArtifactFileTree`      | Lazily expanding sidebar tree                            |
| `ArtifactDirectoryView` | Flat listing of one directory                            |
| `ArtifactFileView`      | One file, with Raw/Download and content rendering        |
| `CodeView`              | Syntax-highlighted text, given contents you already have |

In `ArtifactRepoViewer` the content pane shows a file when one is selected, and a listing for any directory below the root. The root itself is left blank, because the sidebar already lists it and a second copy reads as a duplicate. `ArtifactDirectoryView` has no such rule — used directly, it lists whatever tree you give it.

`ArtifactRepoViewer` props:

| Prop                  | Type                                    | Notes                                                             |
| --------------------- | --------------------------------------- | ----------------------------------------------------------------- |
| `client`              | `ArtifactsClient`                       | Required. Keep the identity stable                                |
| `repoName`            | `string`                                | Required                                                          |
| `gitRef`              | `string`                                | Branch, tag, or commit. Omitted resolves the default branch       |
| `onSelect`            | `(s: ArtifactSelection) => void`        | Fires initially for root, then for each non-gitlink row selection |
| `buildHref`           | `(s: ArtifactSelection) => string`      | When set, rows render as `<a>` instead of `<button>`              |
| `icons`               | `Partial<ArtifactIconSlots>`            | `file`, `folder`, `folderOpen`, `submodule`                       |
| `className` / `style` | —                                       | Applied to the root                                               |
| `classNames`          | `Partial<Record<ArtifactSlot, string>>` | Per-slot classes                                                  |
| `colorMode`           | `"light" \| "dark" \| "system"`         | Emitted as `data-mode`                                            |
| `maxInlineBytes`      | `number`                                | Default `524288` (512 KiB)                                        |
| `pierreDiffsOptions`  | `ArtifactPierreDiffsOptions`            | Code-view theming                                                 |
| `renderCodeFallback`  | `ArtifactCodeFallbackRenderer`          | Placeholder shown while the code view is prepared                 |
| `renderStatus`        | `ArtifactStatusRenderers`               | Replaces the loading, empty, and error markup                     |

The prop is `gitRef`, not `ref`, because React reserves `ref`.

#### `renderStatus` — loading, empty, and error states

By default every pane renders a plain `<p>` with English text: `Loading repository…`,
`This directory is empty.`, `Binary file (12.4 KiB).`, and so on. `renderStatus`
replaces that markup, which is also how you localise the copy.

```tsx
<ArtifactRepoViewer
  client={client}
  repoName="website"
  renderStatus={{
    loading: (context) => <Spinner label={context.scope} />,
    empty: (context, kind) => <Notice kind={kind} scope={context.scope} />,
    error: (context, error) => <Notice tone="danger">{error.message}</Notice>,
  }}
/>
```

Every renderer receives a discriminated context, so one function can speak
differently per pane:

```ts
type ArtifactStatusContext =
  | { scope: "repository"; repoName: string }
  | { scope: "tree"; repoName: string; path: string }
  | { scope: "file"; repoName: string; path: string; name: string };

type ArtifactEmptyKind = "empty" | "binary" | "oversized";

type ArtifactStatusRenderers = {
  loading?: (context: ArtifactStatusContext) => ReactNode;
  empty?: (context: ArtifactStatusContext, kind?: ArtifactEmptyKind) => ReactNode;
  error?: (context: ArtifactStatusContext, error: ArtifactsClientError) => ReactNode;
};
```

`kind` is only set for files, because a repository or directory is already
identified by `context.scope`.

Three things worth knowing:

- **The map is partial.** A renderer returning `undefined` — including one you
  simply did not name — keeps the default. Return `null` to render nothing.
- **The slot survives.** Your output is wrapped in the matching slot element, so
  `data-artifacts-viewer-slot`, `aria-busy`, `role="alert"`, and `data-kind` are
  still there to target and still announced. You do not repeat them.
- **`renderStatus` is also accepted by** `ArtifactFileTree`, `ArtifactDirectoryView`,
  and `ArtifactFileView`, so it works when you compose the pieces yourself.

The code view is deliberately not covered by `renderStatus`: it waits on the
highlighter rather than the network, and [`renderCodeFallback`](#rendercodefallback--what-the-wait-looks-like)
already owns that placeholder.

### Hooks

Hooks return a discriminated state union — no `isLoading` booleans:

```ts
type ArtifactQueryState<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: T }
  | { status: "error"; error: ArtifactsClientError };
```

| Hook                                                                 | Returns                                     |
| -------------------------------------------------------------------- | ------------------------------------------- |
| `useArtifactRepository(client, repoName)`                            | `ArtifactsRepository`                       |
| `useArtifactLog(client, { repoName, ref?, limit?, offset? })`        | `ArtifactsCommitMetadata[]`                 |
| `useArtifactHeadCommit(client, repoName, ref?)`                      | `ArtifactsCommitMetadata \| null`           |
| `useArtifactTree(client, repoName, treeHash \| null)`                | `ArtifactsTreeEntry[]`                      |
| `useArtifactBlob(client, { repoName, name, hash, maxInlineBytes? })` | `ArtifactBlobRender`                        |
| `useArtifactQuery(run, deps)`                                        | Anything; the primitive the others build on |

**There is no cache and no request deduplication.** One request per dependency change, cancelled via `AbortSignal` when dependencies change or the component unmounts. Caching belongs to your data layer; pass a `fetch` that consults it, or wrap the client.

`useArtifactHeadCommit` resolves `null` for an empty repository. Do not use `lastPushAt` for this — the Artifacts API always returns `null` there.

`useArtifactBlob` produces the render classification:

```ts
type ArtifactBlobRender =
  | { kind: "empty" }
  | { kind: "text"; contents: string }
  | { kind: "image"; contentType: string }
  | { kind: "binary"; sizeBytes: number }
  | { kind: "oversized" };
```

### Building your own UI

The components are composable and customizable, and the hooks are public, so you can replace the markup entirely. `ArtifactRepoViewer` owns its current selection internally.

```tsx
function MyTree({ client, repoName, treeHash }) {
  const tree = useArtifactTree(client, repoName, treeHash);
  if (tree.status !== "success") return null;
  return (
    <ul>
      {tree.data.map((e) => (
        <li key={e.hash}>{e.name}</li>
      ))}
    </ul>
  );
}
```

## Styling

`artifacts-viewer/styles.css` is **structural only**. It picks no theme, and its main layout values are exposed as custom properties. Its selectors are intentionally low-specificity, using `:where()` for public hooks where practical, so ordinary application rules can override them without `!important`.

Import it once:

```ts
import "artifacts-viewer/styles.css";
```

### Custom properties

| Property                                | Default                  |
| --------------------------------------- | ------------------------ |
| `--artifacts-viewer-color`              | `inherit`                |
| `--artifacts-viewer-background`         | `transparent`            |
| `--artifacts-viewer-font`               | `inherit`                |
| `--artifacts-viewer-font-size`          | `inherit`                |
| `--artifacts-viewer-mono-font`          | `monospace`              |
| `--artifacts-viewer-muted-color`        | `inherit`                |
| `--artifacts-viewer-error-color`        | `inherit`                |
| `--artifacts-viewer-icon-color`         | `currentColor`           |
| `--artifacts-viewer-toolbar-background` | `inherit`                |
| `--artifacts-viewer-gap`                | `0.5rem`                 |
| `--artifacts-viewer-indent`             | `1rem`                   |
| `--artifacts-viewer-row-padding`        | `0.375rem 0.75rem`       |
| `--artifacts-viewer-sidebar-width`      | `16rem`                  |
| `--artifacts-viewer-pane-height`        | `none`                   |
| `--artifacts-viewer-pane-overflow`      | `visible`                |
| `--artifacts-viewer-image-max-height`   | `80vh`                   |
| `--artifacts-viewer-focus-outline`      | `2px solid currentColor` |
| `--artifacts-viewer-focus-offset`       | `-2px`                   |

```css
.my-viewer {
  --artifacts-viewer-font: ui-monospace, monospace;
  --artifacts-viewer-sidebar-width: 18rem;
  --artifacts-viewer-pane-height: 32rem;
  --artifacts-viewer-pane-overflow: auto;
  --artifacts-viewer-muted-color: #6b7280;
}
```

### Selector hooks

Public slots and parts carry stable attributes. Slots also accept a class through `classNames`; internal wrapper elements are not part of this selector contract.

`data-artifacts-viewer-slot`: `root`, `toolbar`, `sidebar`, `tree`, `treeItem`, `content`, `directory`, `directoryItem`, `file`, `loading`, `empty`, `error`

`data-artifacts-viewer-part`: `header`, `name`, `icon`, `actions`, `raw`, `download`, `code`, `code-pending`, `code-fallback`, `code-highlight`, `image`

State attributes:

| Attribute                    | Where                                                                       |
| ---------------------------- | --------------------------------------------------------------------------- |
| `data-artifacts-viewer-root` | The root element                                                            |
| `data-mode`                  | Root; mirrors `colorMode`                                                   |
| `data-kind`                  | Rows (`tree`, `blob`, `exec`, `symlink`, `gitlink`), and error/notice kinds |
| `data-selected`              | The selected row                                                            |
| `data-disabled`              | Submodule rows                                                              |

`data-selected` is a **bare** attribute, so match `[data-selected]` and not `[data-selected="true"]`:

```css
[data-artifacts-viewer-slot="treeItem"][data-selected] {
  background: #eef2ff;
}
```

The layout is container-query driven: the two panes collapse to one column below `40rem` of the root's own width, not the viewport's.

## Syntax highlighting

Text files render through [`@pierre/diffs`](https://www.npmjs.com/package/@pierre/diffs), which wraps Shiki. It is loaded with a dynamic `import()`, so neither Pierre nor Shiki lands in your initial bundle. `ArtifactRepoViewer` proactively starts fetching the chunk when it mounts.

### Loading

Unhighlighted text is never shown while highlighting is still on its way. Pierre paints an empty node if it is mounted before its theme and grammar are attached, so the code view waits for both, then reveals the highlighted copy only once it has real output. Placeholder and file share one grid cell, so nothing shifts.

Three states, in order:

| State       | Rendered                                                                                            |
| ----------- | --------------------------------------------------------------------------------------------------- |
| Preparing   | `renderCodeFallback`, or a loading message by default — `data-artifacts-viewer-part="code-pending"` |
| Ready       | The highlighted file — `data-artifacts-viewer-part="code-highlight"`                                |
| Unavailable | Plain `<pre>` holding the file contents — `data-artifacts-viewer-part="code-fallback"`              |

The unavailable state renders readable text when preloading reports that highlighting could not be initialized. It is not a general error boundary for failures after the lazy component starts rendering.

#### `renderCodeFallback` — what the wait looks like

A render prop, accepted by `ArtifactRepoViewer`, `ArtifactFileView`, and `CodeView`:

```tsx
<ArtifactRepoViewer
  client={client}
  repoName="my-repository"
  renderCodeFallback={({ name }) => <MySpinner label={`Preparing ${name}`} />}
/>
```

```ts
type ArtifactCodeFallbackRenderer = (file: { name: string; contents: string }) => ReactNode;
```

`contents` is the decoded file, so a skeleton can be sized to the real line count.

#### `preloadCodeView` — how long the wait is

**A function, not a prop.** It warms the lazy chunk, the shared Shiki engine, the themes, and — given a file name — that file's grammar.

```ts
import { preloadCodeView } from "artifacts-viewer/react";

await preloadCodeView({ theme: { light: "github-light", dark: "vesper" } });
```

`ArtifactRepoViewer` already calls it on mount, so warming overlaps with browsing the tree and the first file opened is usually highlighted straight away. Call it yourself to start earlier still — on route entry, or when a row is hovered:

```tsx
<li onPointerEnter={() => void preloadCodeView({ theme, name: entry.name })}>
```

Memoized per theme and grammar set, so repeat calls cost nothing. It resolves `boolean`; `false` means highlighting is unavailable, which is what makes the plain-text state above reachable.

### Theming

`@pierre/diffs` renders into an open Shadow DOM. **Your CSS cannot reach inside it.** Theming has to go through options:

```tsx
<ArtifactRepoViewer
  client={client}
  repoName="my-repository"
  pierreDiffsOptions={{
    theme: { light: "github-light", dark: "vesper" },
    themeType: "system",
  }}
/>
```

| Option      | Notes                                                                 |
| ----------- | --------------------------------------------------------------------- |
| `theme`     | A Shiki theme name, or a `{ light, dark }` pair                       |
| `themeType` | `"system"` (default), `"light"`, or `"dark"`                          |
| `unsafeCSS` | Raw CSS injected into the Shadow DOM. Unstable across Pierre releases |

Keep the object identity stable, or memoize it, to avoid re-rendering the code view.

## Limits and behaviour

**Large files.** `maxInlineBytes` defaults to 512 KiB. If the response declares a larger `Content-Length` the body is never downloaded. Otherwise the stream is read and cancelled the moment the cap is crossed. Either way the state becomes `oversized` and the Raw and Download links still work.

**Images** are detected from the file extension, so they never download through the client — they render straight from the raw URL via `<img src>`. SVG stays in image context and is never inlined. Recognized: `apng`, `avif`, `bmp`, `gif`, `ico`, `jfif`, `jpeg`, `jpg`, `png`, `svg`, `webp`.

**Text vs binary** is decided by a strict UTF-8 decode plus a NUL-byte scan over the first 8 KiB, not by an extension list. Anything that fails is `binary` and never reaches the highlighter.

**Raw and download URLs** are pinned to the commit hash rather than a branch name, so a link keeps resolving — and stays cacheable — even if someone pushes mid-session.

**Tree expansion** is keyed by path, not by tree hash, so two identical subtrees at different paths expand independently.

**Accessibility.** The sidebar is a `<nav>` of nested disclosure buttons rather than `role="tree"`, because full WAI-ARIA tree keyboard navigation is not implemented and claiming the role without it would be worse than not claiming it. Rows are real buttons, or real anchors when `buildHref` is supplied.

## Not included

Deliberately out of scope for now:

- **Markdown rendering.** `.md` files currently display as highlighted plain text.
- **Diff viewing** and commit history UI.
- **Branch switching.** The Artifacts REST API exposes no ref-listing operation; enumerating branches needs Git protocol v2 `ls-refs`. Pass a known branch to `gitRef`, or omit it for the default branch.
- **Writes** of any kind.

## License

MIT
