import type { Git } from "@cloudflare/shell/git"
import type { Workspace } from "@cloudflare/shell"
import { createApp, createWorker, type AssetConfig, type Modules } from "@cloudflare/worker-bundler"
import { jsonResponse } from "./git-pack"
import { parseWranglerConfig } from "./wrangler-config"

// ─── Deploy Engine ──────────────────────────────────────────────────────────

export interface DeployContext {
  sql: SqlStorage
  git: Git
  workspace: Workspace
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
  await ctx.git.checkout({ ref: branch })

  // Read all files recursively (readDir is non-recursive, glob is)
  const allFiles = await ctx.workspace.glob("**/*")
  const files: Record<string, string> = {}

  for (const fileInfo of allFiles) {
    if (fileInfo.type !== "file") continue
    if (fileInfo.path.startsWith("/.git/") || fileInfo.path === "/.git") continue

    const content = await ctx.workspace.readFile(fileInfo.path)
    if (content !== null) {
      const path = fileInfo.path.startsWith("/") ? fileInfo.path.slice(1) : fileInfo.path
      files[path] = content
    }
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

  const { commitHash, files } = await readBranchFiles(ctx, branch)

  if (Object.keys(files).length === 0) {
    return jsonResponse({ error: `No files found in branch "${branch}"` }, 400)
  }

  // Parse child project's wrangler config for assets + entry point
  const wranglerCfg = parseWranglerConfig(files)

  let mainModule: string
  let serializedModules: Record<string, string | Record<string, unknown>>
  let serializedAssets: Record<string, string> = {}
  let assetConfig: AssetConfig | undefined

  try {
    // Collect static assets from configured directory
    const assetsDir = wranglerCfg.assets?.directory?.replace(/^\.?\//, "").replace(/\/$/, "")
    const collectedAssets: Record<string, string> = {}

    if (assetsDir) {
      for (const [path, content] of Object.entries(files)) {
        if (path.startsWith(assetsDir + "/") || path === assetsDir) {
          // Map to URL pathname: public/index.html → /index.html
          const urlPath = "/" + path.slice(assetsDir.length + 1)
          collectedAssets[urlPath] = content
        }
      }

      assetConfig = {}
      if (wranglerCfg.assets?.notFoundHandling) assetConfig.not_found_handling = wranglerCfg.assets.notFoundHandling
      if (wranglerCfg.assets?.htmlHandling) assetConfig.html_handling = wranglerCfg.assets.htmlHandling
    }

    const hasAssets = Object.keys(collectedAssets).length > 0

    if (hasAssets) {
      // Full-stack build: server + client + static assets
      const result = await createApp({
        files,
        assets: collectedAssets,
        assetConfig,
        server: wranglerCfg.main,
      })
      mainModule = result.mainModule
      serializedModules = serializeModules(result.modules)
      serializedAssets = serializeAssets(result.assets)
      assetConfig = result.assetConfig
    } else {
      // Server-only build (no assets)
      const result = await createWorker({ files, entryPoint: wranglerCfg.main })
      mainModule = result.mainModule
      serializedModules = serializeModules(result.modules)

      // Inject __STATIC_CONTENT_MANIFEST if the bundler left it as an external import.
      if (!serializedModules["__STATIC_CONTENT_MANIFEST"]) {
        serializedModules["__STATIC_CONTENT_MANIFEST"] = { text: "{}" }
      }
    }
  } catch (e: any) {
    return jsonResponse({
      error: "Build failed",
      details: e.message ?? String(e),
    }, 400)
  }

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

  const compatDate = wranglerCfg.compatibilityDate

  return jsonResponse({
    branch,
    commit_hash: commitHash,
    main_module: mainModule,
    has_assets: Object.keys(serializedAssets).length > 0,
    compatibility_date: compatDate,
    deployed_at: new Date(now).toISOString(),
  })
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
