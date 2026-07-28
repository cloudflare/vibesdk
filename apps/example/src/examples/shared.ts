import { createArtifactsClient } from "artifacts-viewer/client";
import type { ArtifactSelection } from "artifacts-viewer/react";

// Module scope: the hooks treat the client as a dependency, so a fresh
// instance per render would refetch forever.
export const client = createArtifactsClient();

export const repoName = "gitflare-test";

export type ExampleProps = {
  readonly onSelect: (selection: ArtifactSelection) => void;
};
