// Stub for upstream `import type { SystemError } from "bun"`
declare module "bun" {
  interface SystemError extends Error {
    code: string
    errno: number
    path: string
    syscall: string
  }
}
