import type { SpaceDO } from "../space/durable-object"
import type { Env } from "../env"
import { tool } from "ai"
import { z } from "zod"
import * as Skill from "../skill"

export interface SpaceMapping {
  sessionId: string
  spaceName: string
}

export interface ToolsContext {
  env: Env
  sessionId: string
  host: string
  spaceStore: {
    add: (name: string) => void
    remove: (name: string) => void
    list: () => SpaceMapping[]
    has: (name: string) => boolean
    current: () => string
  }
}

/**
 * Resolve a space name to a SpaceDO stub via DO RPC (same worker, no HTTP).
 */
function resolveSpace(env: Env, spaceName: string): DurableObjectStub<SpaceDO> {
  const id = env.SPACE_DO.idFromName(spaceName)
  return env.SPACE_DO.get(id) as DurableObjectStub<SpaceDO>
}

/**
 * Build the full set of AI SDK tools.
 *
 * Workspace tools require a `space` parameter to target a specific agent space.
 * Space management tools manage session↔space mappings (spaces auto-initialize on first use).
 */
export function createTools(ctx: ToolsContext) {
  return {
    read: createReadTool(ctx),
    write: createWriteTool(ctx),
    edit: createEditTool(ctx),
    glob: createGlobTool(ctx),
    grep: createGrepTool(ctx),
    list: createListTool(ctx),
    patch: createPatchTool(ctx),
    git_commit: createGitCommitTool(ctx),
    git_log: createGitLogTool(ctx),
    git_status: createGitStatusTool(ctx),
    deploy: createDeployTool(ctx),
    undeploy: createUndeployTool(ctx),
    list_deployments: createListDeploymentsTool(ctx),
    get_deployment: createGetDeploymentTool(ctx),
    bash: createBashStub(),
    curl: createCurlTool(),
    create_space: createCreateSpaceTool(ctx),
    delete_space: createDeleteSpaceTool(ctx),
    attach_space: createAttachSpaceTool(ctx),
    detach_space: createDetachSpaceTool(ctx),
    list_session_spaces: createListSessionSpacesTool(ctx),
    skill: createSkillTool(),
  }
}

// ── Workspace Tool Factories (require `space` parameter) ─────────

const spaceParam = z.string().describe("Name of the agent space to target")

function createReadTool(ctx: ToolsContext) {
  return tool({
    description:
      "Read the contents of a file or directory from an agent space. " +
      "Supports optional line range with 1-indexed offset and limit.",
    inputSchema: z.object({
      space: spaceParam,
      filePath: z.string().describe("Path to the file or directory to read"),
      offset: z.number().int().min(1).optional().describe("1-indexed start line"),
      limit: z.number().int().min(1).optional().describe("Number of lines to return"),
    }),
    execute: async (args) => {
      const space = resolveSpace(ctx.env, args.space)
      return space.readFile(args.filePath, {
        offset: args.offset,
        limit: args.limit,
      })
    },
  })
}

function createWriteTool(ctx: ToolsContext) {
  return tool({
    description: "Create or overwrite a file in an agent space.",
    inputSchema: z.object({
      space: spaceParam,
      filePath: z.string().describe("File path to write"),
      content: z.string().describe("File content"),
    }),
    execute: async (args) => {
      const space = resolveSpace(ctx.env, args.space)
      const result = await space.writeFile(args.filePath, args.content)
      return JSON.stringify(result)
    },
  })
}

function createEditTool(ctx: ToolsContext) {
  return tool({
    description:
      "Find and replace an exact string in a file within an agent space. " +
      "The old_string must be unique in the file.",
    inputSchema: z.object({
      space: spaceParam,
      filePath: z.string().describe("File path to edit"),
      old_string: z.string().describe("Exact text to find (must be unique)"),
      new_string: z.string().describe("Replacement text"),
    }),
    execute: async (args) => {
      const space = resolveSpace(ctx.env, args.space)
      const result = await space.editFile(args.filePath, args.old_string, args.new_string)
      return JSON.stringify(result)
    },
  })
}

function createGlobTool(ctx: ToolsContext) {
  return tool({
    description:
      "Find files matching a glob pattern in an agent space. " +
      "Returns matching file paths sorted by modification time.",
    inputSchema: z.object({
      space: spaceParam,
      pattern: z.string().describe("Glob pattern (e.g. '**/*.ts', 'src/*.js')"),
    }),
    execute: async (args) => {
      const space = resolveSpace(ctx.env, args.space)
      const files = await space.glob(args.pattern)
      if (files.length === 0) return "No files matched."
      return files.join("\n")
    },
  })
}

function createGrepTool(ctx: ToolsContext) {
  return tool({
    description:
      "Search file contents in an agent space using a regular expression. " +
      "Returns matching lines with file paths and line numbers.",
    inputSchema: z.object({
      space: spaceParam,
      pattern: z.string().describe("Regex pattern to search for"),
      include: z.string().optional().describe("Glob pattern to filter files (e.g. '*.ts')"),
    }),
    execute: async (args) => {
      const space = resolveSpace(ctx.env, args.space)
      const matches = await space.grep(args.pattern, args.include)
      if (matches.length === 0) return "No matches found."
      return matches.map((m: any) => `${m.path}:${m.line}:${m.content}`).join("\n")
    },
  })
}

function createListTool(ctx: ToolsContext) {
  return tool({
    description: "List files and directories in an agent space, optionally filtered by a path prefix.",
    inputSchema: z.object({
      space: spaceParam,
      path: z.string().optional().describe("Directory path to list"),
    }),
    execute: async (args) => {
      const space = resolveSpace(ctx.env, args.space)
      const files = await space.list(args.path)
      if (files.length === 0) return "No files found."
      return JSON.stringify(files, null, 2)
    },
  })
}

function createPatchTool(ctx: ToolsContext) {
  return tool({
    description: "Apply a unified diff to one or more files in an agent space.",
    inputSchema: z.object({
      space: spaceParam,
      diff: z.string().describe("Unified diff content"),
    }),
    execute: async (args) => {
      const space = resolveSpace(ctx.env, args.space)
      const result = await space.patch(args.diff) as any
      const lines: string[] = []
      for (const p of result.applied) lines.push(`Patched: ${p}`)
      for (const p of result.failed) lines.push(`Failed: ${p}`)
      return lines.join("\n")
    },
  })
}

function createGitCommitTool(ctx: ToolsContext) {
  return tool({
    description: "Commit all working tree files in an agent space.",
    inputSchema: z.object({
      space: spaceParam,
      message: z.string().describe("Commit message"),
      author_name: z.string().optional().describe("Author name"),
      author_email: z.string().optional().describe("Author email"),
    }),
    execute: async (args) => {
      const space = resolveSpace(ctx.env, args.space)
      const author =
        args.author_name || args.author_email
          ? {
              name: args.author_name ?? "Agent",
              email: args.author_email ?? "agent@opencode.ai",
            }
          : undefined
      const result = await space.gitCommit(args.message, author)
      return JSON.stringify(result)
    },
  })
}

function createGitLogTool(ctx: ToolsContext) {
  return tool({
    description: "View commit history of an agent space.",
    inputSchema: z.object({
      space: spaceParam,
      depth: z.number().int().min(1).optional().describe("Max number of commits to return"),
    }),
    execute: async (args) => {
      const space = resolveSpace(ctx.env, args.space)
      const entries = await space.gitLog(args.depth)
      if (entries.length === 0) return "No commits found."
      return JSON.stringify(entries, null, 2)
    },
  })
}

function createGitStatusTool(ctx: ToolsContext) {
  return tool({
    description: "Show git status of files in an agent space (HEAD vs workdir vs staging).",
    inputSchema: z.object({
      space: spaceParam,
    }),
    execute: async (args) => {
      const space = resolveSpace(ctx.env, args.space)
      const entries = await space.gitStatus()
      if (entries.length === 0) return "Working tree is clean."
      return JSON.stringify(entries, null, 2)
    },
  })
}

function createDeployTool(ctx: ToolsContext) {
  return tool({
    description:
      "Deploy code from a git branch in an agent space as a preview. " +
      "Always git_commit before deploying. Returns deployment metadata including a preview_url " +
      "you MUST share with the user. If the build fails, error details are returned — " +
      "fix the issues and redeploy.\n\n" +
      "PROJECT STRUCTURE: Write a Cloudflare Worker with an entry file (src/index.ts or index.ts) " +
      "that exports a default fetch handler. Write a package.json with npm dependencies " +
      "(e.g. hono). The bundler handles TypeScript natively — no tsconfig.json or build step required.\n\n" +
      "STATIC ASSETS: For websites with static files (HTML, CSS, images), create a wrangler.toml " +
      "with an [assets] section:\n" +
      "  name = \"my-app\"\n" +
      "  main = \"src/index.ts\"\n" +
      "  [assets]\n" +
      "  directory = \"./public\"\n" +
      "  not_found_handling = \"single-page-application\"  # optional, for SPAs\n\n" +
      "Put static files in the configured directory (e.g. public/index.html, public/style.css). " +
      "The deploy pipeline serves these automatically — the Worker only needs to handle " +
      "API/dynamic routes. Static assets are served before the Worker runs.\n\n" +
      "IMPORTANT: Use relative paths in HTML (href=\"style.css\" not href=\"/style.css\") " +
      "so links work correctly when the preview is mounted on a sub-path. " +
      "Root-relative paths are rewritten automatically but relative paths are most reliable.\n\n" +
      "BUNDLING: The deploy pipeline uses @cloudflare/worker-bundler (esbuild). " +
      "It auto-detects the entry point, resolves imports, and bundles into a Worker module. " +
      "npm packages are fetched from the registry, so write a package.json with your dependencies.",
    inputSchema: z.object({
      space: spaceParam,
      branch: z.string().describe("Git branch name to deploy (e.g. 'release', 'main', 'feature/ui')"),
    }),
    execute: async (args) => {
      const space = resolveSpace(ctx.env, args.space)
      const data = await space.deploy(args.branch) as Record<string, unknown>
      if (data.preview_url && ctx.host) {
        data.preview_url = `${ctx.host}${data.preview_url}`
      }
      return JSON.stringify(data, null, 2)
    },
  })
}

function createUndeployTool(ctx: ToolsContext) {
  return tool({
    description: "Remove a deployed branch from an agent space.",
    inputSchema: z.object({
      space: spaceParam,
      branch: z.string().describe("Branch name to undeploy"),
    }),
    execute: async (args) => {
      const space = resolveSpace(ctx.env, args.space)
      const data = await space.undeploy(args.branch)
      return JSON.stringify(data, null, 2)
    },
  })
}

function createListDeploymentsTool(ctx: ToolsContext) {
  return tool({
    description: "List all branch deployments in an agent space.",
    inputSchema: z.object({
      space: spaceParam,
    }),
    execute: async (args) => {
      const space = resolveSpace(ctx.env, args.space)
      const data = await space.listDeployments()
      return JSON.stringify(data, null, 2)
    },
  })
}

function createGetDeploymentTool(ctx: ToolsContext) {
  return tool({
    description: "Get deployment metadata for a branch in an agent space.",
    inputSchema: z.object({
      space: spaceParam,
      branch: z.string().describe("Branch name to inspect"),
    }),
    execute: async (args) => {
      const space = resolveSpace(ctx.env, args.space)
      const data = await space.getDeployment(args.branch)
      return JSON.stringify(data, null, 2)
    },
  })
}

function createBashStub() {
  return tool({
    description:
      "Execute a shell command. NOTE: Shell execution is not available " +
      "in the Workers environment. Use the other workspace tools instead.",
    inputSchema: z.object({
      command: z.string().describe("Shell command to run"),
    }),
    execute: async () => {
      return "Error: Shell execution is not available in the Cloudflare Workers environment. Use the workspace tools (read, write, edit, grep, glob, git_commit, etc.) instead."
    },
  })
}

function createCurlTool() {
  return tool({
    description:
      "Make an HTTP request (like curl). Use this to call APIs, check " +
      "deployed preview URLs, or fetch remote resources.",
    inputSchema: z.object({
      url: z.string().describe("URL to request"),
      method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]).default("GET").describe("HTTP method"),
      headers: z.record(z.string(), z.string()).optional().describe("Request headers"),
      body: z.string().optional().describe("Request body (for POST/PUT/PATCH)"),
    }),
    execute: async (args) => {
      const res = await fetch(args.url, {
        method: args.method,
        headers: args.headers,
        body: args.body,
      })
      const resHeaders: Record<string, string> = {}
      res.headers.forEach((v, k) => { resHeaders[k] = v })
      const text = await res.text()
      const maxLen = 100_000
      return JSON.stringify({
        status: res.status,
        statusText: res.statusText,
        headers: resHeaders,
        body: text.length > maxLen ? text.slice(0, maxLen) + "\n[truncated]" : text,
      }, null, 2)
    },
  })
}

// ── Skill Tool ────────────────────────────────────────────────────

function createSkillTool() {
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
          "The following skills provide specialized sets of instructions for particular tasks",
          "Invoke this tool to load a skill when a task matches one of the available skills listed below:",
          "",
          Skill.fmt(list, { verbose: false }),
        ].join("\n")

  return tool({
    description,
    inputSchema: z.object({
      name: z.string().describe(`The name of the skill from available_skills${hint}`),
    }),
    execute: async (args) => {
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
  })
}

// ── Space Management Tool Factories ──────────────────────────────

function createCreateSpaceTool(ctx: ToolsContext) {
  return tool({
    description:
      "Create a new agent space and attach it to the current session. " +
      "Spaces are Durable Object instances with isolated filesystem + git. " +
      "They initialize automatically on first use.",
    inputSchema: z.object({
      name: z.string().regex(/^[a-z0-9][a-z0-9-]*$/).describe("Space name (lowercase alphanumeric + hyphens)"),
    }),
    execute: async (args) => {
      // Space auto-initializes on first RPC call — just attach to session
      ctx.spaceStore.add(args.name)
      // Trigger initialization by getting info
      const space = resolveSpace(ctx.env, args.name)
      const info = await space.getInfo()
      return JSON.stringify({
        name: args.name,
        attached: true,
        ...info,
      }, null, 2)
    },
  })
}

function createDeleteSpaceTool(ctx: ToolsContext) {
  return tool({
    description: "Detach and delete an agent space. This removes all data in the space.",
    inputSchema: z.object({
      name: z.string().describe("Name of the space to delete"),
    }),
    execute: async (args) => {
      ctx.spaceStore.remove(args.name)
      // Note: DO storage is automatically cleaned up when the DO is garbage collected.
      // For immediate cleanup, we could call a cleanup RPC method.
      return `Space "${args.name}" detached and marked for deletion.`
    },
  })
}

function createAttachSpaceTool(ctx: ToolsContext) {
  return tool({
    description:
      "Attach an existing agent space to the current session by name.",
    inputSchema: z.object({
      name: z.string().describe("Space name"),
    }),
    execute: async (args) => {
      ctx.spaceStore.add(args.name)
      return `Space "${args.name}" attached to session.`
    },
  })
}

function createDetachSpaceTool(ctx: ToolsContext) {
  return tool({
    description: "Detach an agent space from the current session (does not delete the space).",
    inputSchema: z.object({
      name: z.string().describe("Name of the space to detach"),
    }),
    execute: async (args) => {
      ctx.spaceStore.remove(args.name)
      return `Space "${args.name}" detached from session.`
    },
  })
}

function createListSessionSpacesTool(ctx: ToolsContext) {
  return tool({
    description: "List all agent spaces attached to the current session.",
    inputSchema: z.object({}),
    execute: async () => {
      const mappings = ctx.spaceStore.list()
      if (mappings.length === 0) return "No spaces attached to this session."
      return JSON.stringify(
        mappings.map((m) => ({ name: m.spaceName })),
        null,
        2,
      )
    },
  })
}
