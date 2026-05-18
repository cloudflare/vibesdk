// Shim: @/storage/storage
import { Effect, Layer, ServiceMap } from "effect"

export namespace Storage {
  export interface Interface {
    readonly read: <T>(key: string[]) => Effect.Effect<T | undefined>
    readonly write: <T>(key: string[], value: T) => Effect.Effect<void>
    readonly remove: (key: string[]) => Effect.Effect<void>
  }

  export class Service extends ServiceMap.Service<Service, Interface>()("@opencode/Storage") {}

  export const defaultLayer = Layer.succeed(Service, Service.of({
    read: () => Effect.succeed(undefined),
    write: () => Effect.void,
    remove: () => Effect.void,
  }))

  export const layer = defaultLayer

  export async function read<T>(_key: string[]): Promise<T | undefined> { return undefined }
  export async function write<T>(_key: string[], _value: T) {}
  export async function remove(_key: string[]) {}
}
