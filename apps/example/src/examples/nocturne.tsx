import { ArtifactRepoViewer } from "artifacts-viewer/react";
import type { ReactElement } from "react";
import { client, repoName } from "./shared.ts";
import type { ExampleProps } from "./shared.ts";
import "./nocturne.css";

export function Nocturne({ onSelect }: ExampleProps): ReactElement {
  return (
    <ArtifactRepoViewer
      client={client}
      colorMode="dark"
      onSelect={onSelect}
      pierreDiffsOptions={{ theme: "poimandres", themeType: "dark" }}
      renderCodeFallback={({ name }) => (
        <div className="nocturne-prep" role="status">
          <span aria-hidden className="nocturne-prep__ring" />
          <p className="nocturne-prep__note">Preparing {name}</p>
        </div>
      )}
      repoName={repoName}
    />
  );
}
