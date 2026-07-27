/**
 * Dispatch through an Artifacts namespace binding.
 *
 * A binding avoids a round trip, but only covers the metadata reads: blob
 * content (`blob`, `file`, `raw`) has no binding surface and always goes over
 * REST. That is a platform capability rather than a configuration choice, so
 * it is expressed in the types here instead of a runtime check.
 */

import type {
  ArtifactsBinding,
  ArtifactsRepositoryHandle,
  ArtifactsRepositoryPayload,
} from "../shared/official-types.ts";
import { envelopeResponse, errorEnvelopeResponse } from "./responses.ts";
import type { ArtifactReadRequest } from "./routes.ts";

export type BindingReadRequest = Extract<
  ArtifactReadRequest,
  { operation: "repository" | "log" | "commit" | "tree" }
>;

export function isBindingReadRequest(request: ArtifactReadRequest): request is BindingReadRequest {
  switch (request.operation) {
    case "repository":
    case "log":
    case "commit":
    case "tree": {
      return true;
    }
    default: {
      return false;
    }
  }
}

// A `null` object becomes a 404 envelope, matching REST for a missing hash. A
// thrown binding error becomes a 502: the caller made a valid request and our
// backend failed, which is not their fault.
export async function dispatchBinding(
  binding: ArtifactsBinding,
  request: BindingReadRequest,
): Promise<Response> {
  try {
    const repository = await binding.get(request.repoName);

    switch (request.operation) {
      case "repository": {
        return envelopeResponse(toRepositoryPayload(repository));
      }

      case "log": {
        const commits = await repository.log({
          ref: request.ref ?? undefined,
          limit: request.limit ?? undefined,
          offset: request.offset ?? undefined,
        });
        return envelopeResponse(commits);
      }

      case "commit": {
        const commit = await repository.readCommit(request.hash);
        return commit === null
          ? errorEnvelopeResponse(404, "Commit not found.")
          : envelopeResponse(commit);
      }

      case "tree": {
        const entries = await repository.readTree(request.hash);
        return entries === null
          ? errorEnvelopeResponse(404, "Tree not found.")
          : envelopeResponse(entries);
      }
    }
  } catch {
    // The cause is deliberately not surfaced: binding errors can carry
    // account-internal detail, and the caller can act on neither.
    return errorEnvelopeResponse(502, "Artifacts binding request failed.");
  }
}

// The binding hands back camelCase; REST sends snake_case. The binding is the
// side that converts, so the client never branches on which backend answered.
function toRepositoryPayload(repository: ArtifactsRepositoryHandle): ArtifactsRepositoryPayload {
  return {
    id: repository.id,
    name: repository.name,
    description: repository.description,
    default_branch: repository.defaultBranch,
    created_at: repository.createdAt,
    updated_at: repository.updatedAt,
    last_push_at: repository.lastPushAt,
    source: repository.source,
    read_only: repository.readOnly,
    remote: repository.remote,
  };
}
