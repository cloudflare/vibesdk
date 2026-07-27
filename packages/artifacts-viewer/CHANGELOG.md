# artifacts-viewer

## 0.0.1

### Patch changes

- Add `routeArtifactRequest`, a read-only HTTP router for the seven official Cloudflare Artifacts read operations.
- Add `createCacheApiAdapter` and `createKvCacheAdapter` under `artifacts-viewer/server/cache`, caching content-addressed reads only.
- Establish the `artifacts-viewer`, `/client`, `/react`, and `/styles.css` entry points. The client and React surfaces are not implemented yet.
