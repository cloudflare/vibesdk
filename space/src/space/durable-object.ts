import { DurableObject } from "cloudflare:workers"
import {
  Workspace,
  WorkspaceFileSystem,
  createWorkspaceStateBackend,
  type FileSystemStateBackend,
  type FileInfo,
} from "@cloudflare/shell"
import { createGit, type Git, type GitLogEntry, type GitStatusEntry } from "@cloudflare/shell/git"
import type { Env } from "../env"
import { handleInfoRefs, handleUploadPack, handleReceivePack, handleHead, type GitHttpContext } from "./git-smart-http"
import { handleDeployCommand, type DeployContext } from "./deploy-engine"
import { handleAssetRequest, buildAssetManifest, createMemoryStorage, type AssetConfig } from "@cloudflare/worker-bundler"
import {
  buildInspectorWrapperSource,
  VIBE_APP_MODULE,
} from "./inspector-wrapper"

// ─── Inspector result types ────────────────────────────────────────────────
// These mirror the shapes returned by the wrapper-subclass injected into
// the dynamic worker (see `inspector-wrapper.ts`). Re-exported at the
// package boundary so the host controller types match.

export interface AppDatabaseColumn {
  name: string
  type: string
  notnull: number
  pk: number
}
export interface AppDatabaseTable {
  name: string
  rowCount: number
  columns: AppDatabaseColumn[]
}
export interface AppDatabaseReadResult {
  columns: string[]
  rows: Record<string, unknown>[]
  totalCount: number
}

export interface AppTableQueryOpts {
  limit?: number
  offset?: number
  orderBy?: string
  orderDir?: "asc" | "desc"
}

interface DeploymentRow {
  branch: string
  commitHash: string
  mainModule: string
  modules: Record<string, string | Record<string, unknown>>
  assets: Record<string, string>
  assetConfig: AssetConfig
}

// ─── SpaceDO ────────────────────────────────────────────────────────────────
// Agent space Durable Object backed by @cloudflare/shell.
//
// Each named instance provides an isolated filesystem + git repo.
// The host worker calls methods via DO RPC (same worker, no HTTP).
// External git clients can use Smart HTTP via the forwarded routes.

export class SpaceDO extends DurableObject<Env> {
  private workspace: Workspace
  private fs: WorkspaceFileSystem
  private git: Git
  private stateBackend: FileSystemStateBackend
  private initialized = false

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)

    this.workspace = new Workspace({
      sql: ctx.storage.sql,
      name: () => ctx.id.name ?? "space",
    })

    this.fs = new WorkspaceFileSystem(this.workspace)
    this.git = createGit(this.fs)
    this.stateBackend = createWorkspaceStateBackend(this.workspace)
  }

  private async ensureInit(): Promise<void> {
    if (this.initialized) return
    this.initialized = true

    // Create extra tables needed for deploy engine and git smart HTTP
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS deployments (
        branch TEXT PRIMARY KEY,
        commit_hash TEXT NOT NULL,
        main_module TEXT NOT NULL,
        modules TEXT NOT NULL,
        assets TEXT NOT NULL DEFAULT '{}',
        asset_config TEXT NOT NULL DEFAULT '{}',
        deployed_at INTEGER NOT NULL
      )
    `)

    // Migrate existing deployments tables that lack new columns
    try { this.ctx.storage.sql.exec(`ALTER TABLE deployments ADD COLUMN assets TEXT NOT NULL DEFAULT '{}'`) } catch {}
    try { this.ctx.storage.sql.exec(`ALTER TABLE deployments ADD COLUMN asset_config TEXT NOT NULL DEFAULT '{}'`) } catch {}

    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS refs (
        name TEXT PRIMARY KEY,
        hash TEXT NOT NULL
      )
    `)

    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS git_internal (
        path TEXT PRIMARY KEY,
        content BLOB NOT NULL
      )
    `)

    // Initialize git repo if not already done
    try {
      await this.git.init({ defaultBranch: "main" })
    } catch {
      // Already initialized — ignore
    }
  }

  // ── Filesystem RPC methods ──────────────────────────────────────

  async readFile(path: string, opts?: { offset?: number; limit?: number }): Promise<string> {
    await this.ensureInit()
    const content = await this.workspace.readFile(path)
    if (content === null) throw new Error(`File not found: ${path}`)

    if (opts?.offset !== undefined || opts?.limit !== undefined) {
      const lines = content.split("\n")
      const start = (opts.offset ?? 1) - 1
      const end = opts.limit !== undefined ? start + opts.limit : lines.length
      return lines
        .slice(start, end)
        .map((line, i) => `${start + i + 1}\t${line}`)
        .join("\n")
    }

    return content
  }

  async writeFile(path: string, content: string): Promise<{ path: string; size: number }> {
    await this.ensureInit()
    await this.workspace.writeFile(path, content)
    return { path, size: content.length }
  }

  async editFile(path: string, oldString: string, newString: string): Promise<{ path: string; size: number }> {
    await this.ensureInit()
    const result = await this.stateBackend.replaceInFile(path, oldString, newString)
    if (result.replaced === 0) {
      throw new Error(`old_string not found in ${path}`)
    }
    // Read back size
    const content = await this.workspace.readFile(path)
    return { path, size: content?.length ?? 0 }
  }

  async deleteFile(path: string): Promise<void> {
    await this.ensureInit()
    await this.workspace.deleteFile(path)
  }

  async glob(pattern: string): Promise<string[]> {
    await this.ensureInit()
    const files = await this.workspace.glob(pattern)
    return files
      .filter((f: FileInfo) => f.type === "file")
      .sort((a: FileInfo, b: FileInfo) => b.updatedAt - a.updatedAt)
      .map((f: FileInfo) => f.path)
  }

  async grep(query: string, include?: string): Promise<Array<{ path: string; line: number; content: string }>> {
    await this.ensureInit()
    const results = await this.stateBackend.searchFiles(include ?? "**/*", query)
    const matches: Array<{ path: string; line: number; content: string }> = []
    for (const file of results) {
      for (const match of file.matches) {
        matches.push({
          path: file.path,
          line: match.line,
          content: match.lineText,
        })
      }
    }
    return matches
  }

  async list(prefix?: string): Promise<Array<{ path: string; mtime: number }>> {
    await this.ensureInit()
    const pattern = prefix ? `${prefix.replace(/^\//, "")}/**/*` : "**/*"
    const files = await this.workspace.glob(pattern)
    return files
      .filter((f: FileInfo) => f.type === "file")
      .map((f: FileInfo) => ({ path: f.path, mtime: f.updatedAt }))
  }

  // ── Workspace RPC methods consumed by VibeSDK's Think workspace tools ──
  // These mirror the `@cloudflare/shell` Workspace surface 1:1 so the host's
  // `createSpaceWorkspaceOps()` adapter can back `@cloudflare/think`'s
  // read/write/edit/list/find/grep/delete tools with this SpaceDO.

  async stat(path: string): Promise<FileInfo | null> {
    await this.ensureInit()
    return this.workspace.stat(path)
  }

  async readFileBytes(path: string): Promise<Uint8Array | null> {
    await this.ensureInit()
    return this.workspace.readFileBytes(path)
  }

  async readDir(dir?: string, opts?: { limit?: number; offset?: number }): Promise<FileInfo[]> {
    await this.ensureInit()
    return this.workspace.readDir(dir, opts)
  }

  async mkdir(path: string, opts?: { recursive?: boolean }): Promise<void> {
    await this.ensureInit()
    await this.workspace.mkdir(path, opts)
  }

  async rm(path: string, opts?: { recursive?: boolean; force?: boolean }): Promise<void> {
    await this.ensureInit()
    await this.workspace.rm(path, opts)
  }

  async patch(diff: string): Promise<{ applied: string[]; failed: string[] }> {
    await this.ensureInit()
    const edits = parseUnifiedDiffToEdits(diff)
    const applied: string[] = []
    const failed: string[] = []

    for (const edit of edits) {
      try {
        await this.workspace.writeFile(edit.path, edit.content)
        applied.push(edit.path)
      } catch {
        failed.push(edit.path)
      }
    }

    return { applied, failed }
  }

  // ── Git RPC methods ─────────────────────────────────────────────

  async gitCommit(
    message: string,
    author?: { name: string; email: string }
  ): Promise<{ sha: string; message: string }> {
    await this.ensureInit()
    await this.git.add({ filepath: "." })
    const result = await this.git.commit({
      message,
      author: author ?? { name: "Agent", email: "agent@vibesdk.local" },
    })
    return { sha: result.oid, message: result.message }
  }

  async gitLog(limit?: number): Promise<GitLogEntry[]> {
    await this.ensureInit()
    return this.git.log({ depth: limit })
  }

  async gitStatus(): Promise<GitStatusEntry[]> {
    await this.ensureInit()
    return this.git.status()
  }

  async gitCheckout(ref: string): Promise<void> {
    await this.ensureInit()
    await this.git.checkout({ ref })
  }

  async gitBranch(opts?: { name?: string; list?: boolean; delete?: string }) {
    await this.ensureInit()
    return this.git.branch(opts)
  }

  async gitDiff(): Promise<Array<{ filepath: string; status: string }>> {
    await this.ensureInit()
    return this.git.diff()
  }

  // ── Deploy RPC methods ──────────────────────────────────────────

  async deploy(branch: string): Promise<unknown> {
    await this.ensureInit()
    const fakeRequest = new Request("http://internal/?cmd=deploy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ branch }),
    })
    const ctx: DeployContext = {
      sql: this.ctx.storage.sql,
      git: this.git,
      workspace: this.workspace,
    }
    const res = await handleDeployCommand(ctx, "deploy", fakeRequest)
    const data = await res.json() as Record<string, unknown>
    const spaceName = this.ctx.id.name ?? "space"
    data.preview_url = `/space/${spaceName}/preview/${encodeURIComponent(branch)}/`
    return data
  }

  async undeploy(branch: string): Promise<unknown> {
    await this.ensureInit()
    const fakeRequest = new Request("http://internal/?cmd=undeploy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ branch }),
    })
    const ctx: DeployContext = {
      sql: this.ctx.storage.sql,
      git: this.git,
      workspace: this.workspace,
    }
    const res = await handleDeployCommand(ctx, "undeploy", fakeRequest)
    return res.json()
  }

  async listDeployments(): Promise<unknown> {
    await this.ensureInit()
    const fakeRequest = new Request("http://internal/?cmd=list_deployments")
    const ctx: DeployContext = {
      sql: this.ctx.storage.sql,
      git: this.git,
      workspace: this.workspace,
    }
    const res = await handleDeployCommand(ctx, "list_deployments", fakeRequest)
    return res.json()
  }

  async getDeployment(branch: string): Promise<unknown> {
    await this.ensureInit()
    const fakeRequest = new Request(`http://internal/?cmd=get_deployment&branch=${encodeURIComponent(branch)}`)
    const ctx: DeployContext = {
      sql: this.ctx.storage.sql,
      git: this.git,
      workspace: this.workspace,
    }
    const res = await handleDeployCommand(ctx, "get_deployment", fakeRequest)
    return res.json()
  }

  // ── Space info ──────────────────────────────────────────────────

  async getInfo(): Promise<{ fileCount: number; directoryCount: number; totalBytes: number }> {
    await this.ensureInit()
    return this.workspace.getWorkspaceInfo()
  }

  // ── Deployment row reader (shared by servePreview + DB-viewer) ──

  private readDeployment(branch: string): DeploymentRow | null {
    const rows = this.ctx.storage.sql
      .exec(
        "SELECT branch, commit_hash, main_module, modules, assets, asset_config FROM deployments WHERE branch = ?",
        branch,
      )
      .toArray()
    if (rows.length === 0) return null
    const r = rows[0]
    return {
      branch: r.branch as string,
      commitHash: r.commit_hash as string,
      mainModule: r.main_module as string,
      modules: JSON.parse(r.modules as string) as Record<string, string | Record<string, unknown>>,
      assets: JSON.parse((r.assets as string) || "{}") as Record<string, string>,
      assetConfig: JSON.parse((r.asset_config as string) || "{}") as AssetConfig,
    }
  }

  // ── Preview serving via Dynamic Workers ─────────────────────────
  //
  // Architecture (matches Cloudflare's Durable Object Facets docs example):
  //
  //   - The LLM exports `class App extends DurableObject` from its main
  //     module. `App.fetch(request)` is the entire backend (Hono /
  //     itty-router / vanilla — the LLM decides).
  //   - SpaceDO acts as the supervisor ("AppRunner" in the docs).
  //     `servePreview` loads the user's worker via the Worker Loader,
  //     extracts the App class, and hosts it as a Facet keyed
  //     `app:<branch>`. Static assets are served host-side; everything
  //     else (including WebSocket upgrades) is forwarded into the Facet.
  //   - State is the Facet's own `ctx.storage` (SQLite + KV). No env.DB
  //     binding is injected.
  //   - To make the DB-viewer work without forcing the LLM to write
  //     inspector boilerplate, we don't load the user's main directly.
  //     We load a wrapper module (`inspector-wrapper.ts`) which imports
  //     the user's `App`, re-exports everything, and exports a subclass
  //     `App` that adds `__vibeInspectListTables` / `__vibeInspectRead`
  //     / `__vibeWipe`. The subclass shares the same `ctx.storage`.

  async servePreview(branch: string, request: Request): Promise<Response> {
    await this.ensureInit()

    const dep = this.readDeployment(branch)
    if (!dep) {
      return new Response(`No deployment found for branch "${branch}"`, { status: 404 })
    }

    // Serve static assets host-side before forwarding to the Facet.
    if (Object.keys(dep.assets).length > 0) {
      const manifest = await buildAssetManifest(dep.assets)
      const storage = createMemoryStorage(dep.assets)
      const assetResponse = await handleAssetRequest(request, manifest, storage, dep.assetConfig)
      if (assetResponse) return assetResponse
    }

    let appClass: DurableObjectClass
    try {
      appClass = this.loadAppClass(dep)
    } catch (e) {
      return new Response(
        `Failed to load App class: ${e instanceof Error ? e.message : String(e)}`,
        { status: 500 },
      )
    }

    const facet = this.ctx.facets.get(facetNameForApp(branch), () => ({ class: appClass }))
    return facet.fetch(request)
  }

  // ── App-class loader ────────────────────────────────────────────
  //
  // Loads the dynamic worker for `branch`'s latest deployment with the
  // inspector wrapper as the main module. The wrapper imports the
  // user's main and exports a subclass of `App` with `__vibeInspect*`
  // methods (see `inspector-wrapper.ts`).
  //
  // `LOADER.get(id, ...)` caches by id. We key on
  // `<spaceName>-<branch>-<commitHash>` so a redeploy invalidates the
  // worker (and any Facet still pinned to the old class is aborted
  // implicitly the next time `ctx.facets.get(...)` runs the callback).
  private loadAppClass(dep: DeploymentRow): DurableObjectClass {
    const spaceName = this.ctx.id.name ?? "space"
    const workerId = `${spaceName}-${dep.branch}-${dep.commitHash}`
    const wrappedModules: Record<string, string | Record<string, unknown>> = {
      ...dep.modules,
      [VIBE_APP_MODULE]: buildInspectorWrapperSource(dep.mainModule),
    }
    const worker = this.env.LOADER.get(workerId, async () => ({
      mainModule: VIBE_APP_MODULE,
      modules: wrappedModules,
      compatibilityDate: "2025-04-01",
    }))
    return (
      worker as { getDurableObjectClass: (name: string) => DurableObjectClass }
    ).getDurableObjectClass("App")
  }

  /**
   * Returns a Facet stub for the App of `branch`, starting it (loading
   * the dynamic worker, wrapping the App class) on first call. Used by
   * the DB-viewer inspector RPCs.
   *
   * Returns `null` if there is no deployment yet for the branch.
   */
  private getAppFacet(branch: string): Fetcher | null {
    const dep = this.readDeployment(branch)
    if (!dep) return null
    const cls = this.loadAppClass(dep)
    return this.ctx.facets.get(facetNameForApp(branch), () => ({ class: cls })) as unknown as Fetcher
  }

  // ── DB-viewer RPC methods ───────────────────────────────────────
  //
  // The App's storage lives inside the Facet. The inspector wrapper
  // (`inspector-wrapper.ts`) extends the user's App class with
  // `__vibeInspect*` methods, so we just RPC into the Facet stub.

  async listAppTables(branch: string): Promise<AppDatabaseTable[]> {
    await this.ensureInit()
    const facet = this.getAppFacet(branch)
    if (!facet) return []
    return await (facet as unknown as {
      __vibeInspectListTables: () => Promise<AppDatabaseTable[]>
    }).__vibeInspectListTables()
  }

  async queryAppTable(
    branch: string,
    table: string,
    opts: AppTableQueryOpts = {},
  ): Promise<AppDatabaseReadResult> {
    await this.ensureInit()
    const facet = this.getAppFacet(branch)
    if (!facet) {
      return { columns: [], rows: [], totalCount: 0 }
    }
    return await (facet as unknown as {
      __vibeInspectRead: (
        table: string,
        opts: AppTableQueryOpts,
      ) => Promise<AppDatabaseReadResult>
    }).__vibeInspectRead(table, opts)
  }

  /**
   * Drop every user table inside the App Facet's SQLite. We use a
   * targeted drop rather than `ctx.facets.delete(...)` because the
   * latter aborts the Facet immediately and breaks any active
   * WebSocket connections — the user is usually in the middle of
   * preview-iteration when they hit Reset.
   */
  async wipeAppDatabase(branch: string): Promise<{ ok: true }> {
    await this.ensureInit()
    const facet = this.getAppFacet(branch)
    if (!facet) return { ok: true }
    await (facet as unknown as {
      __vibeWipe: () => Promise<{ ok: true }>
    }).__vibeWipe()
    return { ok: true }
  }

  // ── HTTP handler for Git Smart HTTP protocol ────────────────────

  async fetch(request: Request): Promise<Response> {
    await this.ensureInit()

    const url = new URL(request.url)
    const path = url.pathname

    // Preview routes: /space/:name/preview/:branch/*
    const previewMatch = path.match(/\/preview\/([^/]+)(\/.*)?$/)
    if (previewMatch) {
      const branch = decodeURIComponent(previewMatch[1])
      const spaceName = this.ctx.id.name ?? "space"
      const basePath = `/space/${spaceName}/preview/${encodeURIComponent(branch)}`

      // Rewrite the URL so the dynamic worker sees a clean path
      const subPath = previewMatch[2] || "/"
      const previewUrl = new URL(subPath, url.origin)
      previewUrl.search = url.search
      const previewRequest = new Request(previewUrl.toString(), request)
      const response = await this.servePreview(branch, previewRequest)

      // Rewrite root-relative paths in HTML responses so they resolve
      // correctly when the preview is mounted on a sub-path
      return rewritePreviewResponse(response, basePath)
    }

    const gitCtx: GitHttpContext = {
      fs: this.fs,
      sql: this.ctx.storage.sql,
    }

    // Git Smart HTTP routes
    if (path.endsWith("/info/refs")) {
      const service = url.searchParams.get("service") ?? ""
      if (service === "git-upload-pack" || service === "git-receive-pack") {
        return handleInfoRefs(gitCtx, service)
      }
    }

    if (path.endsWith("/git-upload-pack") && request.method === "POST") {
      return handleUploadPack(gitCtx, request)
    }

    if (path.endsWith("/git-receive-pack") && request.method === "POST") {
      return handleReceivePack(gitCtx, request)
    }

    if (path.endsWith("/HEAD")) {
      return handleHead(gitCtx)
    }

    // Deploy command routes
    const cmd = url.searchParams.get("cmd")
    if (cmd && ["deploy", "get_deployment", "list_deployments", "undeploy"].includes(cmd)) {
      const deployCtx: DeployContext = {
        sql: this.ctx.storage.sql,
        git: this.git,
        workspace: this.workspace,
      }
      return handleDeployCommand(deployCtx, cmd, request)
    }

    return new Response("Not Found", { status: 404 })
  }
}

// ─── Preview Response Rewriting ──────────────────────────────────────────────
// When a preview is served on /space/:name/preview/:branch/, root-relative
// paths like /style.css in HTML would resolve to the domain root instead of
// the preview path. We rewrite them so the browser fetches the correct URL.

function rewritePreviewResponse(response: Response, basePath: string): Response {
  // Rewrite Location header on redirects
  const location = response.headers.get("location")
  if (location?.startsWith("/")) {
    const rewritten = new Response(response.body, response)
    rewritten.headers.set("location", basePath + location)
    return rewritten
  }

  // Only rewrite HTML responses
  const ct = response.headers.get("content-type") ?? ""
  if (!ct.includes("text/html")) return response

  // Use HTMLRewriter to prefix root-relative src/href/action attributes
  return new HTMLRewriter()
    .on("[src],[href],[action]", {
      element(el) {
        for (const attr of ["src", "href", "action"] as const) {
          const val = el.getAttribute(attr)
          if (val?.startsWith("/") && !val.startsWith("//")) {
            el.setAttribute(attr, basePath + val)
          }
        }
      },
    })
    .transform(response)
}

// ─── Facet naming ───────────────────────────────────────────────────────────

function facetNameForApp(branch: string): string {
  return `app:${branch}`
}

// ─── Helpers ────────────────────────────────────────────────────────────────

interface PatchEdit {
  path: string
  content: string
}

function parseUnifiedDiffToEdits(diff: string): PatchEdit[] {
  const edits: PatchEdit[] = []
  const lines = diff.split("\n")
  let i = 0

  while (i < lines.length) {
    if (lines[i].startsWith("--- ")) {
      const oldPath = lines[i].slice(4).replace(/^[ab]\//, "")
      i++
      if (i < lines.length && lines[i].startsWith("+++ ")) {
        const newPath = lines[i].slice(4).replace(/^[ab]\//, "")
        i++
        const path = newPath === "/dev/null" ? oldPath : newPath
        const resultLines: string[] = []

        while (i < lines.length && !lines[i].startsWith("--- ")) {
          const l = lines[i]
          if (l.startsWith("@@")) {
            i++
            continue
          }
          if (l.startsWith("+") && !l.startsWith("+++")) {
            resultLines.push(l.slice(1))
          } else if (l.startsWith("-") && !l.startsWith("---")) {
            // removed line — skip
          } else if (l.startsWith(" ") || l === "") {
            resultLines.push(l.slice(1))
          } else {
            break
          }
          i++
        }

        edits.push({ path, content: resultLines.join("\n") })
        continue
      }
    }
    i++
  }

  return edits
}
