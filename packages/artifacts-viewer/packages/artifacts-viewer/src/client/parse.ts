/**
 * Boundary narrowing for JSON reads.
 *
 * Everything arriving over the network is `unknown` until proven otherwise;
 * nothing here uses a type assertion.
 */

import type { ArtifactsCommitMetadata, ArtifactsTreeEntry } from "../shared/official-types.ts";
import type { ArtifactsRepository } from "./types.ts";

export type Narrowed<TValue> =
  | { readonly ok: true; readonly value: TValue }
  | { readonly ok: false; readonly reason: string };

function ok<TValue>(value: TValue): Narrowed<TValue> {
  return { ok: true, value };
}

function fail<TValue>(reason: string): Narrowed<TValue> {
  return { ok: false, reason };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(source: Record<string, unknown>, key: string): string | null {
  const value = source[key];
  return typeof value === "string" ? value : null;
}

function nullableStringField(
  source: Record<string, unknown>,
  key: string,
): Narrowed<string | null> {
  const value = source[key];
  if (value === null || typeof value === "string") {
    return ok(value);
  }
  return fail(`Field "${key}" must be a string or null.`);
}

function numberField(source: Record<string, unknown>, key: string): number | null {
  const value = source[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Unwraps the Cloudflare v4 envelope, surfacing upstream error text as-is. */
export function unwrapEnvelope(body: unknown): Narrowed<unknown> {
  if (!isRecord(body)) {
    return fail("Response body is not a JSON object.");
  }
  if (typeof body.success !== "boolean") {
    return fail("Response envelope is missing a boolean success flag.");
  }
  if (!body.success) {
    return fail(envelopeErrorMessage(body.errors));
  }
  if (body.result === null || body.result === undefined) {
    return fail("Response envelope succeeded with no result.");
  }
  return ok(body.result);
}

function envelopeErrorMessage(errors: unknown): string {
  if (!Array.isArray(errors)) {
    return "Request failed.";
  }
  const messages: string[] = [];
  for (const entry of errors) {
    if (isRecord(entry)) {
      const message = stringField(entry, "message");
      if (message !== null) {
        messages.push(message);
      }
    }
  }
  return messages.length > 0 ? messages.join(" ") : "Request failed.";
}

export function narrowRepository(result: unknown): Narrowed<ArtifactsRepository> {
  if (!isRecord(result)) {
    return fail("Repository payload is not an object.");
  }

  const id = stringField(result, "id");
  const name = stringField(result, "name");
  const defaultBranch = stringField(result, "default_branch");
  const createdAt = stringField(result, "created_at");
  const updatedAt = stringField(result, "updated_at");
  const remote = stringField(result, "remote");
  const readOnly = result.read_only;

  if (
    id === null ||
    name === null ||
    defaultBranch === null ||
    createdAt === null ||
    updatedAt === null ||
    remote === null ||
    typeof readOnly !== "boolean"
  ) {
    return fail("Repository payload is missing required fields.");
  }

  const description = nullableStringField(result, "description");
  if (!description.ok) {
    return fail(description.reason);
  }
  const lastPushAt = nullableStringField(result, "last_push_at");
  if (!lastPushAt.ok) {
    return fail(lastPushAt.reason);
  }
  const source = nullableStringField(result, "source");
  if (!source.ok) {
    return fail(source.reason);
  }

  return ok({
    id,
    name,
    description: description.value,
    defaultBranch,
    createdAt,
    updatedAt,
    lastPushAt: lastPushAt.value,
    source: source.value,
    readOnly,
    remote,
  });
}

const treeEntryTypes: ReadonlySet<string> = new Set<ArtifactsTreeEntry["type"]>([
  "tree",
  "blob",
  "symlink",
  "gitlink",
  "exec",
]);

function narrowTreeEntry(value: unknown): Narrowed<ArtifactsTreeEntry> {
  if (!isRecord(value)) {
    return fail("Tree entry is not an object.");
  }

  const name = stringField(value, "name");
  const mode = stringField(value, "mode");
  const hash = stringField(value, "hash");
  const type = stringField(value, "type");

  if (name === null || mode === null || hash === null || type === null) {
    return fail("Tree entry is missing required fields.");
  }
  if (!isTreeEntryType(type)) {
    return fail(`Tree entry has an unsupported type: ${type}.`);
  }

  return ok({ name, mode, hash, type });
}

function isTreeEntryType(value: string): value is ArtifactsTreeEntry["type"] {
  return treeEntryTypes.has(value);
}

export function narrowTreeEntries(result: unknown): Narrowed<ArtifactsTreeEntry[]> {
  if (!Array.isArray(result)) {
    return fail("Tree payload is not an array.");
  }

  const entries: ArtifactsTreeEntry[] = [];
  for (const value of result) {
    const entry = narrowTreeEntry(value);
    if (!entry.ok) {
      return fail(entry.reason);
    }
    entries.push(entry.value);
  }
  return ok(entries);
}

function narrowIdentity(value: unknown): Narrowed<{ name: string; email: string }> {
  if (!isRecord(value)) {
    return fail("Git identity is not an object.");
  }
  const name = stringField(value, "name");
  const email = stringField(value, "email");
  if (name === null || email === null) {
    return fail("Git identity is missing required fields.");
  }
  return ok({ name, email });
}

export function narrowCommit(result: unknown): Narrowed<ArtifactsCommitMetadata> {
  if (!isRecord(result)) {
    return fail("Commit payload is not an object.");
  }

  const hash = stringField(result, "hash");
  const treeHash = stringField(result, "treeHash");
  const message = stringField(result, "message");
  const authoredAt = numberField(result, "authoredAt");
  const committedAt = numberField(result, "committedAt");

  if (
    hash === null ||
    treeHash === null ||
    message === null ||
    authoredAt === null ||
    committedAt === null
  ) {
    return fail("Commit payload is missing required fields.");
  }

  const author = narrowIdentity(result.author);
  if (!author.ok) {
    return fail(author.reason);
  }
  const committer = narrowIdentity(result.committer);
  if (!committer.ok) {
    return fail(committer.reason);
  }

  const rawParents = result.parents;
  if (!Array.isArray(rawParents)) {
    return fail("Commit payload has no parents array.");
  }
  const parents: string[] = [];
  for (const parent of rawParents) {
    if (typeof parent !== "string") {
      return fail("Commit parent is not a string.");
    }
    parents.push(parent);
  }

  return ok({
    hash,
    treeHash,
    message,
    author: author.value,
    committer: committer.value,
    parents,
    authoredAt,
    committedAt,
  });
}

export function narrowCommits(result: unknown): Narrowed<ArtifactsCommitMetadata[]> {
  if (!Array.isArray(result)) {
    return fail("Log payload is not an array.");
  }

  const commits: ArtifactsCommitMetadata[] = [];
  for (const value of result) {
    const commit = narrowCommit(value);
    if (!commit.ok) {
      return fail(commit.reason);
    }
    commits.push(commit.value);
  }
  return ok(commits);
}
