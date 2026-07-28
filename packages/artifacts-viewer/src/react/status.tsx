import type { ReactElement } from "react";
import type { ArtifactsClientError } from "../client/types.ts";
import type {
  ArtifactClassNames,
  ArtifactEmptyKind,
  ArtifactStatusContext,
  ArtifactStatusRenderers,
} from "./types.ts";

type StatusProps = {
  classNames?: ArtifactClassNames;
  context: ArtifactStatusContext;
  renderStatus?: ArtifactStatusRenderers;
};

export function LoadingMessage({
  classNames,
  context,
  renderStatus,
  label,
}: StatusProps & { label: string }): ReactElement {
  const custom = renderStatus?.loading?.(context);
  if (custom !== undefined) {
    return (
      <div data-artifacts-viewer-slot="loading" className={classNames?.loading} aria-busy="true">
        {custom}
      </div>
    );
  }
  return (
    <p data-artifacts-viewer-slot="loading" className={classNames?.loading} aria-busy="true">
      {label}
    </p>
  );
}

export function EmptyMessage({
  classNames,
  context,
  renderStatus,
  label,
  kind,
}: StatusProps & { label: string; kind?: ArtifactEmptyKind }): ReactElement {
  const custom = renderStatus?.empty?.(context, kind);
  if (custom !== undefined) {
    return (
      <div data-artifacts-viewer-slot="empty" data-kind={kind} className={classNames?.empty}>
        {custom}
      </div>
    );
  }
  return (
    <p data-artifacts-viewer-slot="empty" data-kind={kind} className={classNames?.empty}>
      {label}
    </p>
  );
}

export function ErrorMessage({
  classNames,
  context,
  renderStatus,
  error,
}: StatusProps & { error: ArtifactsClientError }): ReactElement {
  const custom = renderStatus?.error?.(context, error);
  if (custom !== undefined) {
    return (
      <div
        data-artifacts-viewer-slot="error"
        data-kind={error.kind}
        className={classNames?.error}
        role="alert"
      >
        {custom}
      </div>
    );
  }
  return (
    <p
      data-artifacts-viewer-slot="error"
      data-kind={error.kind}
      className={classNames?.error}
      role="alert"
    >
      {error.message}
    </p>
  );
}
