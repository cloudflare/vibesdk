/**
 * Object-level git plumbing for `ArtifactsFileSystem`.
 *
 * The shell's `createGit` only exposes porcelain (commit/log/checkout/…), not
 * object reads. `ArtifactsFileSystem` needs to (a) walk a fetched commit tree
 * to build its base snapshot and (b) read individual blobs by oid to hydrate
 * files on demand. This module wraps isomorphic-git's object APIs over a shell
 * `FileSystem`, reusing the same fs adapter shape the shell uses so behavior
 * (ENOENT dispatch, utf8/binary reads) matches `createGit`.
 */
import * as git from "isomorphic-git"
import type { FileSystem } from "@cloudflare/shell"

/** Metadata for one file in the Artifacts base tree. */
export interface BaseEntry {
  oid: string
  mode: number
  /** Byte size, or `undefined` until first computed (lazily, on demand). */
  size?: number
}

/** A loaded base tree: the commit it came from plus its files. */
export interface BaseSnapshot {
  head: string
  files: Map<string, BaseEntry>
}

export interface BaseSnapshotSource {
  /**
   * The base tree (head commit + absolute-path -> entry map), or `null` when no
   * base is available (the FileSystem then behaves as a plain overlay).
   * Implementations must ensure blobs are locally readable via `readBlob`.
   *
   * `null` means "legitimately empty" (no remote repo/branch yet). A transient
   * failure (network blip, fetch timeout) must THROW instead, so callers can
   * retry on a later access rather than caching an empty base forever.
   */
  loadSnapshot(): Promise<BaseSnapshot | null>
  /** Raw bytes of a blob by oid (from the local object store). */
  readBlob(oid: string): Promise<Uint8Array>
}

/** Node `fs.Stats`-shaped object that isomorphic-git expects from stat/lstat. */
class GitStat {
  private readonly type: "file" | "directory" | "symlink"
  readonly size: number
  readonly mtimeMs: number
  readonly ctimeMs: number
  readonly ino = 0
  readonly uid = 0
  readonly gid = 0
  readonly dev = 0
  readonly mode: number
  constructor(stat: { type: "file" | "directory" | "symlink"; size: number; mtime: Date; mode?: number }) {
    this.type = stat.type
    this.size = stat.size
    this.mtimeMs = stat.mtime.getTime()
    this.ctimeMs = this.mtimeMs
    this.mode =
      stat.mode ?? (this.type === "directory" ? 16877 : this.type === "symlink" ? 40960 : 33188)
  }
  isFile() {
    return this.type === "file"
  }
  isDirectory() {
    return this.type === "directory"
  }
  isSymbolicLink() {
    return this.type === "symlink"
  }
}

interface CodedError extends Error {
  code: string
}

/** Ensure a thrown error carries a `.code` isomorphic-git can dispatch on. */
function fsError(path: string, cause: unknown): CodedError {
  if (cause instanceof Error && "code" in cause && typeof (cause as CodedError).code === "string") {
    return cause as CodedError
  }
  const err = new Error(cause instanceof Error ? cause.message : `ENOENT: ${path}`) as CodedError
  err.code = "ENOENT"
  return err
}

/**
 * Build an isomorphic-git compatible fs (`{ promises: { … } }`) from a shell
 * `FileSystem`. Mirrors `@cloudflare/shell`'s internal adapter so object reads
 * behave exactly like `createGit`'s.
 */
export function createGitFs(fs: FileSystem): git.FsClient {
  return {
    promises: {
      async readFile(path: string, options?: string | { encoding?: string }) {
        const encoding = typeof options === "string" ? options : options?.encoding
        try {
          if (encoding === "utf8" || encoding === "utf-8") return await fs.readFile(path)
          return await fs.readFileBytes(path)
        } catch (err) {
          throw fsError(path, err)
        }
      },
      async writeFile(path: string, data: string | Uint8Array) {
        const parent = path.replace(/\/[^/]+$/, "")
        if (parent && parent !== "/" && parent !== path) {
          try {
            await fs.mkdir(parent, { recursive: true })
          } catch {
            // parent may already exist
          }
        }
        if (typeof data === "string") await fs.writeFile(path, data)
        else await fs.writeFileBytes(path, data)
      },
      async unlink(path: string) {
        try {
          await fs.rm(path)
        } catch (err) {
          throw fsError(path, err)
        }
      },
      async readdir(path: string) {
        return fs.readdir(path)
      },
      async mkdir(path: string, mode?: { recursive?: boolean }) {
        const recursive = typeof mode === "object" ? Boolean(mode.recursive) : false
        await fs.mkdir(path, { recursive })
      },
      async rmdir(path: string) {
        await fs.rm(path)
      },
      async stat(path: string) {
        try {
          return new GitStat(await fs.stat(path))
        } catch (err) {
          throw fsError(path, err)
        }
      },
      async lstat(path: string) {
        try {
          return new GitStat(await fs.lstat(path))
        } catch (err) {
          throw fsError(path, err)
        }
      },
      async readlink(path: string) {
        try {
          return await fs.readlink(path)
        } catch (err) {
          throw fsError(path, err)
        }
      },
      async symlink(target: string, path: string) {
        await fs.symlink(target, path)
      },
      async chmod() {
        // no-op: the Workspace FS does not track unix modes
      },
    },
  } as git.FsClient
}

/** Resolve a ref (branch, remote-tracking ref, or oid) to a commit oid, or null. */
export async function resolveHead(fs: FileSystem, ref: string): Promise<string | null> {
  try {
    return await git.resolveRef({ fs: createGitFs(fs), dir: "/", ref })
  } catch {
    return null
  }
}

/**
 * Walk the tree of `commitOid`, returning every file as an absolute-path ->
 * `BaseEntry` map. Does not read blob contents (fast, index-only); `size` is
 * left undefined and computed lazily on demand.
 */
export async function walkTreeFiles(
  fs: FileSystem,
  commitOid: string,
): Promise<Map<string, BaseEntry>> {
  const gitFs = createGitFs(fs)
  const entries = (await git.walk({
    fs: gitFs,
    dir: "/",
    trees: [git.TREE({ ref: commitOid })],
    map: async (filepath, walkerEntries) => {
      if (filepath === ".") return undefined
      const entry = walkerEntries?.[0]
      if (!entry) return undefined
      if ((await entry.type()) !== "blob") return undefined
      return {
        path: "/" + filepath,
        oid: await entry.oid(),
        mode: await entry.mode(),
      }
    },
  })) as Array<{ path: string; oid: string; mode: number }>

  const map = new Map<string, BaseEntry>()
  for (const e of entries) {
    if (!e) continue
    map.set(e.path, { oid: e.oid, mode: e.mode })
  }
  return map
}

/** Read a blob's bytes by oid from the local object store. */
export async function readBlobBytes(fs: FileSystem, oid: string): Promise<Uint8Array> {
  const { blob } = await git.readBlob({ fs: createGitFs(fs), dir: "/", oid })
  return blob
}

/**
 * Point the local branch at the fetched head when it is unborn (the cold-start
 * case). isomorphic-git's `fetch` only updates the remote-tracking ref, so
 * without this the next commit after a restart would be a ROOT commit with no
 * ancestry — and the mirrored `push(force)` would replace the remote branch,
 * silently destroying all earlier history/restore points. An existing local
 * branch is never clobbered: local commits must not be lost.
 */
async function reconcileLocalBranch(
  fs: FileSystem,
  branch: string,
  head: string,
): Promise<void> {
  if (await resolveHead(fs, `refs/heads/${branch}`)) return
  await git.writeRef({
    fs: createGitFs(fs),
    dir: "/",
    ref: `refs/heads/${branch}`,
    value: head,
    force: true,
  })
}

/**
 * Artifacts-backed `BaseSnapshotSource`: fetches the branch into the overlay's
 * `.git` (via the injected `fetchBranch`, e.g. `ArtifactsSync.fetch`), then
 * walks the fetched commit tree and serves blobs from the local object store.
 */
export function createArtifactsBaseSource(opts: {
  overlay: FileSystem
  branch: string
  /** True when a remote repo is known to exist (e.g. a persisted remote URL). */
  hasRemote: () => Promise<boolean>
  /** Populate the overlay `.git` with the branch's objects. Returns success. */
  fetchBranch: () => Promise<boolean>
}): BaseSnapshotSource {
  const { overlay, branch, hasRemote, fetchBranch } = opts
  return {
    async loadSnapshot() {
      // No remote repo yet — a legitimately empty base (fresh app).
      if (!(await hasRemote())) return null
      // The repo exists but the fetch failed — transient. Throw so the caller
      // retries on a later access instead of caching an empty base (which
      // would hide every previously pushed file for this DO's lifetime).
      if (!(await fetchBranch())) {
        throw new Error(`Artifacts base fetch failed for branch "${branch}"`)
      }
      const head =
        (await resolveHead(overlay, `refs/remotes/artifacts/${branch}`)) ??
        (await resolveHead(overlay, branch))
      // Repo exists but this branch has no commits yet — legitimately empty.
      if (!head) return null
      await reconcileLocalBranch(overlay, branch, head)
      return { head, files: await walkTreeFiles(overlay, head) }
    },
    readBlob(oid) {
      return readBlobBytes(overlay, oid)
    },
  }
}

/**
 * True when the currently-staged index would produce a tree identical to the
 * HEAD commit's tree — i.e. committing now would create an empty commit.
 *
 * Callers stage the workdir first, then use this to skip no-op commits (e.g. a
 * preview redeploy on page reload must not append an empty restore point). An
 * unborn branch (no HEAD yet) returns false so the very first commit proceeds.
 */
export async function stagedTreeMatchesHead(
  fs: FileSystem,
  skip: (absPath: string) => boolean,
): Promise<boolean> {
  const gitFs = createGitFs(fs)
  // Unborn branch (no HEAD): the first commit must always proceed.
  if (!(await resolveHead(fs, "HEAD"))) return false
  try {
    const matrix = await git.statusMatrix({ fs: gitFs, dir: "/" })
    for (const [filepath, head, , stage] of matrix) {
      if (skip(`/${filepath}`)) continue
      // statusMatrix stage codes: 0 absent, 1 identical to HEAD, 2/3 differ.
      // The staged tree equals HEAD only when every entry is either present-
      // and-identical (head 1, stage 1) or absent-on-both (head 0, stage 0).
      const unchanged = (head === 1 && stage === 1) || (head === 0 && stage === 0)
      if (!unchanged) return false
    }
    return true
  } catch {
    // If we cannot determine emptiness, fall through and let the commit happen.
    return false
  }
}

/**
 * Stage the whole working tree (like the shell's `git add .`, which also
 * stages deletions via `statusMatrix`) while skipping reserved paths — the
 * `.afs` bookkeeping file must never enter a commit, or it lands in the
 * Artifacts base tree and pollutes every snapshot.
 */
export async function stageWorkdir(
  fs: FileSystem,
  skip: (absPath: string) => boolean,
): Promise<void> {
  const gitFs = createGitFs(fs)
  const matrix = await git.statusMatrix({ fs: gitFs, dir: "/" })
  for (const [filepath, head, workdir, stage] of matrix) {
    if (skip(`/${filepath}`)) continue
    if (`${head}${workdir}${stage}` === "111") continue
    if (workdir === 0) await git.remove({ fs: gitFs, dir: "/", filepath })
    else await git.add({ fs: gitFs, dir: "/", filepath })
  }
}
