/**
 * ArtifactsFileSystem — an overlay `FileSystem` backed by a Cloudflare Artifacts
 * branch.
 *
 * It composes two layers:
 *   - overlay (writable): an in-memory `InMemoryFs`. Holds all writes/edits,
 *     the `.git` dir, hydrated file contents, and its own bookkeeping under
 *     `/.afs`. Not durable across DO eviction — Artifacts is the source of truth.
 *   - base (read-only): an immutable snapshot of the imported Artifacts branch
 *     (`path -> { oid, mode }`) whose blobs live in the overlay's `.git` object
 *     store after one packfile fetch.
 *
 * Hydration is hybrid: the file index is available as soon as the snapshot is
 * walked (`ready()`), point reads hydrate their own blob on demand, and any
 * directory listing (or `whenFullyMaterialized()`) copies the whole base into
 * the overlay. Once fully materialized, the FS behaves as a plain overlay.
 *
 * When the base snapshot is empty (an Artifacts repo with no commits yet),
 * every operation passes straight through to the overlay — an exact in-memory
 * overlay equivalent — until the first commit establishes a base.
 */
import type { FileSystem, FsStat, EntryType } from "@cloudflare/shell"
import type { BaseEntry, BaseSnapshotSource } from "./git-objects"
import { walkTreeFiles } from "./git-objects"

type MkdirOptions = { recursive?: boolean }
type RmOptions = { recursive?: boolean; force?: boolean }
type CpOptions = { recursive?: boolean }
type Dirent = { name: string; type: EntryType }

/** Path prefixes that are always overlay-only and never resolved from the base. */
const RESERVED_PREFIXES = ["/.git", "/.afs"]
const STATE_PATH = "/.afs/state.json"
const EPOCH = new Date(0)

interface PersistedState {
  version: 1
  headOid: string
  whiteouts: string[]
}

function isReserved(path: string): boolean {
  return RESERVED_PREFIXES.some((p) => path === p || path.startsWith(p + "/"))
}

function enoent(path: string): Error {
  const err = new Error(`ENOENT: no such file or directory, '${path}'`) as Error & { code: string }
  err.code = "ENOENT"
  return err
}

export interface ArtifactsFileSystemOptions {
  /**
   * Base layer. Always required: the SpaceDO is Artifacts-backed, so the FS is
   * never a plain overlay. `loadSnapshot()` may still yield `null` for a repo
   * with no commits yet (a legitimately empty base), in which case the FS acts
   * as an overlay over nothing until the first commit.
   */
  source: BaseSnapshotSource
  /** Branch this FS mirrors (recorded for diagnostics). */
  branch?: string
}

export class ArtifactsFileSystem implements FileSystem {
  private readonly overlay: FileSystem
  private readonly source: BaseSnapshotSource

  private base: Map<string, BaseEntry> | null = null
  private headOid: string | null = null
  private readonly whiteouts = new Set<string>()

  private readyPromise: Promise<void> | null = null
  private materializePromise: Promise<void> | null = null

  constructor(overlay: FileSystem, options: ArtifactsFileSystemOptions) {
    this.overlay = overlay
    this.source = options.source
  }

  // ── Readiness / hydration ───────────────────────────────────────

  /** Ensure the base snapshot (file index) is loaded. Fast; no blob copies. */
  ready(): Promise<void> {
    if (!this.readyPromise) this.readyPromise = this.init()
    return this.readyPromise
  }

  /** Ensure every base file is materialized into the overlay. */
  whenFullyMaterialized(): Promise<void> {
    if (!this.materializePromise) this.materializePromise = this.materializeAll()
    return this.materializePromise
  }

  /**
   * Ensure a single path's content is present in the overlay (hydrating it from
   * the base on demand). Lets callers that read through the underlying Workspace
   * still observe base files. No-op for reserved/overlay-only paths.
   */
  async hydrate(path: string): Promise<void> {
    if (isReserved(path)) return
    await this.ready()
    await this.materialize(path)
  }

  private async init(): Promise<void> {
    // Prefer a cheap local rebuild from persisted state (no network): the
    // fetched objects live durably in the overlay `.git`, so we can re-walk.
    const state = await this.readState()
    if (state) {
      try {
        this.base = await walkTreeFiles(this.overlay, state.headOid)
        this.headOid = state.headOid
        for (const w of state.whiteouts) this.whiteouts.add(w)
        return
      } catch {
        // Objects missing/corrupt — fall through to a fresh load.
      }
    }

    const snapshot = await this.source.loadSnapshot()
    if (!snapshot) {
      // Repo has no commits yet — a legitimately empty base.
      this.base = null
      return
    }
    this.base = snapshot.files
    this.headOid = snapshot.head
    await this.writeState()
  }

  private async materializeAll(): Promise<void> {
    await this.ready()
    if (!this.base) return
    for (const [path, entry] of this.base) {
      if (this.whiteouts.has(path)) continue
      if (await this.overlay.exists(path)) continue
      const bytes = await this.source.readBlob(entry.oid)
      await this.overlay.writeFileBytes(path, bytes)
    }
  }

  private async materializeUnder(prefix: string): Promise<void> {
    await this.ready()
    if (!this.base) return
    const dirPrefix = prefix.endsWith("/") ? prefix : prefix + "/"
    for (const [path, entry] of this.base) {
      if (path !== prefix && !path.startsWith(dirPrefix)) continue
      if (this.whiteouts.has(path)) continue
      if (await this.overlay.exists(path)) continue
      const bytes = await this.source.readBlob(entry.oid)
      await this.overlay.writeFileBytes(path, bytes)
    }
  }

  /** Copy a single base file into the overlay if needed. Returns true if the path is now a file. */
  private async materialize(path: string): Promise<boolean> {
    if (await this.overlay.exists(path)) return true
    if (isReserved(path) || !this.base) return false
    if (this.whiteouts.has(path)) return false
    const entry = this.base.get(path)
    if (!entry) return false
    const bytes = await this.source.readBlob(entry.oid)
    await this.overlay.writeFileBytes(path, bytes)
    entry.size = bytes.length
    return true
  }

  // ── Base helpers ────────────────────────────────────────────────

  private baseHasFile(path: string): boolean {
    return !!this.base && this.base.has(path) && !this.whiteouts.has(path)
  }

  private baseHasDir(path: string): boolean {
    if (!this.base) return false
    const prefix = path.endsWith("/") ? path : path + "/"
    for (const key of this.base.keys()) {
      if (key.startsWith(prefix) && !this.whiteouts.has(key)) return true
    }
    return false
  }

  private async computeSize(entry: BaseEntry): Promise<number> {
    if (entry.size !== undefined) return entry.size
    const bytes = await this.source.readBlob(entry.oid)
    entry.size = bytes.length
    return entry.size
  }

  private async clearWhiteout(path: string): Promise<void> {
    if (this.whiteouts.delete(path)) await this.writeState()
  }

  private async addWhiteouts(paths: string[]): Promise<void> {
    let changed = false
    for (const p of paths) if (!this.whiteouts.has(p)) (this.whiteouts.add(p), (changed = true))
    if (changed) await this.writeState()
  }

  private async readState(): Promise<PersistedState | null> {
    try {
      const raw = await this.overlay.readFile(STATE_PATH)
      const parsed = JSON.parse(raw) as PersistedState
      if (parsed.version !== 1 || typeof parsed.headOid !== "string") return null
      return parsed
    } catch {
      return null
    }
  }

  private async writeState(): Promise<void> {
    if (!this.headOid) return
    const state: PersistedState = {
      version: 1,
      headOid: this.headOid,
      whiteouts: [...this.whiteouts],
    }
    try {
      await this.overlay.mkdir("/.afs", { recursive: true })
    } catch {
      // already exists
    }
    await this.overlay.writeFile(STATE_PATH, JSON.stringify(state))
  }

  // ── FileSystem: reads ───────────────────────────────────────────

  async readFile(path: string): Promise<string> {
    if (isReserved(path)) return this.overlay.readFile(path)
    await this.ready()
    if (this.base && !(await this.overlay.exists(path)) && this.baseHasFile(path)) {
      await this.materialize(path)
    }
    return this.overlay.readFile(path)
  }

  async readFileBytes(path: string): Promise<Uint8Array> {
    if (isReserved(path)) return this.overlay.readFileBytes(path)
    await this.ready()
    if (this.base && !(await this.overlay.exists(path)) && this.baseHasFile(path)) {
      await this.materialize(path)
    }
    return this.overlay.readFileBytes(path)
  }

  async exists(path: string): Promise<boolean> {
    if (isReserved(path)) return this.overlay.exists(path)
    await this.ready()
    if (await this.overlay.exists(path)) return true
    return this.baseHasFile(path) || this.baseHasDir(path)
  }

  async stat(path: string): Promise<FsStat> {
    return this.statImpl(path, false)
  }

  async lstat(path: string): Promise<FsStat> {
    return this.statImpl(path, true)
  }

  private async statImpl(path: string, l: boolean): Promise<FsStat> {
    if (isReserved(path)) return l ? this.overlay.lstat(path) : this.overlay.stat(path)
    await this.ready()
    if (await this.overlay.exists(path)) {
      return l ? this.overlay.lstat(path) : this.overlay.stat(path)
    }
    if (this.base) {
      const entry = this.base.get(path)
      if (entry && !this.whiteouts.has(path)) {
        return { type: "file", size: await this.computeSize(entry), mtime: EPOCH, mode: entry.mode }
      }
      if (this.baseHasDir(path)) {
        return { type: "directory", size: 0, mtime: EPOCH }
      }
    }
    throw enoent(path)
  }

  // ── FileSystem: listing (delegates after full materialization) ──

  async glob(pattern: string): Promise<string[]> {
    await this.whenFullyMaterialized()
    const paths = await this.overlay.glob(pattern)
    return paths.filter((p) => !isReserved(p) || p.startsWith("/.git"))
  }

  async readdir(path: string): Promise<string[]> {
    if (isReserved(path)) return this.overlay.readdir(path)
    await this.whenFullyMaterialized()
    const names = await this.overlay.readdir(path)
    return path === "/" ? names.filter((n) => n !== ".afs") : names
  }

  async readdirWithFileTypes(path: string): Promise<Dirent[]> {
    if (isReserved(path)) return this.overlay.readdirWithFileTypes(path)
    await this.whenFullyMaterialized()
    const entries = await this.overlay.readdirWithFileTypes(path)
    return path === "/" ? entries.filter((e) => e.name !== ".afs") : entries
  }

  // ── FileSystem: writes ──────────────────────────────────────────

  async writeFile(path: string, content: string): Promise<void> {
    await this.overlay.writeFile(path, content)
    if (!isReserved(path)) await this.clearWhiteout(path)
  }

  async writeFileBytes(path: string, content: Uint8Array): Promise<void> {
    await this.overlay.writeFileBytes(path, content)
    if (!isReserved(path)) await this.clearWhiteout(path)
  }

  async appendFile(path: string, content: string | Uint8Array): Promise<void> {
    if (!isReserved(path)) {
      await this.ready()
      await this.materialize(path)
    }
    await this.overlay.appendFile(path, content)
    if (!isReserved(path)) await this.clearWhiteout(path)
  }

  async mkdir(path: string, options?: MkdirOptions): Promise<void> {
    await this.overlay.mkdir(path, options)
  }

  async rm(path: string, options?: RmOptions): Promise<void> {
    if (isReserved(path)) return this.overlay.rm(path, options)
    await this.ready()
    const inOverlay = await this.overlay.exists(path)
    const covered = !!this.base && (this.baseHasFile(path) || this.baseHasDir(path))

    if (inOverlay) {
      await this.overlay.rm(path, options)
    } else if (!covered && !options?.force) {
      // Neither overlay nor base has it — let the overlay raise ENOENT.
      await this.overlay.rm(path, options)
    }

    if (covered && this.base) {
      const whiteout: string[] = []
      if (this.baseHasFile(path)) whiteout.push(path)
      const dirPrefix = path.endsWith("/") ? path : path + "/"
      for (const key of this.base.keys()) {
        if (key.startsWith(dirPrefix) && !this.whiteouts.has(key)) whiteout.push(key)
      }
      await this.addWhiteouts(whiteout)
    }
  }

  async cp(src: string, dest: string, options?: CpOptions): Promise<void> {
    if (!isReserved(src)) {
      await this.ready()
      if (this.baseHasDir(src)) await this.materializeUnder(src)
      else await this.materialize(src)
    }
    await this.overlay.cp(src, dest, options)
    if (!isReserved(dest)) await this.clearWhiteout(dest)
  }

  async mv(src: string, dest: string): Promise<void> {
    if (!isReserved(src)) {
      await this.ready()
      if (this.baseHasDir(src)) await this.materializeUnder(src)
      else await this.materialize(src)
    }
    await this.overlay.mv(src, dest)
    if (!isReserved(src) && this.base) {
      const whiteout: string[] = []
      if (this.baseHasFile(src)) whiteout.push(src)
      const dirPrefix = src.endsWith("/") ? src : src + "/"
      for (const key of this.base.keys()) {
        if (key.startsWith(dirPrefix) && !this.whiteouts.has(key)) whiteout.push(key)
      }
      await this.addWhiteouts(whiteout)
    }
    if (!isReserved(dest)) await this.clearWhiteout(dest)
  }

  async symlink(target: string, linkPath: string): Promise<void> {
    await this.overlay.symlink(target, linkPath)
    if (!isReserved(linkPath)) await this.clearWhiteout(linkPath)
  }

  async readlink(path: string): Promise<string> {
    if (!isReserved(path)) {
      await this.ready()
      await this.materialize(path)
    }
    return this.overlay.readlink(path)
  }

  async realpath(path: string): Promise<string> {
    if (!isReserved(path)) {
      await this.ready()
      await this.materialize(path)
    }
    return this.overlay.realpath(path)
  }

  resolvePath(base: string, path: string): string {
    return this.overlay.resolvePath(base, path)
  }
}
