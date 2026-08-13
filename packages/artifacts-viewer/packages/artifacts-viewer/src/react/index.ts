/**
 * React entry point.
 *
 * Components are controlled and unstyled beyond layout: every colour and font
 * comes from `--artifacts-viewer-*` variables, and every element carries a
 * stable `data-artifacts-viewer-slot` for targeting.
 */

import "../styles/viewer.css";

export { ArtifactRepoViewer, type ArtifactRepoViewerProps } from "./artifact-repo-viewer.tsx";
export {
  ArtifactDirectoryView,
  type ArtifactDirectoryViewProps,
} from "./artifact-directory-view.tsx";
export { ArtifactFileTree, type ArtifactFileTreeProps } from "./artifact-file-tree.tsx";
export { ArtifactFileView, type ArtifactFileViewProps } from "./artifact-file-view.tsx";
export { CodeView, type CodeViewProps } from "./code-view.tsx";
export { preloadCodeView } from "./highlighter.ts";

export {
  useArtifactHeadCommit,
  useArtifactLog,
  useArtifactRepository,
  useArtifactTree,
} from "./hooks.ts";
export {
  defaultMaxInlineBytes,
  useArtifactBlob,
  type ArtifactBlobRender,
  type UseArtifactBlobArgs,
} from "./use-artifact-blob.ts";
export {
  useArtifactQuery,
  type ArtifactQueryRun,
  type ArtifactQueryState,
} from "./use-artifact-query.ts";

export { defaultIcons } from "./icons.tsx";

export type {
  ArtifactClassNames,
  ArtifactCodeFallbackRenderer,
  ArtifactColorMode,
  ArtifactEmptyKind,
  ArtifactHrefBuilder,
  ArtifactIconSlots,
  ArtifactPierreDiffsOptions,
  ArtifactPierreTheme,
  ArtifactSelection,
  ArtifactSlot,
  ArtifactStatusContext,
  ArtifactStatusRenderers,
} from "./types.ts";

export type {
  ArtifactsClient,
  ArtifactsClientError,
  ArtifactsRepository,
  ArtifactsResult,
} from "../client/types.ts";

export type {
  ArtifactsCommitMetadata,
  ArtifactsGitIdentity,
  ArtifactsTreeEntry,
} from "../shared/official-types.ts";
