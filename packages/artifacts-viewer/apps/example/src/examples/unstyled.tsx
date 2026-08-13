import { ArtifactRepoViewer } from "artifacts-viewer/react";
import type { ReactElement } from "react";
import { client, repoName } from "./shared.ts";
import type { ExampleProps } from "./shared.ts";

// No CSS file, no className, no classNames, no pierreDiffsOptions. This is the
// package exactly as it ships: structural rules over browser defaults.
export function Unstyled({ onSelect }: ExampleProps): ReactElement {
  return <ArtifactRepoViewer client={client} onSelect={onSelect} repoName={repoName} />;
}
