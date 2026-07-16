/**
 * Cloudflare Artifacts sync for the SpaceDO.
 *
 * Artifacts is a git-compatible, versioned remote (see
 * https://developers.cloudflare.com/artifacts/). Each app gets its own repo,
 * and the SpaceDO mirrors every commit/deploy there via `git push` so Artifacts
 * is the durable source of truth for history — the SpaceDO's local isomorphic-git
 * (backed by the Workspace SQLite FS) remains the live working tree used to
 * build/serve previews.
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

export class ArtifactsSync {
  private readonly repoName: string
  private remoteUrl: string | null = null
  private remoteRegistered = false
  private token: string | null = null
  private tokenExpiresAt = 0

  constructor(
    private readonly artifacts: Artifacts,
    private readonly git: Git,
    repoName: string,
    private readonly logger: ArtifactsSyncLogger = console,
  ) {
    this.repoName = sanitizeRepoName(repoName)
  }

  /**
   * Ensure the app's Artifacts repo exists and the local git repo has an
   * `artifacts` remote pointing at it. Idempotent. Returns false (and logs) if
   * the repo could not be ensured — callers should treat sync as unavailable.
   */
  private async ensureRepo(): Promise<boolean> {
    if (this.remoteRegistered && this.remoteUrl) return true

    try {
      let remote: string
      try {
        const existing = await this.artifacts.get(this.repoName)
        remote = existing.remote
      } catch {
        // Not found (or not ready) — create it. `create` throws ALREADY_EXISTS
        // on a race; fall back to get in that case.
        try {
          const created = await this.artifacts.create(this.repoName, {
            setDefaultBranch: "main",
          })
          remote = created.remote
          // `create` hands back an initial token — reuse it to avoid an extra
          // round-trip on the first push.
          this.token = created.token
          this.tokenExpiresAt = Date.parse(created.tokenExpiresAt) || 0
        } catch {
          const existing = await this.artifacts.get(this.repoName)
          remote = existing.remote
        }
      }

      this.remoteUrl = remote
      await this.registerRemote(remote)
      this.remoteRegistered = true
      return true
    } catch (e) {
      this.logger.warn("ArtifactsSync.ensureRepo failed", e)
      return false
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
    try {
      const repo = await this.artifacts.get(this.repoName)
      const result = await repo.createToken("write", TOKEN_TTL_SECONDS)
      this.token = result.plaintext
      this.tokenExpiresAt = Date.parse(result.expiresAt) || 0
      return this.token
    } catch (e) {
      this.logger.warn("ArtifactsSync.getWriteToken failed", e)
      return null
    }
  }

  /**
   * Mirror `branch` to Artifacts. Best-effort: returns true on success, false
   * (with a logged warning) otherwise. Never throws.
   */
  async push(branch: string): Promise<boolean> {
    if (!(await this.ensureRepo())) return false
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
      this.logger.warn(`ArtifactsSync.push failed for branch "${branch}"`, e)
      return false
    }
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
