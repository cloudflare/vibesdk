import type { ArtifactsClient, ArtifactsRepository, ArtifactsResult } from "../client/types.ts";
import type { ArtifactsCommitMetadata, ArtifactsTreeEntry } from "../shared/official-types.ts";
import { useArtifactQuery } from "./use-artifact-query.ts";
import type { ArtifactQueryState } from "./use-artifact-query.ts";

export function useArtifactRepository(
  client: ArtifactsClient,
  repoName: string,
): ArtifactQueryState<ArtifactsRepository> {
  return useArtifactQuery(
    (signal) => client.getRepository({ repoName, signal }),
    [client, repoName],
  );
}

export function useArtifactLog(
  client: ArtifactsClient,
  args: { repoName: string; ref?: string; limit?: number; offset?: number },
): ArtifactQueryState<ArtifactsCommitMetadata[]> {
  const { repoName, ref, limit, offset } = args;
  return useArtifactQuery(
    (signal) => client.getLog({ repoName, ref, limit, offset, signal }),
    [client, repoName, ref, limit, offset],
  );
}

/**
 * The commit the viewer renders, in one hop.
 *
 * `ref` is optional upstream, so omitting it resolves the default branch. An
 * empty log means an empty repository, which resolves to `null` rather than an
 * error — `last_push_at` is always null and cannot be used for this.
 */
export function useArtifactHeadCommit(
  client: ArtifactsClient,
  repoName: string,
  ref?: string,
): ArtifactQueryState<ArtifactsCommitMetadata | null> {
  return useArtifactQuery(
    async (signal): Promise<ArtifactsResult<ArtifactsCommitMetadata | null>> => {
      const log = await client.getLog({ repoName, ref, limit: 1, signal });
      if (!log.ok) {
        return log;
      }
      return { ok: true, value: log.value[0] ?? null };
    },
    [client, repoName, ref],
  );
}

export function useArtifactTree(
  client: ArtifactsClient,
  repoName: string,
  treeHash: string | null,
): ArtifactQueryState<ArtifactsTreeEntry[]> {
  return useArtifactQuery(
    treeHash === null ? null : (signal) => client.readTree({ repoName, hash: treeHash, signal }),
    [client, repoName, treeHash],
  );
}

export type { ArtifactQueryState };
