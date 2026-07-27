/**
 * Types mirroring the official Cloudflare Artifacts read surface.
 *
 * Platform-neutral by construction: no React, no Worker globals, no Node
 * built-ins. Both the router and the browser client import from here, which is
 * what keeps the two boundaries from drifting apart.
 */

export type ArtifactReadOperation =
  | "repository"
  | "log"
  | "commit"
  | "tree"
  | "blob"
  | "file"
  | "raw";

// Git objects are content-addressed, so a response for a given hash can never
// change. That is what licenses indefinite caching, encoded in the type rather
// than asserted at the cache call site.
export type ImmutableArtifactReadOperation = Extract<
  ArtifactReadOperation,
  "commit" | "tree" | "blob"
>;

const immutableOperations: ReadonlySet<string> = new Set<ImmutableArtifactReadOperation>([
  "commit",
  "tree",
  "blob",
]);

export function isImmutableReadOperation(
  operation: ArtifactReadOperation,
): operation is ImmutableArtifactReadOperation {
  return immutableOperations.has(operation);
}

export type ArtifactsGitIdentity = {
  name: string;
  email: string;
};

// `type` is a git object kind, not a mode. `exec` and `symlink` are blob-like
// and readable as file content; `gitlink` is a submodule pointer with no
// content in this repository at all.
export type ArtifactsTreeEntry = {
  name: string;
  mode: string;
  hash: string;
  type: "tree" | "blob" | "symlink" | "gitlink" | "exec";
};

// Arrives camelCase from the API, unlike repository metadata.
export type ArtifactsCommitMetadata = {
  hash: string;
  treeHash: string;
  message: string;
  author: ArtifactsGitIdentity;
  committer: ArtifactsGitIdentity;
  parents: string[];
  authoredAt: number;
  committedAt: number;
};

/**
 * Repository metadata as it appears on the wire. Unlike commits and tree
 * entries this payload is snake_case, and the router forwards it untouched, so
 * snake_case is the contract between router and client.
 *
 * `last_push_at` is always `null` in the current Artifacts API. Do not build
 * emptiness detection on it; use an empty `log` response instead.
 */
export type ArtifactsRepositoryPayload = {
  id: string;
  name: string;
  description: string | null;
  default_branch: string;
  created_at: string;
  updated_at: string;
  last_push_at: string | null;
  source: string | null;
  read_only: boolean;
  remote: string;
};

/**
 * The read-only slice of a binding repository handle.
 *
 * Deliberately narrower than the real binding: declaring only what this
 * package calls means a consumer cannot hand us a write-capable object and
 * have us silently depend on mutation methods. Blob reads are absent because
 * the binding has no blob surface — `blob`, `file`, and `raw` always use REST.
 */
export type ArtifactsRepositoryHandle = {
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
  readTree(hash: string): Promise<ArtifactsTreeEntry[] | null>;
  readCommit(hash: string): Promise<ArtifactsCommitMetadata | null>;
  log(options?: {
    ref?: string;
    limit?: number;
    offset?: number;
  }): Promise<ArtifactsCommitMetadata[]>;
};

export type ArtifactsBinding = {
  get(repoName: string): Promise<ArtifactsRepositoryHandle>;
};

/** The Cloudflare v4 response envelope, emitted for every JSON read. */
export type CloudflareEnvelope<TResult> = {
  result: TResult | null;
  success: boolean;
  errors: CloudflareEnvelopeError[];
  messages?: CloudflareEnvelopeError[];
};

export type CloudflareEnvelopeError = {
  code: number;
  message: string;
};
