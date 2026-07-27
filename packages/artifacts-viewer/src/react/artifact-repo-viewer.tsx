export type ArtifactRepoViewerColorMode = "light" | "dark" | "system";

export type ArtifactRepoViewerProps = {
  repoName: string;
  className?: string;
  colorMode?: ArtifactRepoViewerColorMode;
};

export function ArtifactRepoViewer({
  repoName,
  className,
  colorMode = "system",
}: ArtifactRepoViewerProps) {
  const rootClassName = className ? `artifacts-viewer ${className}` : "artifacts-viewer";

  return (
    <section
      aria-label={`${repoName} repository viewer`}
      className={rootClassName}
      data-artifacts-viewer-root=""
      data-mode={colorMode}
    >
      <header className="artifacts-viewer__toolbar" data-artifacts-viewer-slot="toolbar">
        <div className="artifacts-viewer__identity">
          <span className="artifacts-viewer__mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <div>
            <span className="artifacts-viewer__eyebrow">Artifacts repository</span>
            <strong>{repoName}</strong>
          </div>
        </div>
        <span className="artifacts-viewer__status">Foundation preview</span>
      </header>

      <div className="artifacts-viewer__content" data-artifacts-viewer-slot="content">
        <div className="artifacts-viewer__diagram" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
        </div>
        <div className="artifacts-viewer__copy">
          <span className="artifacts-viewer__sequence">00 / boundary ready</span>
          <h2>Repository surface initialized.</h2>
          <p>
            This preview establishes the public React and styling boundaries. Repository loading
            will arrive through the package client without exposing Cloudflare credentials to the
            browser.
          </p>
        </div>
      </div>

      <footer className="artifacts-viewer__footer">
        <span>Read only</span>
        <span>React boundary</span>
        <span>Scoped CSS</span>
      </footer>
    </section>
  );
}
