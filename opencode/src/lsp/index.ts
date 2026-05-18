// Shim: upstream @/lsp
import { BusEvent } from "../bus/bus-event"
import z from "zod"
import { Effect, Layer, ServiceMap } from "effect"

export namespace LSP {
  export const Event = {
    Updated: BusEvent.define("lsp.updated", z.object({})),
  }

  export const Range = z
    .object({
      start: z.object({
        line: z.number(),
        character: z.number(),
      }),
      end: z.object({
        line: z.number(),
        character: z.number(),
      }),
    })
    
  export type Range = z.infer<typeof Range>

  export const Status = z.array(z.any())

  export interface Interface {
    readonly status: () => Effect.Effect<any[]>
    readonly documentSymbol: (uri: string) => Effect.Effect<any[]>
  }

  export class Service extends ServiceMap.Service<Service, Interface>()("@opencode/LSP") {}

  export const defaultLayer = Layer.succeed(Service, Service.of({
    status: () => Effect.succeed([]),
    documentSymbol: () => Effect.succeed([]),
  }))

  export async function status() { return [] }
}
