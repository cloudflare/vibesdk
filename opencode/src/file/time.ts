// Shim: @/file/time
import { Effect, Layer, ServiceMap } from "effect"

export namespace FileTime {
  export interface Interface {
    readonly modified: (path: string) => Effect.Effect<number | undefined>
  }

  export class Service extends ServiceMap.Service<Service, Interface>()("@opencode/FileTime") {}

  export const defaultLayer = Layer.succeed(Service, Service.of({
    modified: (_path: string) => Effect.succeed(undefined),
  }))
}
