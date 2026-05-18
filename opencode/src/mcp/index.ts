// Shim: @/mcp
import { Effect, Layer, ServiceMap } from "effect"

export namespace MCP {
  export interface Interface {
    readonly tools: () => Effect.Effect<Record<string, any>>
    readonly readResource: (client: string, uri: string) => Effect.Effect<any>
    readonly status: () => Effect.Effect<Record<string, any>>
  }

  export class Service extends ServiceMap.Service<Service, Interface>()("@opencode/MCP") {}

  export const defaultLayer = Layer.succeed(Service, Service.of({
    tools: () => Effect.succeed({}),
    readResource: () => Effect.fail(new Error("MCP not available")),
    status: () => Effect.succeed({}),
  }))

  export async function tools() { return {} }
  export async function status() { return {} }
}
