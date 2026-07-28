---
"artifacts-viewer": patch
---

Add `renderStatus`, a partial slot map that replaces the default loading, empty, and error markup on `ArtifactRepoViewer`, `ArtifactFileTree`, `ArtifactDirectoryView`, and `ArtifactFileView`. Each renderer receives a discriminated `ArtifactStatusContext` so one function can branch per pane, and output is wrapped in the matching slot element so the data attributes and ARIA semantics survive.
