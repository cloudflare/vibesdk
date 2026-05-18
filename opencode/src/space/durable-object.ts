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

// ─── SpaceDO ────────────────────────────────────────────────────────────────
// Agent space Durable Object backed by @cloudflare/shell.
//
// Each named instance provides an isolated filesystem + git repo.
// SessionDO calls methods via DO RPC (same worker, no HTTP).
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
      author: author ?? { name: "Agent", email: "agent@opencode.ai" },
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

  // ── Preview serving via Dynamic Workers ─────────────────────────

  async servePreview(branch: string, request: Request): Promise<Response> {
    await this.ensureInit()

    const row = this.ctx.storage.sql
      .exec(
        "SELECT branch, commit_hash, main_module, modules, assets, asset_config FROM deployments WHERE branch = ?",
        branch
      )
      .toArray()

    if (row.length === 0) {
      return new Response(`No deployment found for branch "${branch}"`, { status: 404 })
    }

    const r = row[0]
    const mainModule = r.main_module as string
    const modules = JSON.parse(r.modules as string) as Record<string, string | Record<string, unknown>>
    const commitHash = r.commit_hash as string
    const assets = JSON.parse((r.assets as string) || "{}") as Record<string, string>
    const assetConfig = JSON.parse((r.asset_config as string) || "{}") as AssetConfig

    // Serve static assets host-side before forwarding to dynamic worker
    if (Object.keys(assets).length > 0) {
      const manifest = await buildAssetManifest(assets)
      const storage = createMemoryStorage(assets)
      const assetResponse = await handleAssetRequest(request, manifest, storage, assetConfig)
      if (assetResponse) return assetResponse
    }

    // Fall through to dynamic worker for non-asset requests
    const spaceName = this.ctx.id.name ?? "space"
    const workerId = `${spaceName}-${branch}-${commitHash}`

    const worker = this.env.LOADER.get(workerId, async () => ({
      mainModule,
      modules,
      compatibilityDate: "2025-04-01",
    }))

    return worker.getEntrypoint().fetch(request)
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
