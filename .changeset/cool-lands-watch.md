---
"artifacts-viewer": patch
---

Remove Artifacts binding dispatch. Every read now goes over the official REST API: `ArtifactRouterOptions.binding` and the `ArtifactsBinding` / `ArtifactsRepositoryHandle` types are gone. The binding's repository handle is an RPC stub whose metadata properties cannot be read, so binding-served repository reads returned an empty payload.
