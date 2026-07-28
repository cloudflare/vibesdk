import { ArtifactRepoViewer } from "artifacts-viewer/react";
import type { ReactElement } from "react";
import { client, repoName } from "./shared.ts";
import type { ExampleProps } from "./shared.ts";
import "./broadsheet.css";

export function Broadsheet({ onSelect }: ExampleProps): ReactElement {
  return (
    <ArtifactRepoViewer
      client={client}
      colorMode="light"
      onSelect={onSelect}
      pierreDiffsOptions={{ theme: "vitesse-light", themeType: "light" }}
      renderCodeFallback={({ name }) => (
        <div className="broadsheet-galley" role="status">
          <p className="broadsheet-galley__note">Setting {name} in type…</p>
          <div aria-hidden className="broadsheet-galley__rules">
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>
        </div>
      )}
      repoName={repoName}
    />
  );
}
