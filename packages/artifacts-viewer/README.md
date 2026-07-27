# artifacts-viewer

A read-only React repository viewer for Cloudflare Artifacts.

This is the package foundation. It establishes isolated server, client, React, and style entry points before repository loading behavior is implemented.

## Install

```bash
npm install artifacts-viewer react react-dom
```

## React

```tsx
import { ArtifactRepoViewer } from "artifacts-viewer/react";
import "artifacts-viewer/styles.css";

export function Repository() {
  return <ArtifactRepoViewer repoName="website" />;
}
```

The current component is a presentational foundation preview. It does not fetch repository data yet.

## Exports

- `artifacts-viewer` reserves the runtime-neutral server boundary.
- `artifacts-viewer/client` reserves the framework-independent client boundary.
- `artifacts-viewer/react` exports React components and types.
- `artifacts-viewer/styles.css` contains compiled, viewer-scoped CSS.
