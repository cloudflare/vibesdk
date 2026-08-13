import { ArtifactRepoViewer } from "artifacts-viewer/react";
import type { ArtifactEmptyKind, ArtifactStatusContext } from "artifacts-viewer/react";
import type { ReactElement } from "react";
import { client, repoName } from "./shared.ts";
import type { ExampleProps } from "./shared.ts";
import "./phosphor.css";

/** The context is discriminated, so one renderer can speak differently per pane. */
function loadingLine(context: ArtifactStatusContext): string {
  switch (context.scope) {
    case "repository":
      return `mounting ${context.repoName}`;
    case "tree":
      return context.path === "" ? "scanning root" : `scanning /${context.path}`;
    case "file":
      return `reading ${context.name}`;
  }
}

function emptyLine(context: ArtifactStatusContext, kind?: ArtifactEmptyKind): string {
  if (kind === "binary") {
    return "binary stream — no preview";
  }
  if (kind === "oversized") {
    return "buffer overflow — use raw";
  }
  return context.scope === "repository" ? "no commits on this ref" : "no entries";
}

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
      renderStatus={{
        loading: (context) => (
          <div className="phosphor-decoding">
            <p className="phosphor-decoding__line">
              ◚ {loadingLine(context)}
              <span aria-hidden>▮</span>
            </p>
            <div aria-hidden className="phosphor-decoding__scan" />
          </div>
        ),
        empty: (context, kind) => (
          <p className="phosphor-decoding__line">▨ {emptyLine(context, kind)}</p>
        ),
        error: (_context, error) => (
          <p className="phosphor-decoding__line phosphor-decoding__line--alert">
            ✕ {error.kind} — {error.message}
          </p>
        ),
      }}
      repoName={repoName}
    />
  );
}
