// Shim: @/plugin
import { Effect, Layer, ServiceMap } from "effect"

export namespace Plugin {
  export interface Interface {
    readonly trigger: <T>(name: string, ctx: any, data: T) => Effect.Effect<T>
  }

  export class Service extends ServiceMap.Service<Service, Interface>()("@opencode/Plugin") {}

  export const defaultLayer = Layer.succeed(Service, Service.of({
    trigger: <T>(_name: string, _ctx: any, data: T) => Effect.succeed(data),
  }))

  export async function trigger<T>(_name: string, _ctx: any, data: T): Promise<T> {
    return data
  }
}
