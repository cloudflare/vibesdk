import type { Git } from "@cloudflare/shell/git"
import type { FileSystem } from "@cloudflare/shell"
import { createApp, createWorker, type AssetConfig, type Modules } from "@cloudflare/worker-bundler"
import { parseWranglerConfig, WranglerConfigError } from "./wrangler-config"
import { globInfos } from "./fileinfo"

// ─── Deploy Engine ──────────────────────────────────────────────────────────

/** Shared JSON response helper for the internal deploy command handlers. */
function jsonResponse(data: unknown, status: number = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

export interface DeployContext {
  sql: SqlStorage
  git: Git
  fs: FileSystem
}

export interface BranchDeploymentBundle {
  branch: string
  commitHash: string
  mainModule: string
  modules: Record<string, string | Record<string, unknown>>
  assets: Record<string, string>
  assetConfig: AssetConfig | undefined
  compatibilityDate: string
}

export async function handleDeployCommand(
  ctx: DeployContext,
  cmd: string,
  request: Request
): Promise<Response> {
  try {
    switch (cmd) {
      case "deploy":
        return await deployBranch(ctx, request)
      case "get_deployment":
        return await getDeployment(ctx, request)
      case "list_deployments":
        return await listDeployments(ctx)
      case "undeploy":
        return await undeployBranch(ctx, request)
      default:
        return jsonResponse({ error: `Unknown deploy command: ${cmd}` }, 400)
    }
  } catch (e: any) {
    return jsonResponse({ error: e.message ?? String(e) }, 500)
  }
}

// ─── Read files from a git branch using shell's git ─────────────────────────

async function readBranchFiles(
  ctx: DeployContext,
  branch: string
): Promise<{ commitHash: string; files: Record<string, string> }> {
  // Get commit log for the branch to find the commit hash
  const log = await ctx.git.log({ ref: branch, depth: 1 })
  if (log.length === 0) {
    throw new Error(`No commits found on branch "${branch}"`)
  }
  const commitHash = log[0].oid

  // Checkout the branch to populate working tree
  await ctx.git.checkout({ ref: branch, force: true })

  // Read all files recursively (readDir is non-recursive, glob is)
  const allFiles = await globInfos(ctx.fs, "**/*")
  const files: Record<string, string> = {}

  for (const fileInfo of allFiles) {
    if (fileInfo.type !== "file") continue
    // Skip git's object store and the ArtifactsFileSystem bookkeeping dir —
    // neither is part of the app and must never ship in a deploy bundle.
    if (fileInfo.path.startsWith("/.git/") || fileInfo.path === "/.git") continue
    if (fileInfo.path.startsWith("/.afs/") || fileInfo.path === "/.afs") continue

    let content: string
    try {
      content = await ctx.fs.readFile(fileInfo.path)
    } catch {
      continue
    }
    const path = fileInfo.path.startsWith("/") ? fileInfo.path.slice(1) : fileInfo.path
    files[path] = content
  }

  return { commitHash, files }
}

// ─── Deploy a branch ────────────────────────────────────────────────────────

async function deployBranch(
  ctx: DeployContext,
  request: Request
): Promise<Response> {
  const body = (await request.json()) as { branch: string }
  const branch = body.branch
  if (!branch) {
    return jsonResponse({ error: "branch is required" }, 400)
  }

  let bundle: BranchDeploymentBundle
  try {
    bundle = await buildBranchDeployment(ctx, branch)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    const separator = message.indexOf(": ")
    return jsonResponse({
      error: separator > 0 ? message.slice(0, separator) : message,
      ...(separator > 0 ? { details: message.slice(separator + 2) } : {}),
    }, 400)
  }

  const {
    commitHash,
    mainModule,
    modules: serializedModules,
    assets: serializedAssets,
    assetConfig,
    compatibilityDate: compatDate,
  } = bundle

  const now = Date.now()
  ctx.sql.exec(
    `INSERT OR REPLACE INTO deployments
     (branch, commit_hash, main_module, modules, assets, asset_config, deployed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    branch,
    commitHash,
    mainModule,
    JSON.stringify(serializedModules),
    JSON.stringify(serializedAssets),
    assetConfig ? JSON.stringify(assetConfig) : "{}",
    now
  )

  return jsonResponse({
    branch,
    commit_hash: commitHash,
    main_module: mainModule,
    has_assets: Object.keys(serializedAssets).length > 0,
    compatibility_date: compatDate,
    deployed_at: new Date(now).toISOString(),
  })
}

export async function buildBranchDeployment(
  ctx: DeployContext,
  branch: string
): Promise<BranchDeploymentBundle> {
  const { commitHash, files } = await readBranchFiles(ctx, branch)
  if (Object.keys(files).length === 0) {
    throw new Error(`No files found in branch "${branch}"`)
  }

  let wranglerCfg
  try {
    wranglerCfg = parseWranglerConfig(files)
  } catch (e) {
    if (e instanceof WranglerConfigError) {
      throw new Error(`Invalid wrangler.json: ${e.message}`)
    }
    throw e
  }

  if (wranglerCfg.durableObjects?.length) {
    throw new Error(
      "Durable Object bindings are not allowed in wrangler.json: The platform runs your app as a single Durable Object (`export class App extends DurableObject` from your main module). Do not declare `durable_objects.bindings`."
    )
  }

  try {
    const assetsDir = wranglerCfg.assets?.directory?.replace(/^\.?\//, "").replace(/\/$/, "")
    const collectedAssets = assetsDir
      ? Object.fromEntries(
          Object.entries(files)
            .filter(([path]) => path === assetsDir || path.startsWith(`${assetsDir}/`))
            .map(([path, content]) => [`/${path.slice(assetsDir.length + 1)}`, content])
        )
      : {}
    const assetConfig: AssetConfig | undefined = assetsDir
      ? {
          ...(wranglerCfg.assets?.notFoundHandling && {
            not_found_handling: wranglerCfg.assets.notFoundHandling,
          }),
          ...(wranglerCfg.assets?.htmlHandling && {
            html_handling: wranglerCfg.assets.htmlHandling,
          }),
        }
      : undefined

    if (Object.keys(collectedAssets).length) {
      const result = await createApp({
        files,
        assets: collectedAssets,
        assetConfig,
        server: wranglerCfg.main,
      })
      return {
        branch,
        commitHash,
        mainModule: result.mainModule,
        modules: serializeModules(result.modules),
        assets: serializeAssets(result.assets),
        assetConfig: result.assetConfig,
        compatibilityDate: wranglerCfg.compatibilityDate ?? "2025-04-01",
      }
    }

    const result = await createWorker({ files, entryPoint: wranglerCfg.main })
    const modules = serializeModules(result.modules)
    modules["__STATIC_CONTENT_MANIFEST"] ??= { text: "{}" }
    return {
      branch,
      commitHash,
      mainModule: result.mainModule,
      modules,
      assets: {},
      assetConfig,
      compatibilityDate: wranglerCfg.compatibilityDate ?? "2025-04-01",
    }
  } catch (e) {
    throw new Error(`Build failed: ${e instanceof Error ? e.message : String(e)}`)
  }
}

// ─── Get a deployment ───────────────────────────────────────────────────────

async function getDeployment(
  ctx: DeployContext,
  request: Request
): Promise<Response> {
  const url = new URL(request.url)
  const branch = url.searchParams.get("branch")
  if (!branch) {
    return jsonResponse({ error: "branch query param is required" }, 400)
  }

  const row = ctx.sql
    .exec(
      "SELECT branch, commit_hash, main_module, modules, assets, asset_config, deployed_at FROM deployments WHERE branch = ?",
      branch
    )
    .toArray()

  if (row.length === 0) {
    return jsonResponse({ error: `No deployment found for branch "${branch}"` }, 404)
  }

  const r = row[0]
  const assets = JSON.parse((r.assets as string) || "{}")
  return jsonResponse({
    branch: r.branch as string,
    commit_hash: r.commit_hash as string,
    main_module: r.main_module as string,
    modules: JSON.parse(r.modules as string),
    has_assets: Object.keys(assets).length > 0,
    deployed_at: new Date(r.deployed_at as number).toISOString(),
  })
}

// ─── List deployments ───────────────────────────────────────────────────────

async function listDeployments(ctx: DeployContext): Promise<Response> {
  const rows = ctx.sql
    .exec("SELECT branch, commit_hash, main_module, assets, deployed_at FROM deployments ORDER BY deployed_at DESC")
    .toArray()

  const deployments = rows.map((r) => {
    const assets = JSON.parse((r.assets as string) || "{}")
    return {
      branch: r.branch as string,
      commit_hash: r.commit_hash as string,
      main_module: r.main_module as string,
      has_assets: Object.keys(assets).length > 0,
      deployed_at: new Date(r.deployed_at as number).toISOString(),
    }
  })

  return jsonResponse(deployments)
}

// ─── Undeploy a branch ──────────────────────────────────────────────────────

async function undeployBranch(
  ctx: DeployContext,
  request: Request
): Promise<Response> {
  const body = (await request.json()) as { branch: string }
  const branch = body.branch
  if (!branch) {
    return jsonResponse({ error: "branch is required" }, 400)
  }

  const result = ctx.sql.exec(
    "DELETE FROM deployments WHERE branch = ?",
    branch
  )

  if (result.rowsWritten === 0) {
    return jsonResponse({ error: `No deployment found for branch "${branch}"` }, 404)
  }

  return jsonResponse({ ok: true, branch })
}

// ─── Serialization helpers ───────────────────────────────────────────────────

function serializeModules(modules: Modules): Record<string, string | Record<string, unknown>> {
  const out: Record<string, string | Record<string, unknown>> = {}
  for (const [name, value] of Object.entries(modules)) {
    out[name] = typeof value === "string" ? value : (value as Record<string, unknown>)
  }
  return out
}

function serializeAssets(
  assets: Record<string, string | ArrayBuffer>
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [path, content] of Object.entries(assets)) {
    // Store text as-is; encode binary as base64
    out[path] = typeof content === "string"
      ? content
      : btoa(String.fromCharCode(...new Uint8Array(content)))
  }
  return out
}
