import type { ArtifactsClient, ArtifactsResult } from "../client/types.ts";
import { decodeTextBytes, imageContentTypeFor, readCappedBody } from "../shared/blob.ts";
import { useArtifactQuery } from "./use-artifact-query.ts";
import type { ArtifactQueryState } from "./use-artifact-query.ts";

export type ArtifactBlobRender =
  | { readonly kind: "empty" }
  | { readonly kind: "text"; readonly contents: string }
  | { readonly kind: "image"; readonly contentType: string }
  | { readonly kind: "binary"; readonly sizeBytes: number }
  | { readonly kind: "oversized" };

export const defaultMaxInlineBytes = 512 * 1024;

export type UseArtifactBlobArgs = {
  readonly repoName: string;
  readonly name: string;
  readonly hash: string | null;
  readonly maxInlineBytes?: number;
};

export function useArtifactBlob(
  client: ArtifactsClient,
  { repoName, name, hash, maxInlineBytes = defaultMaxInlineBytes }: UseArtifactBlobArgs,
): ArtifactQueryState<ArtifactBlobRender> {
  return useArtifactQuery(
    hash === null
      ? null
      : async (signal): Promise<ArtifactsResult<ArtifactBlobRender>> => {
          const imageContentType = imageContentTypeFor(name);
          if (imageContentType !== null) {
            return { ok: true, value: { kind: "image", contentType: imageContentType } };
          }

          const response = await client.readBlob({ repoName, hash, signal });
          if (!response.ok) {
            return response;
          }

          const body = await readCappedBody(response.value, maxInlineBytes);
          if (body.kind === "oversized") {
            return { ok: true, value: { kind: "oversized" } };
          }
          if (body.bytes.length === 0) {
            return { ok: true, value: { kind: "empty" } };
          }

          const contents = decodeTextBytes(body.bytes);
          return {
            ok: true,
            value:
              contents === null
                ? { kind: "binary", sizeBytes: body.bytes.length }
                : { kind: "text", contents },
          };
        },
    [client, repoName, name, hash, maxInlineBytes],
  );
}
