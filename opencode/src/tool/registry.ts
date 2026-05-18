// Tool registry — returns the worker's tools to upstream's resolveTools().
//
// Originally a stub returning `[]`, which caused the LLM to hallucinate an
// XML <Tool>…</Tool> tool-call format because no tools were registered.
//
// The DO calls setContext({ env, sessionId, host, spaceStore }) before each
// prompt so tools' execute() can reach the SpaceDO via DO RPC. Tools are
// returned in upstream's Tool.Info shape (id + parameters + description +
// execute → { title, output, metadata }); upstream's SessionPrompt.resolveTools
// wraps each one with AI SDK's tool() helper.
import { Effect, Layer, ServiceMap } from "effect"
// zod v4 schemas so SessionPrompt.resolveTools can call z.toJSONSchema on
// our `parameters` objects — that helper only exists on the v4 API and
// reads `.def` off the schema, which v3 schemas don't have.
import { z } from "zod/v4"
import type { Env } from "../env"
import type { SpaceDO } from "../space/durable-object"
import type { SpaceMapping } from "../tools"
import * as Skill from "../skill"

export interface RegistryContext {
  env: Env
  sessionId: string
  host: string
  spaceStore: {
    add: (name: string) => void
    remove: (name: string) => void
    list: () => SpaceMapping[]
    has: (name: string) => boolean
    /**
     * The session's working space — auto-resolved by the DO from
     * (1) the first explicitly attached space, (2) `defaultSpace` from
     * `SessionConfigOverrides`, or (3) an auto-named per-session fallback.
     * Tools call this instead of taking a `space` parameter.
     */
    current: () => string
  }
}

let currentContext: RegistryContext | null = null

export function setRegistryContext(ctx: RegistryContext) {
  currentContext = ctx
}

export function clearRegistryContext() {
  currentContext = null
}

function ctx(): RegistryContext {
  if (!currentContext) throw new Error("Tool registry context not set — DO must call setRegistryContext before invoking tools")
  return currentContext
}

function resolveSpace(env: Env, spaceName: string): DurableObjectStub<SpaceDO> {
  const id = env.SPACE_DO.idFromName(spaceName)
  return env.SPACE_DO.get(id) as DurableObjectStub<SpaceDO>
}

// Upstream Tool.Info shape that resolveTools consumes.
interface ToolInfo {
  id: string
  init: (initCtx?: any) => Promise<{
    description: string
    parameters: z.ZodType
    execute: (args: any, toolCtx: any) => Promise<{ title: string; output: string; metadata: Record<string, any> }>
  }>
}

function defineTool(
  id: string,
  description: string,
  parameters: z.ZodType,
  exec: (args: any, toolCtx: any) => Promise<string>,
): ToolInfo {
  return {
    id,
    init: async () => ({
      description,
      parameters,
      execute: async (args: any, toolCtx: any) => {
        const output = await exec(args, toolCtx)
        return { title: id, output, metadata: {} }
      },
    }),
  }
}

function activeSpace(): DurableObjectStub<SpaceDO> {
  const c = ctx()
  return resolveSpace(c.env, c.spaceStore.current())
}

function buildTools(): ToolInfo[] {
  return [
    // ── Workspace tools — operate on the session's working space. ──
    // The space is resolved from the session context (set by the
    // binding worker via SessionDO.attachSpace, or auto-provisioned).
    // No `space` parameter is exposed to the model.
    defineTool(
      "read",
      "Read the contents of a file or directory from the session's workspace. Supports optional line range with 1-indexed offset and limit.",
      z.object({
        filePath: z.string().describe("Path to the file or directory to read"),
        offset: z.number().int().min(1).optional().describe("1-indexed start line"),
        limit: z.number().int().min(1).optional().describe("Number of lines to return"),
      }),
      async (args) => activeSpace().readFile(args.filePath, { offset: args.offset, limit: args.limit }),
    ),
    defineTool(
      "write",
      "Create or overwrite a file in the session's workspace.",
      z.object({
        filePath: z.string().describe("File path to write"),
        content: z.string().describe("File content"),
      }),
      async (args) => JSON.stringify(await activeSpace().writeFile(args.filePath, args.content)),
    ),
    defineTool(
      "edit",
      "Find and replace an exact string in a file in the session's workspace. The old_string must be unique in the file.",
      z.object({
        filePath: z.string().describe("File path to edit"),
        old_string: z.string().describe("Exact text to find (must be unique)"),
        new_string: z.string().describe("Replacement text"),
      }),
      async (args) => JSON.stringify(await activeSpace().editFile(args.filePath, args.old_string, args.new_string)),
    ),
    defineTool(
      "glob",
      "Find files matching a glob pattern in the session's workspace. Returns matching file paths sorted by modification time.",
      z.object({
        pattern: z.string().describe("Glob pattern (e.g. '**/*.ts', 'src/*.js')"),
      }),
      async (args) => {
        const files = await activeSpace().glob(args.pattern)
        return files.length === 0 ? "No files matched." : files.join("\n")
      },
    ),
    defineTool(
      "grep",
      "Search file contents in the session's workspace using a regular expression. Returns matching lines with file paths and line numbers.",
      z.object({
        pattern: z.string().describe("Regex pattern to search for"),
        include: z.string().optional().describe("Glob pattern to filter files (e.g. '*.ts')"),
      }),
      async (args) => {
        const matches = (await activeSpace().grep(args.pattern, args.include)) as any[]
        return matches.length === 0
          ? "No matches found."
          : matches.map((m: any) => `${m.path}:${m.line}:${m.content}`).join("\n")
      },
    ),
    defineTool(
      "list",
      "List files and directories in the session's workspace, optionally filtered by a path prefix.",
      z.object({
        path: z.string().optional().describe("Directory path to list"),
      }),
      async (args) => {
        const files = await activeSpace().list(args.path)
        return files.length === 0 ? "No files found." : JSON.stringify(files, null, 2)
      },
    ),
    defineTool(
      "patch",
      "Apply a unified diff to one or more files in the session's workspace.",
      z.object({
        diff: z.string().describe("Unified diff content"),
      }),
      async (args) => {
        const result = (await activeSpace().patch(args.diff)) as any
        const lines: string[] = []
        for (const p of result.applied) lines.push(`Patched: ${p}`)
        for (const p of result.failed) lines.push(`Failed: ${p}`)
        return lines.join("\n")
      },
    ),
    defineTool(
      "git_commit",
      "Commit all working tree files in the session's workspace.",
      z.object({
        message: z.string().describe("Commit message"),
        author_name: z.string().optional().describe("Author name"),
        author_email: z.string().optional().describe("Author email"),
      }),
      async (args) => {
        const author =
          args.author_name || args.author_email
            ? { name: args.author_name ?? "Agent", email: args.author_email ?? "agent@opencode.ai" }
            : undefined
        return JSON.stringify(await activeSpace().gitCommit(args.message, author))
      },
    ),
    defineTool(
      "git_log",
      "View commit history of the session's workspace.",
      z.object({
        depth: z.number().int().min(1).optional().describe("Max number of commits to return"),
      }),
      async (args) => {
        const entries = await activeSpace().gitLog(args.depth)
        return entries.length === 0 ? "No commits found." : JSON.stringify(entries, null, 2)
      },
    ),
    defineTool(
      "git_status",
      "Show git status of files in the session's workspace (HEAD vs workdir vs staging).",
      z.object({}),
      async () => {
        const entries = await activeSpace().gitStatus()
        return entries.length === 0 ? "Working tree is clean." : JSON.stringify(entries, null, 2)
      },
    ),
    defineTool(
      "deploy",
      "Deploy code from a git branch in the session's workspace as a preview. Always git_commit before deploying. Returns deployment metadata including a preview_url you MUST share with the user. PROJECT STRUCTURE: write a Cloudflare Worker entry file (src/index.ts or index.ts) exporting a default fetch handler plus a package.json for npm deps. STATIC ASSETS: for websites with static files, create a wrangler.toml with [assets] directory; static files served before the Worker. Use relative paths in HTML so links work under sub-paths.",
      z.object({
        branch: z.string().describe("Git branch name to deploy"),
      }),
      async (args) => {
        const c = ctx()
        const data = (await activeSpace().deploy(args.branch)) as Record<string, unknown>
        if (data.preview_url && c.host) data.preview_url = `${c.host}${data.preview_url}`
        return JSON.stringify(data, null, 2)
      },
    ),
    defineTool(
      "undeploy",
      "Remove a deployed branch from the session's workspace.",
      z.object({
        branch: z.string().describe("Branch name to undeploy"),
      }),
      async (args) => JSON.stringify(await activeSpace().undeploy(args.branch), null, 2),
    ),
    defineTool(
      "list_deployments",
      "List all branch deployments in the session's workspace.",
      z.object({}),
      async () => JSON.stringify(await activeSpace().listDeployments(), null, 2),
    ),
    defineTool(
      "get_deployment",
      "Get deployment metadata for a branch in the session's workspace.",
      z.object({
        branch: z.string().describe("Branch name to inspect"),
      }),
      async (args) => JSON.stringify(await activeSpace().getDeployment(args.branch), null, 2),
    ),
    defineTool(
      "bash",
      "Execute a shell command. NOTE: Shell execution is not available in the Workers environment. Use the other workspace tools instead.",
      z.object({ command: z.string().describe("Shell command to run") }),
      async () =>
        "Error: Shell execution is not available in the Cloudflare Workers environment. Use the workspace tools (read, write, edit, grep, glob, git_commit, etc.) instead.",
    ),
    defineTool(
      "curl",
      "Make an HTTP request (like curl). Use this to call APIs, check deployed preview URLs, or fetch remote resources.",
      z.object({
        url: z.string().describe("URL to request"),
        method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]).default("GET").describe("HTTP method"),
        headers: z.record(z.string(), z.string()).optional().describe("Request headers"),
        body: z.string().optional().describe("Request body (for POST/PUT/PATCH)"),
      }),
      async (args) => {
        const res = await fetch(args.url, { method: args.method, headers: args.headers, body: args.body })
        const resHeaders: Record<string, string> = {}
        res.headers.forEach((v, k) => { resHeaders[k] = v })
        const text = await res.text()
        const maxLen = 100_000
        return JSON.stringify(
          {
            status: res.status,
            statusText: res.statusText,
            headers: resHeaders,
            body: text.length > maxLen ? text.slice(0, maxLen) + "\n[truncated]" : text,
          },
          null,
          2,
        )
      },
    ),

    // ── Space management ──────────────────────────────────────────
    defineTool(
      "create_space",
      "Create a new agent space and attach it to the current session. Spaces are Durable Object instances with isolated filesystem + git. They initialize automatically on first use.",
      z.object({
        name: z.string().regex(/^[a-z0-9][a-z0-9-]*$/).describe("Space name (lowercase alphanumeric + hyphens)"),
      }),
      async (args) => {
        const c = ctx()
        c.spaceStore.add(args.name)
        const space = resolveSpace(c.env, args.name)
        const info = await space.getInfo()
        return JSON.stringify({ name: args.name, attached: true, ...info }, null, 2)
      },
    ),
    defineTool(
      "delete_space",
      "Detach and delete an agent space. This removes all data in the space.",
      z.object({ name: z.string().describe("Name of the space to delete") }),
      async (args) => {
        ctx().spaceStore.remove(args.name)
        return `Space "${args.name}" detached and marked for deletion.`
      },
    ),
    defineTool(
      "attach_space",
      "Attach an existing agent space to the current session by name.",
      z.object({ name: z.string().describe("Space name") }),
      async (args) => {
        ctx().spaceStore.add(args.name)
        return `Space "${args.name}" attached to session.`
      },
    ),
    defineTool(
      "detach_space",
      "Detach an agent space from the current session (does not delete the space).",
      z.object({ name: z.string().describe("Name of the space to detach") }),
      async (args) => {
        ctx().spaceStore.remove(args.name)
        return `Space "${args.name}" detached from session.`
      },
    ),
    defineTool(
      "list_session_spaces",
      "List all agent spaces attached to the current session.",
      z.object({}),
      async () => {
        const mappings = ctx().spaceStore.list()
        return mappings.length === 0 ? "No spaces attached to this session." : JSON.stringify(mappings, null, 2)
      },
    ),

    // ── Skill loader (bundled skills served from memory) ───────────
    skillTool(),
  ]
}

function skillTool(): ToolInfo {
  const list = Skill.all()
  const examples = list.map((s) => `'${s.name}'`).slice(0, 3).join(", ")
  const hint = examples.length > 0 ? ` (e.g., ${examples}, ...)` : ""

  const description =
    list.length === 0
      ? "Load a specialized skill that provides domain-specific instructions and workflows. No skills are currently available."
      : [
          "Load a specialized skill that provides domain-specific instructions and workflows.",
          "",
          "When you recognize that a task matches one of the available skills listed below, use this tool to load the full skill instructions.",
          "",
          'Tool output includes a `<skill_content name="...">` block with the loaded content.',
          "",
          "The following skills provide specialized sets of instructions for particular tasks. Invoke this tool to load a skill when a task matches one of the available skills listed below:",
          "",
          Skill.fmt(list, { verbose: false }),
        ].join("\n")

  return defineTool(
    "skill",
    description,
    z.object({ name: z.string().describe(`The name of the skill from available_skills${hint}`) }),
    async (args) => {
      const skill = Skill.get(args.name)
      if (!skill) {
        const names = Skill.all().map((s) => s.name).join(", ")
        throw new Error(`Skill "${args.name}" not found. Available skills: ${names || "none"}`)
      }
      return [
        `<skill_content name="${skill.name}">`,
        `# Skill: ${skill.name}`,
        "",
        skill.content.trim(),
        "</skill_content>",
      ].join("\n")
    },
  )
}

export namespace ToolRegistry {
  export interface Interface {
    readonly tools: (model: any, agent: any) => Effect.Effect<any[]>
  }

  export class Service extends ServiceMap.Service<Service, Interface>()("@opencode/ToolRegistry") {}

  export const defaultLayer = Layer.succeed(
    Service,
    Service.of({
      tools: () =>
        Effect.gen(function* () {
          // Build raw tool info, then run each tool's init() (matches the
          // upstream pattern that lets tools dynamically generate parameters
          // and descriptions).
          const infos = buildTools()
          const out: any[] = []
          for (const info of infos) {
            const def = yield* Effect.promise(() => info.init({}))
            out.push({
              id: info.id,
              description: def.description,
              parameters: def.parameters,
              execute: def.execute,
            })
          }
          console.log(`[ToolRegistry] registered ${out.length} tools:`, out.map((t) => t.id).join(", "))
          return out
        }),
    }),
  )
}

