import { ArtifactRepoViewer } from "artifacts-viewer/react";
import type { ReactElement } from "react";
import { client, repoName } from "./shared.ts";
import type { ExampleProps } from "./shared.ts";
import "./blockprint.css";

export function Blockprint({ onSelect }: ExampleProps): ReactElement {
  return (
    <ArtifactRepoViewer
      client={client}
      colorMode="light"
      onSelect={onSelect}
      pierreDiffsOptions={{ theme: "github-light", themeType: "light" }}
      renderCodeFallback={({ name }) => (
        <div className="blockprint-press" role="status">
          <span aria-hidden className="blockprint-press__block" />
          <p className="blockprint-press__note">
            Printing
            <br />
            {name}
          </p>
        </div>
      )}
      renderStatus={{
        loading: (context) => (
          <div className="blockprint-press">
            <span aria-hidden className="blockprint-press__block" />
            <p className="blockprint-press__note">
              {context.scope === "repository" ? "Loading" : "Setting"}
              <br />
              plate
            </p>
          </div>
        ),
        error: (_context, error) => (
          <div className="blockprint-press blockprint-press--alert">
            <p className="blockprint-press__note">{error.kind}</p>
            <p className="blockprint-press__detail">{error.message}</p>
          </div>
        ),
      }}
      repoName={repoName}
    />
  );
}
