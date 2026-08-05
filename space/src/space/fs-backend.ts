import {
  createWorkspaceStateBackend,
  FileSystemStateBackend,
  InMemoryFs,
  Workspace,
  WorkspaceFileSystem,
  type FileSystem,
} from "@cloudflare/shell"
import { createGit, type Git } from "@cloudflare/shell/git"
import type { Env } from "../env"
import { ArtifactsFileSystem } from "./artifacts-fs"
import { ArtifactsSync, type ArtifactsRemoteStore } from "./artifacts-sync"
import { CheckpointStore } from "./checkpoint"
import { createArtifactsBaseSource } from "./git-objects"

export const ARTIFACTS_REMOTE_URL_KEY = "artifacts:remoteUrl"
export const SPACE_FS_BACKEND_KEY = "space:fsBackend"
const ARTIFACTS_BASE_BRANCH = "main"
const ARTIFACTS_INIT_TIMEOUT_MS = 10_000
const CHECKPOINT_DEBOUNCE_MS = 2_000

export type SpaceFsBackendMode = "artifacts" | "sql"

export async function resolveSpaceFsBackendMode(
  storage: Pick<DurableObjectStorage, "get" | "put" | "sql">,
  env: Pick<Env, "ENABLE_ARTIFACTS" | "ARTIFACTS">,
): Promise<SpaceFsBackendMode> {
  let mode = await storage.get<SpaceFsBackendMode>(SPACE_FS_BACKEND_KEY)
  if (mode) return mode

  const priorArtifacts = (await storage.get<string>(ARTIFACTS_REMOTE_URL_KEY)) !== undefined
  let hasCheckpoint = false
  try {
    hasCheckpoint = storage.sql.exec("SELECT 1 FROM space_checkpoint LIMIT 1").toArray().length > 0
  } catch {}
  const artifactsEnabled = env.ENABLE_ARTIFACTS === "true" && !!env.ARTIFACTS
  mode = priorArtifacts || hasCheckpoint || artifactsEnabled ? "artifacts" : "sql"
  await storage.put(SPACE_FS_BACKEND_KEY, mode)
  return mode
}

export interface SpaceFsBackend {
  readonly fs: FileSystem
  readonly overlay: FileSystem
  readonly git: Git
  readonly stateBackend: FileSystemStateBackend
  ready(): Promise<void>
  hydrate(path: string): Promise<void>
  materializeAll(): Promise<void>
  flushCheckpoint(): Promise<void>
  push(branch: string): Promise<boolean>
  fetch(branch: string): Promise<void>
}

function isReservedPath(path: string): boolean {
  return path === "/.git" || path.startsWith("/.git/") || path === "/.afs" || path.startsWith("/.afs/")
}

async function withTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error("Operation timed out")), timeoutMs)
      }),
    ])
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}

export class ArtifactsBackend implements SpaceFsBackend {
  readonly overlay: FileSystem
  readonly fs: FileSystem
  readonly git: Git
  readonly stateBackend: FileSystemStateBackend
  private readonly remoteStore: ArtifactsRemoteStore
  private readonly checkpointStore: CheckpointStore
  private readonly checkpointDirty = new Set<string>()
  private checkpointTimer: ReturnType<typeof setTimeout> | null = null
  private artifactsSync?: ArtifactsSync

  constructor(
    ctx: DurableObjectState,
    private readonly env: Env,
    private readonly repoName: string,
  ) {
    if (!env.ARTIFACTS) throw new Error("SpaceDO is pinned to Artifacts but the ARTIFACTS binding is unavailable")

    const overlay = new InMemoryFs()
    this.overlay = overlay
    this.remoteStore = {
      read: () => ctx.storage.get<string>(ARTIFACTS_REMOTE_URL_KEY).then((value) => value ?? null),
      write: (url) => ctx.storage.put(ARTIFACTS_REMOTE_URL_KEY, url).then(() => undefined),
    }
    const fetchSync = new ArtifactsSync(env.ARTIFACTS, createGit(overlay), repoName, this.remoteStore)
    const source = createArtifactsBaseSource({
      overlay,
      branch: ARTIFACTS_BASE_BRANCH,
      hasRemote: async () => (await this.remoteStore.read()) !== null,
      fetchBranch: async () => {
        try {
          return await withTimeout(fetchSync.fetch(ARTIFACTS_BASE_BRANCH), ARTIFACTS_INIT_TIMEOUT_MS)
        } catch {
          return false
        }
      },
    })
    this.checkpointStore = new CheckpointStore(ctx.storage)
    this.fs = new ArtifactsFileSystem(overlay, {
      source,
      branch: ARTIFACTS_BASE_BRANCH,
      checkpoint: this.checkpointStore,
      onChange: (path) => this.noteCheckpointDirty(path),
    })
    this.git = createGit(this.fs)
    this.stateBackend = new FileSystemStateBackend(overlay)
  }

  async ready(): Promise<void> {
    try {
      await (this.fs as ArtifactsFileSystem).ready()
    } catch {
      // Base fetch failed this time — proceed with whatever is local.
    }
  }

  async hydrate(path: string): Promise<void> {
    await (this.fs as ArtifactsFileSystem).hydrate(path)
  }

  async materializeAll(): Promise<void> {
    await (this.fs as ArtifactsFileSystem).whenFullyMaterialized()
  }

  async flushCheckpoint(): Promise<void> {
    if (this.checkpointDirty.size === 0) return
    const paths = [...this.checkpointDirty]
    this.checkpointDirty.clear()
    for (const path of paths) {
      try {
        if (await this.overlay.exists(path)) {
          const stat = await this.overlay.stat(path)
          if (stat.type !== "directory") this.checkpointStore.save(path, await this.overlay.readFileBytes(path))
        } else {
          this.checkpointStore.save(path, null)
        }
      } catch (error) {
        console.warn(`Checkpoint flush failed for ${path}`, error)
      }
    }
  }

  async push(branch: string): Promise<boolean> {
    const pushed = await this.getArtifactsSync().push(branch)
    if (pushed) this.resetCheckpointAfterPush()
    return pushed
  }

  async fetch(branch: string): Promise<void> {
    await this.getArtifactsSync().fetch(branch)
  }

  private noteCheckpointDirty(path: string): void {
    if (isReservedPath(path)) return
    this.checkpointDirty.add(path)
    if (this.checkpointTimer !== null) return
    this.checkpointTimer = setTimeout(() => {
      this.checkpointTimer = null
      void this.flushCheckpoint()
    }, CHECKPOINT_DEBOUNCE_MS)
  }

  private resetCheckpointAfterPush(): void {
    try {
      this.checkpointStore.clear()
      void this.flushCheckpoint()
    } catch (error) {
      console.warn("Checkpoint reset after push failed", error)
    }
  }

  private getArtifactsSync(): ArtifactsSync {
    if (this.artifactsSync) return this.artifactsSync
    this.artifactsSync = new ArtifactsSync(this.requireArtifacts(), this.git, this.repoName, this.remoteStore)
    return this.artifactsSync
  }

  private requireArtifacts(): Artifacts {
    const artifacts = this.env.ARTIFACTS
    if (!artifacts) throw new Error("SpaceDO is pinned to Artifacts but the ARTIFACTS binding is unavailable")
    return artifacts
  }
}

export class SqlBackend implements SpaceFsBackend {
  readonly overlay: FileSystem
  readonly fs: FileSystem
  readonly git: Git
  readonly stateBackend: FileSystemStateBackend

  constructor(ctx: DurableObjectState, repoName: string) {
    const workspace = new Workspace({ sql: ctx.storage.sql, name: () => repoName })
    const fs = new WorkspaceFileSystem(workspace)
    this.overlay = fs
    this.fs = fs
    this.git = createGit(fs)
    this.stateBackend = createWorkspaceStateBackend(workspace)
  }

  async ready(): Promise<void> {}
  async hydrate(_path: string): Promise<void> {}
  async materializeAll(): Promise<void> {}
  async flushCheckpoint(): Promise<void> {}
  async push(_branch: string): Promise<boolean> { return false }
  async fetch(_branch: string): Promise<void> {}
}
