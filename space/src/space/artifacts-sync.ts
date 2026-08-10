/**
 * Cloudflare Artifacts sync for the SpaceDO.
 *
 * Artifacts is a git-compatible, versioned remote (see
 * https://developers.cloudflare.com/artifacts/). Each app gets its own repo,
 * and the SpaceDO mirrors every commit/deploy there via `git push` so Artifacts
 * is the durable source of truth — the SpaceDO's local isomorphic-git (backed by
 * an in-memory overlay FS) is the live working tree used to build/serve previews
 * and is rehydrated from Artifacts on cold start.
 *
 * All operations here are best-effort: Artifacts is a beta product and may be
 * absent in local dev (no binding). Failures are logged and reported via return
 * values; they must never break a commit or deploy.
 */
import type { Git } from "@cloudflare/shell/git"

const REMOTE_NAME = "artifacts"
/** Refresh the write token this many ms before it actually expires. */
const TOKEN_REFRESH_SKEW_MS = 60_000
/** Requested token lifetime (seconds). Artifacts allows 60s..1y. */
const TOKEN_TTL_SECONDS = 3600
/** Max attempts for a single push before giving up (best-effort). */
const PUSH_MAX_ATTEMPTS = 4
/** Base backoff between push retries; grows linearly per attempt. */
const PUSH_RETRY_BASE_MS = 100

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/**
 * Detect a rejected push that a retry can plausibly resolve.
 *
 * The push protocol sends the ref's *current* server value (`oldoid`, read
 * from a fresh ref advertisement) as the expected old value. If another writer
 * updates the ref between that advertisement and the receive-pack, the server
 * rejects the update as "stale info"/"stale ref" — even under `force`, because
 * the mismatch is detected server-side. Re-running the push re-reads a fresh
 * `oldoid`, so a bounded retry converges. isomorphic-git surfaces this as a
 * `GitPushError`; treat those (and explicit stale wording) as retryable.
 */
function isRetryablePushError(err: unknown): boolean {
  const e = err as { code?: string; message?: string; data?: unknown } | null
  if (!e) return false
  if (e.code === "GitPushError") return true
  const text = String(e.message ?? err)
  return /stale|not-fast-forward|rejected|fetch first|failed to update ref/i.test(text)
}

/**
 * Artifacts repo names allow alphanumerics, dots, hyphens and underscores.
 * SpaceDO instance names are already conservative, but sanitize defensively so
 * an unexpected name never fails `create()` with INVALID_REPO_NAME.
 */
function sanitizeRepoName(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9._-]/g, "-").replace(/^-+/, "")
  return cleaned.length > 0 ? cleaned : "space"
}

export interface ArtifactsSyncLogger {
  warn(message: string, ...args: unknown[]): void
  info?(message: string, ...args: unknown[]): void
}

/**
 * Durable persistence for the repo's git remote URL. The URL is only ever
 * surfaced as a by-value result of `create()`/`import()`; a `get()` handle
 * exposes methods only (its data properties are unreadable across the local-dev
 * remote-binding proxy). Cloudflare's guidance is to save the value — so the
 * SpaceDO backs this with durable DO storage, which survives eviction even
 * though the in-memory working tree does not.
 */
export interface ArtifactsRemoteStore {
  read(): Promise<string | null>
  write(remoteUrl: string): Promise<void>
}

/** Dispose an RPC stub/result if it is disposable; never throws. */
function disposeQuietly(value: unknown): void {
  // `Symbol.dispose` is not in the ES2022 lib we target, so look it up at
  // runtime instead of referencing it statically.
  const disposeSym = (Symbol as unknown as { dispose?: symbol }).dispose
  if (!disposeSym || value == null) return
  try {
    const fn = (value as Record<symbol, unknown>)[disposeSym]
    if (typeof fn === "function") (fn as () => void).call(value)
  } catch {
    // best-effort cleanup
  }
}

export class ArtifactsSync {
  private readonly repoName: string
  private remoteUrl: string | null = null
  private remoteRegistered = false
  private token: string | null = null
  private tokenExpiresAt = 0
  /**
   * Serializes pushes within this DO instance. Concurrent pushes to the same
   * branch (e.g. a commit's fire-and-forget mirror overlapping a deploy's push,
   * or rapid successive commits) race on the ref advertisement and get rejected
   * as "stale ref". Chaining pushes eliminates that self-inflicted race.
   */
  private pushQueue: Promise<boolean> = Promise.resolve(true)

  constructor(
    private readonly artifacts: Artifacts,
    private readonly git: Git,
    repoName: string,
    private readonly store?: ArtifactsRemoteStore,
    private readonly logger: ArtifactsSyncLogger = console,
  ) {
    this.repoName = sanitizeRepoName(repoName)
  }

  /**
   * Ensure the app's Artifacts repo exists and the local git repo has an
   * `artifacts` remote pointing at it. Idempotent. Returns false (and logs) if
   * the repo could not be ensured — callers should treat sync as unavailable.
   *
   * Resolution order for the remote URL: in-memory cache -> durable store ->
   * provision (create, persist). This means a cold-started DO (empty in-memory
   * FS) recovers the remote from durable storage without any `get()` handle.
   */
  private async ensureRepo(): Promise<boolean> {
    if (this.remoteRegistered && this.remoteUrl) return true

    try {
      let remote = this.remoteUrl ?? (await this.store?.read()) ?? null
      if (!remote) remote = await this.provisionRemote()
      if (!remote) return false

      this.remoteUrl = remote
      await this.store?.write(remote)
      await this.registerRemote(remote)
      this.remoteRegistered = true
      return true
    } catch (e) {
      this.logger.warn("ArtifactsSync.ensureRepo failed", e)
      return false
    }
  }

  /**
   * Obtain the repo's git remote URL, creating the repo if needed.
   *
   * Only `create()`/`import()` return the `remote` as a by-value RPC result; a
   * `get()` handle exposes methods only, and its data properties cannot be read
   * across the remote-binding proxy used in local dev (they resolve as method
   * calls and throw "does not implement the method"). So we create first and,
   * on ALREADY_EXISTS, fall back to reading the handle's `remote` — which works
   * with the native binding in production; in local dev it may fail, in which
   * case sync degrades to unavailable (best-effort) until a value is persisted.
   */
  private async provisionRemote(): Promise<string | null> {
    let created: ArtifactsCreateRepoResult | null = null
    try {
      created = await this.artifacts.create(this.repoName, { setDefaultBranch: "main" })
      const remote = await created.remote
      try {
        // Reuse the initial token to avoid an extra round-trip on first push.
        this.token = await created.token
        this.tokenExpiresAt = Date.parse(await created.tokenExpiresAt) || 0
      } catch {
        // Token unreadable here — getWriteToken() will mint one on demand.
      }
      return remote
    } catch {
      const repo = await this.artifacts.get(this.repoName).catch(() => null)
      if (!repo) return null
      try {
        return await repo.remote
      } catch (e) {
        this.logger.warn(
          "ArtifactsSync: repo exists but its remote URL is not readable and none is persisted; sync unavailable",
          e,
        )
        return null
      } finally {
        disposeQuietly(repo)
      }
    } finally {
      if (created) disposeQuietly(created)
    }
  }

  private async registerRemote(url: string): Promise<void> {
    try {
      await this.git.remote({ add: { name: REMOTE_NAME, url } })
    } catch {
      // Remote already exists — ensure the URL is current by removing and
      // re-adding (Artifacts remotes are stable, but be defensive).
      try {
        await this.git.remote({ remove: REMOTE_NAME })
        await this.git.remote({ add: { name: REMOTE_NAME, url } })
      } catch (e) {
        this.logger.warn("ArtifactsSync.registerRemote failed", e)
      }
    }
  }

  /** Return a valid write token, minting/refreshing as needed. */
  private async getWriteToken(): Promise<string | null> {
    if (this.token && Date.now() < this.tokenExpiresAt - TOKEN_REFRESH_SKEW_MS) {
      return this.token
    }
    const repo = await this.artifacts.get(this.repoName).catch(() => null)
    if (!repo) {
      this.logger.warn("ArtifactsSync.getWriteToken failed to get repo handle")
      return null
    }
    try {
      // createToken() is a method call whose result is a by-value plain object,
      // so its `plaintext`/`expiresAt` fields are directly readable.
      const result = await repo.createToken("write", TOKEN_TTL_SECONDS)
      this.token = result.plaintext
      this.tokenExpiresAt = Date.parse(result.expiresAt) || 0
      return this.token
    } catch (e) {
      this.logger.warn("ArtifactsSync.getWriteToken failed", e)
      return null
    } finally {
      disposeQuietly(repo)
    }
  }

  /**
   * Mirror `branch` to Artifacts. Best-effort: returns true on success, false
   * (with a logged warning) otherwise. Never throws.
   *
   * Pushes are serialized per DO instance (see `pushQueue`) so overlapping
   * callers can't race each other into a "stale ref" rejection, and each push
   * is retried with backoff to absorb races from any other writer.
   */
  async push(branch: string): Promise<boolean> {
    const run = this.pushQueue.then(
      () => this.pushWithRetry(branch),
      () => this.pushWithRetry(branch),
    )
    // Keep the chain alive regardless of this push's outcome.
    this.pushQueue = run.catch(() => false)
    return run
  }

  /**
   * Guard against destroying remote history. Pushes use `force` (to converge
   * under stale-ref races), which makes them capable of silently REPLACING the
   * remote branch. That is only safe when the local branch contains the remote
   * head. After a cold start the local branch is reconciled onto the fetched
   * head (see `reconcileLocalBranch` in git-objects.ts), so a remote head that
   * is NOT an ancestor of the local head means the histories genuinely
   * diverged (e.g. commits made while the base could not be loaded) — refuse
   * the push instead of deleting earlier commits. When the remote head is
   * unknown (first push, or the base was never fetched) there is nothing
   * verifiable to destroy, so the push proceeds (best-effort sync).
   */
  private async remoteHeadContainedIn(branch: string): Promise<boolean> {
    let remoteHead: string | null = null
    try {
      const tracking = await this.git.log({ ref: `refs/remotes/${REMOTE_NAME}/${branch}`, depth: 1 })
      remoteHead = tracking[0]?.oid ?? null
    } catch {
      return true // No tracking ref — nothing known to protect.
    }
    if (!remoteHead) return true
    try {
      const history = await this.git.log({ ref: branch, depth: 10_000 })
      return history.some((entry) => entry.oid === remoteHead)
    } catch {
      // Local branch unreadable — let the push attempt surface the real error.
      return true
    }
  }

  private async pushWithRetry(branch: string): Promise<boolean> {
    if (!(await this.ensureRepo())) return false
    if (!(await this.remoteHeadContainedIn(branch))) {
      this.logger.warn(
        `ArtifactsSync.push refused for branch "${branch}": local history does not contain the remote head; not force-overwriting remote history`,
      )
      return false
    }

    for (let attempt = 1; attempt <= PUSH_MAX_ATTEMPTS; attempt++) {
      const token = await this.getWriteToken()
      if (!token) return false
      try {
        await this.git.push({
          remote: REMOTE_NAME,
          ref: branch,
          force: true,
          username: "x",
          password: token,
        })
        return true
      } catch (e) {
        const retryable = isRetryablePushError(e)
        if (retryable && attempt < PUSH_MAX_ATTEMPTS) {
          this.logger.warn(
            `ArtifactsSync.push retry ${attempt}/${PUSH_MAX_ATTEMPTS} for branch "${branch}" (stale ref race)`,
          )
          await sleep(PUSH_RETRY_BASE_MS * attempt)
          continue
        }
        this.logger.warn(`ArtifactsSync.push failed for branch "${branch}"`, e)
        return false
      }
    }
    return false
  }

  /**
   * Fetch `branch` from Artifacts to reconcile the local mirror before a
   * restore. Best-effort: returns true on success, false otherwise.
   */
  async fetch(branch: string): Promise<boolean> {
    if (!(await this.ensureRepo())) return false
    const token = await this.getWriteToken()
    if (!token) return false
    try {
      await this.git.fetch({
        remote: REMOTE_NAME,
        ref: branch,
        username: "x",
        password: token,
      })
      return true
    } catch (e) {
      this.logger.warn(`ArtifactsSync.fetch failed for branch "${branch}"`, e)
      return false
    }
  }
}
