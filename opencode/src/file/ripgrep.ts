// Shim: upstream @/file/ripgrep
// Ripgrep.tree() is dead code in upstream system.ts (guarded by `&& false`).
// Future: back with WorkspaceFileSystem.readdir() from @cloudflare/shell
export namespace Ripgrep {
  export async function tree(_opts: { cwd: string; limit?: number }): Promise<string> {
    return ""
  }
}
