// Shim: @/tool/truncate
import { Effect, Layer, ServiceMap } from "effect"

export namespace Truncate {
  export interface Interface {
    readonly output: (text: string, opts: any, agent: any) => Effect.Effect<{ content: string; truncated: boolean; outputPath?: string }>
  }

  export class Service extends ServiceMap.Service<Service, Interface>()("@opencode/Truncate") {}

  export const defaultLayer = Layer.succeed(Service, Service.of({
    output: (text: string) => Effect.succeed({ content: text, truncated: false }),
  }))

  export const layer = defaultLayer
}
