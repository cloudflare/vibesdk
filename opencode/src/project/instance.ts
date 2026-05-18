// Shim: upstream @/project/instance
// Provides Instance.directory, .worktree, .project
// Future: configurable per-space via @cloudflare/shell Workspace
export namespace Instance {
  export const directory = "/"
  export const worktree = "/"
  export const project = {
    id: "opencode-worker",
    vcs: undefined as string | undefined,
  }

  export function bind<F extends (...args: any[]) => any>(fn: F): F {
    return fn
  }

  export function restore<T>(_ctx: any, fn: () => T): T {
    return fn()
  }

  export type Context = {
    directory: string
    worktree: string
    project: typeof project
  }

  export const current: Context = { directory, worktree, project }
}
