/**
 * Public shapes for the browser client.
 *
 * Results are a plain discriminated union rather than thrown errors, matching
 * the router's `Parsed` style: a failed read is an expected outcome of a
 * network call, not an exception.
 */

import type { ArtifactsCommitMetadata, ArtifactsTreeEntry } from "../shared/official-types.ts";

export type ArtifactsClientError =
  | { readonly kind: "network"; readonly message: string; readonly cause: unknown }
  | { readonly kind: "not-found"; readonly message: string }
  | { readonly kind: "http"; readonly message: string; readonly status: number }
  | { readonly kind: "malformed"; readonly message: string };

export type ArtifactsResult<TValue> =
  | { readonly ok: true; readonly value: TValue }
  | { readonly ok: false; readonly error: ArtifactsClientError };

/** Repository metadata, normalized from the snake_case wire payload. */
export type ArtifactsRepository = {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly defaultBranch: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly lastPushAt: string | null;
  readonly source: string | null;
  readonly readOnly: boolean;
  readonly remote: string;
};

export type ArtifactsFetch = (input: string, init?: RequestInit) => Promise<Response>;

export type ArtifactsClientOptions = {
  /** Path the router is mounted on. Defaults to `/artifacts`. */
  readonly apiPath?: string;
  readonly fetch?: ArtifactsFetch;
};

export type RepositoryArgs = {
  readonly repoName: string;
  readonly signal?: AbortSignal;
};

export type LogArgs = {
  readonly repoName: string;
  readonly ref?: string;
  readonly limit?: number;
  readonly offset?: number;
  readonly signal?: AbortSignal;
};

export type ObjectArgs = {
  readonly repoName: string;
  readonly hash: string;
  readonly signal?: AbortSignal;
};

export type PathArgs = {
  readonly repoName: string;
  readonly ref: string;
  readonly path: string;
  readonly signal?: AbortSignal;
};

export type RawUrlArgs = {
  readonly repoName: string;
  readonly ref: string;
  readonly path: string;
};

/**
 * Binary reads hand back the `Response` untouched so the body can be streamed,
 * size-checked, or discarded without ever being buffered or base64-encoded.
 */
export type ArtifactsClient = {
  getRepository(args: RepositoryArgs): Promise<ArtifactsResult<ArtifactsRepository>>;
  getLog(args: LogArgs): Promise<ArtifactsResult<ArtifactsCommitMetadata[]>>;
  readCommit(args: ObjectArgs): Promise<ArtifactsResult<ArtifactsCommitMetadata>>;
  readTree(args: ObjectArgs): Promise<ArtifactsResult<ArtifactsTreeEntry[]>>;
  readBlob(args: ObjectArgs): Promise<ArtifactsResult<Response>>;
  readFile(args: PathArgs): Promise<ArtifactsResult<Response>>;
  getRawUrl(args: RawUrlArgs): string;
};
