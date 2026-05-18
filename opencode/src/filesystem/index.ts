// Shim: @/filesystem
import { Effect, Layer, ServiceMap } from "effect"

export namespace AppFileSystem {
  export interface Interface {
    readonly stat: (path: string) => Effect.Effect<{ type: string } | undefined>
    readonly existsSafe: (path: string) => Effect.Effect<boolean>
    readonly isDir: (path: string) => Effect.Effect<boolean>
    readonly ensureDir: (path: string) => Effect.Effect<void>
    readonly findUp: (name: string, from: string, root?: string) => Effect.Effect<string[]>
    readonly readFile: (path: string) => Effect.Effect<string>
  }

  export class Service extends ServiceMap.Service<Service, Interface>()("@opencode/AppFileSystem") {}

  export const defaultLayer = Layer.succeed(Service, Service.of({
    stat: () => Effect.succeed(undefined),
    existsSafe: () => Effect.succeed(false),
    isDir: () => Effect.succeed(false),
    ensureDir: () => Effect.void,
    findUp: () => Effect.succeed([]),
    readFile: () => Effect.succeed(""),
  }))
}
