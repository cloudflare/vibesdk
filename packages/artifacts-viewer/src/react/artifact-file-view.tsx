import type { ReactElement } from "react";
import type { ArtifactsClient } from "../client/types.ts";
import { CodeView } from "./code-view.tsx";
import { EmptyMessage, ErrorMessage, LoadingMessage } from "./status.tsx";
import { useArtifactBlob } from "./use-artifact-blob.ts";
import type { ArtifactBlobRender } from "./use-artifact-blob.ts";
import type {
  ArtifactClassNames,
  ArtifactCodeFallbackRenderer,
  ArtifactPierreDiffsOptions,
  ArtifactSelection,
  ArtifactStatusContext,
  ArtifactStatusRenderers,
} from "./types.ts";

export type ArtifactFileViewProps = {
  readonly client: ArtifactsClient;
  readonly repoName: string;
  /** Pin raw and download links to a commit hash so they survive a push. */
  readonly gitRef: string;
  readonly selection: ArtifactSelection;
  readonly maxInlineBytes?: number;
  readonly pierreDiffsOptions?: ArtifactPierreDiffsOptions;
  /** Rendered while the highlighted view is prepared. Defaults to a loading message. */
  readonly renderCodeFallback?: ArtifactCodeFallbackRenderer;
  /** Replaces the default loading, empty, and error markup. */
  readonly renderStatus?: ArtifactStatusRenderers;
  readonly classNames?: ArtifactClassNames;
};

export function ArtifactFileView({
  client,
  repoName,
  gitRef,
  selection,
  maxInlineBytes,
  pierreDiffsOptions,
  renderCodeFallback,
  renderStatus,
  classNames,
}: ArtifactFileViewProps): ReactElement {
  const rawUrl = client.getRawUrl({ repoName, ref: gitRef, path: selection.path });
  const blob = useArtifactBlob(client, {
    repoName,
    name: selection.name,
    hash: selection.hash,
    maxInlineBytes,
  });
  const context: ArtifactStatusContext = {
    scope: "file",
    repoName,
    path: selection.path,
    name: selection.name,
  };

  return (
    <div data-artifacts-viewer-slot="file" className={classNames?.file}>
      <header data-artifacts-viewer-part="header">
        <span data-artifacts-viewer-part="name">{selection.path}</span>
        <span data-artifacts-viewer-part="actions">
          <a href={rawUrl} data-artifacts-viewer-part="raw">
            Raw
          </a>
          <a href={rawUrl} download={selection.name} data-artifacts-viewer-part="download">
            Download
          </a>
        </span>
      </header>

      {blob.status === "idle" || blob.status === "loading" ? (
        <LoadingMessage
          classNames={classNames}
          renderStatus={renderStatus}
          context={context}
          label="Loading file…"
        />
      ) : blob.status === "error" ? (
        <ErrorMessage
          classNames={classNames}
          renderStatus={renderStatus}
          context={context}
          error={blob.error}
        />
      ) : (
        renderBlob({
          render: blob.data,
          name: selection.name,
          rawUrl,
          pierreDiffsOptions,
          renderCodeFallback,
          renderStatus,
          context,
          classNames,
        })
      )}
    </div>
  );
}

function renderBlob({
  render,
  name,
  rawUrl,
  pierreDiffsOptions,
  renderCodeFallback,
  renderStatus,
  context,
  classNames,
}: {
  render: ArtifactBlobRender;
  name: string;
  rawUrl: string;
  pierreDiffsOptions?: ArtifactPierreDiffsOptions;
  renderCodeFallback?: ArtifactCodeFallbackRenderer;
  renderStatus?: ArtifactStatusRenderers;
  context: ArtifactStatusContext;
  classNames?: ArtifactClassNames;
}): ReactElement {
  const status = { classNames, renderStatus, context } as const;

  switch (render.kind) {
    case "empty":
      return <EmptyMessage {...status} kind="empty" label="This file is empty." />;

    case "text":
      return (
        <CodeView
          name={name}
          contents={render.contents}
          options={pierreDiffsOptions}
          renderCodeFallback={renderCodeFallback}
          classNames={classNames}
        />
      );

    case "image":
      return (
        <div data-artifacts-viewer-part="image">
          <img src={rawUrl} alt={name} loading="lazy" decoding="async" />
        </div>
      );

    case "binary":
      return (
        <EmptyMessage
          {...status}
          kind="binary"
          label={`Binary file (${formatBytes(render.sizeBytes)}).`}
        />
      );

    case "oversized":
      return (
        <EmptyMessage {...status} kind="oversized" label="This file is too large to display." />
      );
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${String(bytes)} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KiB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}
