import { useCallback, useState } from "react";
import type { ReactElement, ReactNode } from "react";
import type { ArtifactsClient } from "../client/types.ts";
import { joinPath, sortEntries } from "../shared/entries.ts";
import type { ArtifactsTreeEntry } from "../shared/official-types.ts";
import { joinClassNames } from "./class-name.ts";
import { EntryRow } from "./entry-row.tsx";
import { useArtifactTree } from "./hooks.ts";
import { defaultIcons } from "./icons.tsx";
import { EmptyMessage, ErrorMessage, LoadingMessage } from "./status.tsx";
import type {
  ArtifactClassNames,
  ArtifactHrefBuilder,
  ArtifactIconSlots,
  ArtifactSelection,
  ArtifactStatusRenderers,
} from "./types.ts";

export type ArtifactFileTreeProps = {
  readonly client: ArtifactsClient;
  readonly repoName: string;
  /** Tree object the sidebar is rooted at, normally the head commit's tree. */
  readonly rootTreeHash: string;
  readonly selectedPath?: string;
  readonly onSelect?: (selection: ArtifactSelection) => void;
  readonly buildHref?: ArtifactHrefBuilder;
  readonly icons?: Partial<ArtifactIconSlots>;
  readonly classNames?: ArtifactClassNames;
  /** Replaces the default loading, empty, and error markup. */
  readonly renderStatus?: ArtifactStatusRenderers;
  /** Added to the tree slot alongside `classNames.tree`. */
  readonly className?: string;
  readonly label?: string;
};

/**
 * Lazily expanding sidebar tree.
 *
 * Expansion is keyed by path, so two identical subtrees at different paths
 * expand independently even though they share a content hash.
 */
export function ArtifactFileTree({
  client,
  repoName,
  rootTreeHash,
  selectedPath,
  onSelect,
  buildHref,
  icons,
  classNames,
  renderStatus,
  className,
  label = "Repository files",
}: ArtifactFileTreeProps): ReactElement {
  const [expandedPaths, setExpandedPaths] = useState<ReadonlySet<string>>(new Set());

  const toggle = useCallback((path: string) => {
    setExpandedPaths((current) => {
      const next = new Set(current);
      if (!next.delete(path)) {
        next.add(path);
      }
      return next;
    });
  }, []);

  return (
    <nav
      aria-label={label}
      data-artifacts-viewer-slot="tree"
      className={joinClassNames(classNames?.tree, className)}
    >
      <TreeLevel
        client={client}
        repoName={repoName}
        treeHash={rootTreeHash}
        basePath=""
        expandedPaths={expandedPaths}
        onToggle={toggle}
        selectedPath={selectedPath}
        onSelect={onSelect}
        buildHref={buildHref}
        icons={icons}
        classNames={classNames}
        renderStatus={renderStatus}
      />
    </nav>
  );
}

type TreeLevelProps = {
  readonly client: ArtifactsClient;
  readonly repoName: string;
  readonly treeHash: string;
  readonly basePath: string;
  readonly expandedPaths: ReadonlySet<string>;
  readonly onToggle: (path: string) => void;
  readonly selectedPath?: string;
  readonly onSelect?: (selection: ArtifactSelection) => void;
  readonly buildHref?: ArtifactHrefBuilder;
  readonly icons?: Partial<ArtifactIconSlots>;
  readonly classNames?: ArtifactClassNames;
  readonly renderStatus?: ArtifactStatusRenderers;
};

function TreeLevel(props: TreeLevelProps): ReactElement {
  const { client, repoName, treeHash, basePath, expandedPaths, onToggle, classNames } = props;
  const tree = useArtifactTree(client, repoName, treeHash);
  const status = { classNames, renderStatus: props.renderStatus } as const;
  const context = { scope: "tree", repoName, path: basePath } as const;

  if (tree.status === "idle" || tree.status === "loading") {
    return <LoadingMessage {...status} context={context} label="Loading…" />;
  }
  if (tree.status === "error") {
    return <ErrorMessage {...status} context={context} error={tree.error} />;
  }
  if (tree.data.length === 0) {
    return <EmptyMessage {...status} context={context} label="Empty directory" />;
  }

  return (
    <ul>
      {sortEntries(tree.data).map((entry) => {
        const path = joinPath(basePath, entry.name);
        const expanded = expandedPaths.has(path);
        return (
          <li key={path}>
            <EntryRow
              slot="treeItem"
              entry={entry}
              icon={iconFor(entry, expanded, props.icons)}
              selected={props.selectedPath === path}
              expanded={entry.type === "tree" ? expanded : undefined}
              className={classNames?.treeItem}
              href={hrefFor(entry, path, props.buildHref)}
              onActivate={() => {
                if (entry.type === "tree") {
                  onToggle(path);
                }
                props.onSelect?.({ path, name: entry.name, hash: entry.hash, type: entry.type });
              }}
            />
            {entry.type === "tree" && expanded ? (
              <TreeLevel {...props} treeHash={entry.hash} basePath={path} />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

export function iconFor(
  entry: ArtifactsTreeEntry,
  expanded: boolean,
  icons?: Partial<ArtifactIconSlots>,
): ReactNode {
  const slots = { ...defaultIcons, ...icons };
  if (entry.type === "gitlink") {
    return slots.submodule;
  }
  if (entry.type === "tree") {
    return expanded ? slots.folderOpen : slots.folder;
  }
  return slots.file;
}

export function hrefFor(
  entry: ArtifactsTreeEntry,
  path: string,
  buildHref?: ArtifactHrefBuilder,
): string | undefined {
  if (buildHref === undefined || entry.type === "gitlink") {
    return undefined;
  }
  return buildHref({ path, name: entry.name, hash: entry.hash, type: entry.type });
}
