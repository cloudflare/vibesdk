# artifacts-viewer

## 0.0.5

### Patch Changes

- Add `renderStatus`, a partial slot map that replaces the default loading, empty, and error markup on `ArtifactRepoViewer`, `ArtifactFileTree`, `ArtifactDirectoryView`, and `ArtifactFileView`. Each renderer receives a discriminated `ArtifactStatusContext` so one function can branch per pane, and output is wrapped in the matching slot element so the data attributes and ARIA semantics survive.

## 0.0.4

### Patch Changes

- Ship package.json with catalog protocol ranges resolved so the published package installs outside this workspace.

## 0.0.3

### Patch Changes

- Remove Artifacts binding dispatch. Every read now goes over the official REST API: `ArtifactRouterOptions.binding` and the `ArtifactsBinding` / `ArtifactsRepositoryHandle` types are gone. The binding's repository handle is an RPC stub whose metadata properties cannot be read, so binding-served repository reads returned an empty payload.

- Add the typed HTTP client (`artifacts-viewer/client`) and the React surface (`artifacts-viewer/react`): hooks, file tree, directory view, file view, and a lazily loaded syntax-highlighted code view backed by `@pierre/diffs`.

## 0.0.2

### Patch Changes

- Verify the release pipeline end to end. No functional changes to the router or cache adapters.

## 0.0.1

### Patch changes

- Add `routeArtifactRequest`, a read-only HTTP router for the seven official Cloudflare Artifacts read operations.
- Add `createCacheApiAdapter` and `createKvCacheAdapter` under `artifacts-viewer/server/cache`, caching content-addressed reads only.
- Establish the `artifacts-viewer`, `/client`, `/react`, and `/styles.css` entry points. The client and React surfaces are not implemented yet.
