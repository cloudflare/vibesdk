import { createArtifactsClient } from "artifacts-viewer/client";
import type { ArtifactSelection } from "artifacts-viewer/react";

// Module scope: the hooks treat the client as a dependency, so a fresh
// instance per render would refetch forever.
export const client = createArtifactsClient();

export const repoName = "repo-bdeb8fe8-1a60-4be0-8a71-a6f292d6f394";

export type ExampleProps = {
  readonly onSelect: (selection: ArtifactSelection) => void;
};
