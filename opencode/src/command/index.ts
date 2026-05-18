// Shim: @/command
import z from "zod"
import { Effect, Layer, ServiceMap } from "effect"

export namespace Command {
  export const Info = z.object({
    name: z.string(),
    description: z.string().optional(),
    source: z.string().optional(),
    template: z.string().optional(),
    hints: z.array(z.string()).optional(),
  })
  export type Info = z.infer<typeof Info>

  export interface Interface {
    readonly list: () => Effect.Effect<Info[]>
  }

  export class Service extends ServiceMap.Service<Service, Interface>()("@opencode/Command") {}

  export const defaultLayer = Layer.succeed(Service, Service.of({
    list: Effect.succeed([]),
  }))

  export const Event = {
    Executed: { type: "command.executed" } as any,
  }

  export const Default = () => ({
    list: async () => [],
  })

  export async function list(): Promise<Info[]> { return [] }
}
