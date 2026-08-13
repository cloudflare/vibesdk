/**
 * Input validation for the router.
 *
 * The posture throughout is allowlist, not denylist. Anything not positively
 * recognized is rejected, because the cost of refusing an exotic-but-valid git
 * ref is a bug report, while the cost of forwarding a malicious one is a
 * request made with our credentials.
 */

export type Parsed<TValue> =
  | { readonly ok: true; readonly value: TValue }
  | { readonly ok: false; readonly reason: string };

function ok<TValue>(value: TValue): Parsed<TValue> {
  return { ok: true, value };
}

function fail<TValue>(reason: string): Parsed<TValue> {
  return { ok: false, reason };
}

/** C0 controls, DEL, and C1 controls. */
// oxlint-disable-next-line no-control-regex
const controlCharacters = /[\u0000-\u001F\u007F-\u009F]/;

const repoNamePattern = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,98}[A-Za-z0-9])?$/;
const objectHashPattern = /^[0-9a-fA-F]{40}$/;

const maxRefLength = 255;
const maxPathLength = 1024;
const maxLogLimit = 1000;

export function parseRepoName(raw: string): Parsed<string> {
  if (raw === "") {
    return fail("Repository name is required.");
  }
  if (!repoNamePattern.test(raw)) {
    return fail("Repository name contains unsupported characters.");
  }
  if (raw === "." || raw === "..") {
    return fail("Repository name is reserved.");
  }
  return ok(raw);
}

// Hashes are lowercased so a derived cache key is canonical; otherwise `ABC…`
// and `abc…` would be two entries for one object.
export function parseObjectHash(raw: string): Parsed<string> {
  if (!objectHashPattern.test(raw)) {
    return fail("Object hash must be 40 hexadecimal characters.");
  }
  return ok(raw.toLowerCase());
}

/**
 * A conservative subset of the git ref grammar. Real `git check-ref-format` is
 * more permissive, but the extra surface buys nothing here and includes
 * characters that are awkward in URLs.
 */
export function parseRef(raw: string): Parsed<string> {
  if (raw === "") {
    return fail("Ref is required.");
  }
  if (raw.length > maxRefLength) {
    return fail("Ref is too long.");
  }
  if (controlCharacters.test(raw)) {
    return fail("Ref contains control characters.");
  }
  if (/[\s~^:?*[\\]/.test(raw)) {
    return fail("Ref contains characters that are invalid in a git ref.");
  }
  if (raw.includes("..") || raw.includes("@{")) {
    return fail("Ref contains a reserved sequence.");
  }
  // A leading dash would be read as an option by downstream tooling.
  if (raw.startsWith("-") || raw.startsWith("/") || raw.endsWith("/")) {
    return fail("Ref has an invalid boundary character.");
  }
  if (raw.includes("//") || raw.endsWith(".lock") || raw.endsWith(".")) {
    return fail("Ref is not a well-formed git ref.");
  }
  return ok(raw);
}

/**
 * Traversal is rejected, not clamped. Clamping `../../etc/passwd` to
 * `etc/passwd` is right when resolving a link inside rendered markdown, where
 * the user did not type it and a broken link beats an error. At the HTTP
 * boundary the opposite holds: silently serving a different file than the one
 * requested hides bugs and makes audit logs lie.
 */
export function parseRepoPath(raw: string): Parsed<string> {
  if (raw === "") {
    return fail("Path is required.");
  }
  if (raw.length > maxPathLength) {
    return fail("Path is too long.");
  }
  if (controlCharacters.test(raw)) {
    return fail("Path contains control characters.");
  }
  if (raw.startsWith("/")) {
    return fail("Path must be repository-relative.");
  }

  const segments = raw.split("/");
  for (const segment of segments) {
    if (segment === "") {
      return fail("Path contains an empty segment.");
    }
    if (segment === "." || segment === "..") {
      return fail("Path contains a relative segment.");
    }
  }

  return ok(segments.join("/"));
}

export function parseLogLimit(raw: string | null): Parsed<number | null> {
  if (raw === null) {
    return ok(null);
  }
  const parsed = parseInteger(raw);
  if (parsed === null || parsed < 1 || parsed > maxLogLimit) {
    return fail(`limit must be an integer between 1 and ${String(maxLogLimit)}.`);
  }
  return ok(parsed);
}

export function parseLogOffset(raw: string | null): Parsed<number | null> {
  if (raw === null) {
    return ok(null);
  }
  const parsed = parseInteger(raw);
  if (parsed === null || parsed < 0) {
    return fail("offset must be a non-negative integer.");
  }
  return ok(parsed);
}

/** Absent means "let the upstream default to HEAD". */
export function parseOptionalRef(raw: string | null): Parsed<string | null> {
  if (raw === null) {
    return ok(null);
  }
  const parsed = parseRef(raw);
  return parsed.ok ? ok(parsed.value) : fail(parsed.reason);
}

// `Number()` accepts `"1e3"`, `" 1 "`, `"0x10"`, and `""`. None of those are
// things a caller meant to send as a page size.
function parseInteger(raw: string): number | null {
  if (!/^-?\d+$/.test(raw)) {
    return null;
  }
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) ? parsed : null;
}
