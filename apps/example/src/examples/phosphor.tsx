import { ArtifactRepoViewer } from "artifacts-viewer/react";
import type { ReactElement } from "react";
import { client, repoName } from "./shared.ts";
import type { ExampleProps } from "./shared.ts";
import "./phosphor.css";

export function Phosphor({ onSelect }: ExampleProps): ReactElement {
  return (
    <ArtifactRepoViewer
      client={client}
      colorMode="dark"
      onSelect={onSelect}
      pierreDiffsOptions={{ theme: "vesper", themeType: "dark" }}
      renderCodeFallback={({ name }) => (
        <div className="phosphor-decoding" role="status">
          <p className="phosphor-decoding__line">
            ◚ decoding {name}
            <span aria-hidden>▮</span>
          </p>
          <div aria-hidden className="phosphor-decoding__scan" />
        </div>
      )}
      repoName={repoName}
    />
  );
}
