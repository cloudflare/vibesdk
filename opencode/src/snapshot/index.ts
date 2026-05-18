// Shim: upstream @/snapshot
import z from "zod"
import { Effect, Layer, ServiceMap } from "effect"

export namespace Snapshot {
  export const Patch = z.object({
    hash: z.string(),
    files: z.string().array(),
  })
  export type Patch = z.infer<typeof Patch>

  export const FileDiff = z.object({
    file: z.string(),
    before: z.string(),
    after: z.string(),
    additions: z.number(),
    deletions: z.number(),
    status: z.enum(["added", "deleted", "modified"]).optional(),
  })
  export type FileDiff = z.infer<typeof FileDiff>

  export interface Interface {
    readonly track: () => Effect.Effect<string | undefined>
    readonly patch: (snapshot: string) => Effect.Effect<Patch>
  }

  export class Service extends ServiceMap.Service<Service, Interface>()("@opencode/Snapshot") {}

  export const defaultLayer = Layer.succeed(Service, Service.of({
    track: () => Effect.succeed(undefined),
    patch: () => Effect.succeed({ hash: "", files: [] }),
  }))

  export const layer = defaultLayer
}
