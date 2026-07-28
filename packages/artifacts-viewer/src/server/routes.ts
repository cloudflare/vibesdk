/**
 * The read-only route table, and the security surface of the package.
 *
 * Paths mirror Cloudflare's namespace-relative shape 1:1, except that
 * `accountId` and `namespace` are deliberately absent: they are server
 * configuration, and putting them in a browser-facing path would leak account
 * topology while inviting tampering.
 */

import { normalizeApiPath } from "../shared/api-path.ts";
import {
  parseLogLimit,
  parseLogOffset,
  parseObjectHash,
  parseOptionalRef,
  parseRef,
  parseRepoName,
  parseRepoPath,
} from "./validate.ts";
import type { Parsed } from "./validate.ts";

export type ArtifactReadRequest =
  | { readonly operation: "repository"; readonly repoName: string }
  | {
      readonly operation: "log";
      readonly repoName: string;
      readonly ref: string | null;
      readonly limit: number | null;
      readonly offset: number | null;
    }
  | { readonly operation: "commit"; readonly repoName: string; readonly hash: string }
  | { readonly operation: "tree"; readonly repoName: string; readonly hash: string }
  | { readonly operation: "blob"; readonly repoName: string; readonly hash: string }
  | {
      readonly operation: "file";
      readonly repoName: string;
      readonly ref: string;
      readonly path: string;
    }
  | {
      readonly operation: "raw";
      readonly repoName: string;
      readonly ref: string;
      readonly path: string;
    };

/**
 * There is deliberately no "not our problem" variant. Whether the request
 * belongs to us at all is {@link matchApiPath}'s job, kept a separate step so
 * the two decisions cannot be conflated.
 */
export type RouteMatch =
  | { readonly kind: "read"; readonly request: ArtifactReadRequest }
  | { readonly kind: "method-not-allowed"; readonly allow: readonly string[] }
  | { readonly kind: "bad-request"; readonly reason: string }
  | { readonly kind: "not-found" };

const allowedMethods: readonly string[] = ["GET"];

/**
 * Splits the mounted prefix off a request path.
 *
 * Matching is on a segment boundary, so a prefix of `/artifacts` matches
 * `/artifacts` and `/artifacts/repos/x` but not `/artifacts-internal`. Getting
 * this wrong would silently hijack a sibling route in the host application.
 */
export function matchApiPath(pathname: string, apiPath: string): readonly string[] | null {
  const prefix = normalizeApiPath(apiPath);

  if (pathname === prefix) {
    return [];
  }
  if (!pathname.startsWith(`${prefix}/`)) {
    return null;
  }

  return pathname
    .slice(prefix.length + 1)
    .split("/")
    .filter((segment) => segment !== "");
}

/**
 * Matches already-prefix-stripped segments against the read table.
 *
 * Segments are decoded first and validated second: validating an encoded value
 * would let `%2e%2e` slip past a check for `..`.
 */
export function matchRoute(
  method: string,
  segments: readonly string[],
  query: URLSearchParams,
): RouteMatch {
  const decoded = decodeSegments(segments);
  if (decoded === null) {
    return { kind: "bad-request", reason: "Path contains invalid percent-encoding." };
  }

  const shape = matchShape(decoded);
  if (shape === null) {
    return { kind: "not-found" };
  }

  // Method is checked after shape so a wrong method on a real route gives 405
  // rather than 404, but before argument parsing so a POST to a valid route is
  // not rejected for an unrelated reason.
  if (method !== "GET") {
    return { kind: "method-not-allowed", allow: allowedMethods };
  }

  return buildRequest(shape, query);
}

type RouteShape =
  | { readonly operation: "repository"; readonly rawRepoName: string }
  | { readonly operation: "log"; readonly rawRepoName: string }
  | { readonly operation: "commit"; readonly rawRepoName: string; readonly rawHash: string }
  | { readonly operation: "tree"; readonly rawRepoName: string; readonly rawHash: string }
  | { readonly operation: "blob"; readonly rawRepoName: string; readonly rawHash: string }
  | { readonly operation: "file"; readonly rawRepoName: string }
  | {
      readonly operation: "raw";
      readonly rawRepoName: string;
      readonly rawRef: string;
      readonly rawPath: string;
    };

function matchShape(segments: readonly string[]): RouteShape | null {
  const [collection, rawRepoName, action, ...rest] = segments;

  if (collection !== "repos" || rawRepoName === undefined) {
    return null;
  }

  if (action === undefined) {
    return { operation: "repository", rawRepoName };
  }

  switch (action) {
    case "log": {
      return rest.length === 0 ? { operation: "log", rawRepoName } : null;
    }
    case "file": {
      return rest.length === 0 ? { operation: "file", rawRepoName } : null;
    }
    case "commit":
    case "tree":
    case "blob": {
      const rawHash = rest[0];
      if (rawHash === undefined || rest.length !== 1) {
        return null;
      }
      return { operation: action, rawRepoName, rawHash };
    }
    case "raw": {
      // `raw/{ref}/{path…}` — the path is the entire remaining tail, which is
      // why this route cannot be expressed with a fixed segment count.
      const rawRef = rest[0];
      if (rawRef === undefined || rest.length < 2) {
        return null;
      }
      return {
        operation: "raw",
        rawRepoName,
        rawRef,
        rawPath: rest.slice(1).join("/"),
      };
    }
    default: {
      return null;
    }
  }
}

function buildRequest(shape: RouteShape, query: URLSearchParams): RouteMatch {
  const repoName = parseRepoName(shape.rawRepoName);
  if (!repoName.ok) {
    return { kind: "bad-request", reason: repoName.reason };
  }

  switch (shape.operation) {
    case "repository": {
      return { kind: "read", request: { operation: "repository", repoName: repoName.value } };
    }

    case "log": {
      const ref = parseOptionalRef(query.get("ref"));
      if (!ref.ok) {
        return { kind: "bad-request", reason: ref.reason };
      }
      const limit = parseLogLimit(query.get("limit"));
      if (!limit.ok) {
        return { kind: "bad-request", reason: limit.reason };
      }
      const offset = parseLogOffset(query.get("offset"));
      if (!offset.ok) {
        return { kind: "bad-request", reason: offset.reason };
      }
      return {
        kind: "read",
        request: {
          operation: "log",
          repoName: repoName.value,
          ref: ref.value,
          limit: limit.value,
          offset: offset.value,
        },
      };
    }

    case "commit":
    case "tree":
    case "blob": {
      const hash = parseObjectHash(shape.rawHash);
      if (!hash.ok) {
        return { kind: "bad-request", reason: hash.reason };
      }
      return {
        kind: "read",
        request: { operation: shape.operation, repoName: repoName.value, hash: hash.value },
      };
    }

    case "file": {
      // Unlike `log`, `ref` is mandatory here: without it the upstream would
      // resolve a different file than the caller believes they asked for.
      const ref = required(parseRef(query.get("ref") ?? ""), "ref is required.");
      if (!ref.ok) {
        return { kind: "bad-request", reason: ref.reason };
      }
      const path = parseRepoPath(query.get("path") ?? "");
      if (!path.ok) {
        return { kind: "bad-request", reason: path.reason };
      }
      return {
        kind: "read",
        request: {
          operation: "file",
          repoName: repoName.value,
          ref: ref.value,
          path: path.value,
        },
      };
    }

    case "raw": {
      const ref = parseRef(shape.rawRef);
      if (!ref.ok) {
        return { kind: "bad-request", reason: ref.reason };
      }
      const path = parseRepoPath(shape.rawPath);
      if (!path.ok) {
        return { kind: "bad-request", reason: path.reason };
      }
      return {
        kind: "read",
        request: {
          operation: "raw",
          repoName: repoName.value,
          ref: ref.value,
          path: path.value,
        },
      };
    }
  }
}

function required(parsed: Parsed<string>, missingReason: string): Parsed<string> {
  return parsed.ok ? parsed : { ok: false, reason: missingReason };
}

// `decodeURIComponent` throws on malformed input such as `%ZZ`, and a thrown
// `URIError` from a caller-controlled string is a 400, not a 500.
function decodeSegments(segments: readonly string[]): string[] | null {
  const decoded: string[] = [];
  for (const segment of segments) {
    try {
      decoded.push(decodeURIComponent(segment));
    } catch {
      return null;
    }
  }
  return decoded;
}
