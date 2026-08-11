import { useEffect, useState } from "react";
import type { CSSProperties, ReactElement } from "react";
import type { ArtifactsClient } from "../client/types.ts";
import type { ArtifactsCommitMetadata } from "../shared/official-types.ts";
import { ArtifactDirectoryView } from "./artifact-directory-view.tsx";
import { ArtifactFileTree } from "./artifact-file-tree.tsx";
import { ArtifactFileView } from "./artifact-file-view.tsx";
import { joinClassNames } from "./class-name.ts";
import { preloadCodeView, themeNames } from "./highlighter.ts";
import { useArtifactHeadCommit } from "./hooks.ts";
import { EmptyMessage, ErrorMessage, LoadingMessage } from "./status.tsx";
import type {
  ArtifactClassNames,
  ArtifactCodeFallbackRenderer,
  ArtifactColorMode,
  ArtifactHrefBuilder,
  ArtifactIconSlots,
  ArtifactPierreDiffsOptions,
  ArtifactSelection,
  ArtifactStatusContext,
  ArtifactStatusRenderers,
} from "./types.ts";

export type ArtifactRepoViewerProps = {
  readonly client: ArtifactsClient;
  readonly repoName: string;
  /**
   * Branch, tag, or commit to render. Omitted resolves the default branch.
   * Named `gitRef` because React reserves `ref` as a prop name.
   */
  readonly gitRef?: string;
  readonly onSelect?: (selection: ArtifactSelection) => void;
  readonly buildHref?: ArtifactHrefBuilder;
  readonly icons?: Partial<ArtifactIconSlots>;
  readonly classNames?: ArtifactClassNames;
  /** Added to the root slot alongside `classNames.root`. */
  readonly className?: string;
  readonly style?: CSSProperties;
  readonly colorMode?: ArtifactColorMode;
  /** Largest blob rendered inline; anything above shows a Raw/Download notice. */
  readonly maxInlineBytes?: number;
  readonly pierreDiffsOptions?: ArtifactPierreDiffsOptions;
  /** Rendered while the highlighted view is prepared. Defaults to a loading message. */
  readonly renderCodeFallback?: ArtifactCodeFallbackRenderer;
  /** Replaces the default loading, empty, and error markup in every pane. */
  readonly renderStatus?: ArtifactStatusRenderers;
};

export function ArtifactRepoViewer({
  client,
  repoName,
  gitRef,
  onSelect,
  buildHref,
  icons,
  classNames,
  className,
  style,
  colorMode = "system",
  maxInlineBytes,
  pierreDiffsOptions,
  renderCodeFallback,
  renderStatus,
}: ArtifactRepoViewerProps): ReactElement {
  const commit = useArtifactHeadCommit(client, repoName, gitRef);
  const context: ArtifactStatusContext = { scope: "repository", repoName };
  const status = { classNames, renderStatus, context } as const;
  const theme = pierreDiffsOptions?.theme;
  const themeKey = themeNames(theme).join(",");

  // Warm the code view while the user is still browsing the tree, so the first
  // file they open is already highlighted.
  useEffect(() => {
    void preloadCodeView({ theme });
    // oxlint-disable-next-line exhaustive-deps
  }, [themeKey]);

  return (
    <section
      aria-label={`${repoName} repository`}
      data-artifacts-viewer-root=""
      data-artifacts-viewer-slot="root"
      data-mode={colorMode}
      className={joinClassNames(classNames?.root, className)}
      style={style}
    >
      <header data-artifacts-viewer-slot="toolbar" className={classNames?.toolbar}>
        <strong data-artifacts-viewer-part="name">{repoName}</strong>
      </header>

      {commit.status === "idle" || commit.status === "loading" ? (
        <LoadingMessage {...status} label="Loading repository…" />
      ) : commit.status === "error" ? (
        <ErrorMessage {...status} error={commit.error} />
      ) : commit.data === null ? (
        <EmptyMessage {...status} label="This repository is empty." />
      ) : (
        <RepositoryPanes
          key={commit.data.hash}
          client={client}
          repoName={repoName}
          commit={commit.data}
          onSelect={onSelect}
          buildHref={buildHref}
          icons={icons}
          classNames={classNames}
          maxInlineBytes={maxInlineBytes}
          pierreDiffsOptions={pierreDiffsOptions}
          renderCodeFallback={renderCodeFallback}
          renderStatus={renderStatus}
        />
      )}
    </section>
  );
}

type RepositoryPanesProps = {
  readonly client: ArtifactsClient;
  readonly repoName: string;
  readonly commit: ArtifactsCommitMetadata;
  readonly onSelect?: (selection: ArtifactSelection) => void;
  readonly buildHref?: ArtifactHrefBuilder;
  readonly icons?: Partial<ArtifactIconSlots>;
  readonly classNames?: ArtifactClassNames;
  readonly maxInlineBytes?: number;
  readonly pierreDiffsOptions?: ArtifactPierreDiffsOptions;
  readonly renderCodeFallback?: ArtifactCodeFallbackRenderer;
  readonly renderStatus?: ArtifactStatusRenderers;
};

/**
 * Both panes read the same selection, so they can never disagree. Remounting on
 * the commit hash resets the selection whenever the underlying tree changes.
 *
 * The root listing is left out because the sidebar already shows it, and two
 * copies of the same entries read as a duplicate.
 */
function RepositoryPanes({
  client,
  repoName,
  commit,
  onSelect,
  buildHref,
  icons,
  classNames,
  maxInlineBytes,
  pierreDiffsOptions,
  renderCodeFallback,
  renderStatus,
}: RepositoryPanesProps): ReactElement {
  const rootSelection: ArtifactSelection = {
    path: "",
    name: repoName,
    hash: commit.treeHash,
    type: "tree",
  };
  const [selection, setSelection] = useState<ArtifactSelection>(rootSelection);

  const select = (next: ArtifactSelection): void => {
    setSelection(next);
    onSelect?.(next);
  };

  // The root is already rendered on mount, so report it rather than leaving the
  // consumer to re-derive what is on screen.
  useEffect(() => {
    onSelect?.(rootSelection);
    // oxlint-disable-next-line exhaustive-deps
  }, []);

  return (
    <div data-artifacts-viewer-slot="content" className={classNames?.content}>
      <aside data-artifacts-viewer-slot="sidebar" className={classNames?.sidebar}>
        <ArtifactFileTree
          client={client}
          repoName={repoName}
          rootTreeHash={commit.treeHash}
          selectedPath={selection.path}
          onSelect={select}
          buildHref={buildHref}
          icons={icons}
          classNames={classNames}
          renderStatus={renderStatus}
        />
      </aside>

      {selection.type !== "tree" ? (
        <ArtifactFileView
          client={client}
          repoName={repoName}
          gitRef={commit.hash}
          selection={selection}
          maxInlineBytes={maxInlineBytes}
          pierreDiffsOptions={pierreDiffsOptions}
          renderCodeFallback={renderCodeFallback}
          renderStatus={renderStatus}
          classNames={classNames}
        />
      ) : selection.path === "" ? null : (
        <ArtifactDirectoryView
          client={client}
          repoName={repoName}
          treeHash={selection.hash}
          path={selection.path}
          onSelect={select}
          buildHref={buildHref}
          icons={icons}
          classNames={classNames}
          renderStatus={renderStatus}
          label={selection.path}
        />
      )}
    </div>
  );
}
