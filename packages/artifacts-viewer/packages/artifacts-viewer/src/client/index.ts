/**
 * Browser client entry point.
 *
 * Framework-independent and free of Worker globals: it speaks only to a
 * mounted `routeArtifactRequest` on your own origin.
 */

export { createArtifactsClient } from "./client.ts";

export type {
  ArtifactsClient,
  ArtifactsClientError,
  ArtifactsClientOptions,
  ArtifactsFetch,
  ArtifactsRepository,
  ArtifactsResult,
  LogArgs,
  ObjectArgs,
  PathArgs,
  RawUrlArgs,
  RepositoryArgs,
} from "./types.ts";

export type {
  ArtifactReadOperation,
  ArtifactsCommitMetadata,
  ArtifactsGitIdentity,
  ArtifactsTreeEntry,
} from "../shared/official-types.ts";
