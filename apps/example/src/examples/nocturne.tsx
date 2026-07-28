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
      renderStatus={{
        loading: (context) => (
          <div className="nocturne-prep">
            <span aria-hidden className="nocturne-prep__ring" />
            <p className="nocturne-prep__note">
              {context.scope === "file" ? `Fetching ${context.name}` : "Fetching"}
            </p>
          </div>
        ),
        empty: (_context, kind) => (
          <p className="nocturne-prep__note nocturne-prep__note--quiet">
            {kind === "binary"
              ? "Binary — nothing to show"
              : kind === "oversized"
                ? "Too large to inline"
                : "Nothing here yet"}
          </p>
        ),
        error: (_context, error) => (
          <p className="nocturne-prep__note nocturne-prep__note--alert">{error.message}</p>
        ),
      }}
      repoName={repoName}
    />
  );
}
