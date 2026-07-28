import type { ReactElement } from "react";
import type { ArtifactsClient } from "../client/types.ts";
import { joinPath, sortEntries } from "../shared/entries.ts";
import { hrefFor, iconFor } from "./artifact-file-tree.tsx";
import { joinClassNames } from "./class-name.ts";
import { EntryRow } from "./entry-row.tsx";
import { useArtifactTree } from "./hooks.ts";
import { EmptyMessage, ErrorMessage, LoadingMessage } from "./status.tsx";
import type {
  ArtifactClassNames,
  ArtifactHrefBuilder,
  ArtifactIconSlots,
  ArtifactSelection,
  ArtifactStatusRenderers,
} from "./types.ts";

export type ArtifactDirectoryViewProps = {
  readonly client: ArtifactsClient;
  readonly repoName: string;
  readonly treeHash: string;
  /** Repository-relative path of the directory being listed; `""` at the root. */
  readonly path?: string;
  readonly onSelect?: (selection: ArtifactSelection) => void;
  readonly buildHref?: ArtifactHrefBuilder;
  readonly icons?: Partial<ArtifactIconSlots>;
  readonly classNames?: ArtifactClassNames;
  /** Replaces the default loading, empty, and error markup. */
  readonly renderStatus?: ArtifactStatusRenderers;
  /** Added to the directory slot alongside `classNames.directory`. */
  readonly className?: string;
  readonly label?: string;
};

/** Flat listing of one directory's immediate children. */
export function ArtifactDirectoryView({
  client,
  repoName,
  treeHash,
  path = "",
  onSelect,
  buildHref,
  icons,
  classNames,
  renderStatus,
  className,
  label = "Directory contents",
}: ArtifactDirectoryViewProps): ReactElement {
  const tree = useArtifactTree(client, repoName, treeHash);
  const status = { classNames, renderStatus } as const;
  const context = { scope: "tree", repoName, path } as const;

  if (tree.status === "idle" || tree.status === "loading") {
    return <LoadingMessage {...status} context={context} label="Loading…" />;
  }
  if (tree.status === "error") {
    return <ErrorMessage {...status} context={context} error={tree.error} />;
  }
  if (tree.data.length === 0) {
    return <EmptyMessage {...status} context={context} label="This directory is empty." />;
  }

  return (
    <ul
      aria-label={label}
      data-artifacts-viewer-slot="directory"
      className={joinClassNames(classNames?.directory, className)}
    >
      {sortEntries(tree.data).map((entry) => {
        const entryPath = joinPath(path, entry.name);
        return (
          <li key={entryPath}>
            <EntryRow
              slot="directoryItem"
              entry={entry}
              icon={iconFor(entry, false, icons)}
              selected={false}
              className={classNames?.directoryItem}
              href={hrefFor(entry, entryPath, buildHref)}
              onActivate={() => {
                onSelect?.({
                  path: entryPath,
                  name: entry.name,
                  hash: entry.hash,
                  type: entry.type,
                });
              }}
            />
          </li>
        );
      })}
    </ul>
  );
}
