import type { ReactElement } from "react";
import type { ArtifactsClientError } from "../client/types.ts";
import type { ArtifactClassNames } from "./types.ts";

export function LoadingMessage({
  classNames,
  label,
}: {
  classNames?: ArtifactClassNames;
  label: string;
}): ReactElement {
  return (
    <p data-artifacts-viewer-slot="loading" className={classNames?.loading} aria-busy="true">
      {label}
    </p>
  );
}

export function EmptyMessage({
  classNames,
  label,
  kind,
}: {
  classNames?: ArtifactClassNames;
  label: string;
  kind?: string;
}): ReactElement {
  return (
    <p data-artifacts-viewer-slot="empty" data-kind={kind} className={classNames?.empty}>
      {label}
    </p>
  );
}

export function ErrorMessage({
  classNames,
  error,
}: {
  classNames?: ArtifactClassNames;
  error: ArtifactsClientError;
}): ReactElement {
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
