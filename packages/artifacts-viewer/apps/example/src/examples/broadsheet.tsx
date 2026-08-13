import { ArtifactRepoViewer } from "artifacts-viewer/react";
import type { ReactElement } from "react";
import { client, repoName } from "./shared.ts";
import type { ExampleProps } from "./shared.ts";
import "./broadsheet.css";

/**
 * `renderStatus` is a partial map here: only `loading` and `empty` are named, so
 * errors keep the package default.
 */
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
      renderStatus={{
        loading: () => (
          <div className="broadsheet-galley">
            <p className="broadsheet-galley__note">Going to press…</p>
            <div aria-hidden className="broadsheet-galley__rules">
              <span />
              <span />
              <span />
            </div>
          </div>
        ),
        empty: (context, kind) => (
          <p className="broadsheet-galley__note">
            {kind === "binary"
              ? "Not typeset — binary copy."
              : kind === "oversized"
                ? "Held over — too long for this edition."
                : context.scope === "repository"
                  ? "This edition has no pages."
                  : "This column is blank."}
          </p>
        ),
      }}
      repoName={repoName}
    />
  );
}
