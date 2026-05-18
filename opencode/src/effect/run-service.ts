// Shim: @/effect/run-service
// Matches upstream makeRuntime — creates a ManagedRuntime backed by a layer,
// returns runPromise/runFork/runSync that resolve services from the layer.
import { Effect, Layer, ManagedRuntime } from "effect"

export function makeRuntime<S, I>(service: any, layer: Layer.Layer<any, any, any>) {
  const rt = ManagedRuntime.make(layer)
  const wrap = <T>(fn: (svc: I) => Effect.Effect<T, any, any>) =>
    Effect.gen(function* () {
      const svc = yield* (service as Effect.Effect<I, never, any>)
      return yield* fn(svc)
    })
  return {
    runPromise: <T>(fn: (svc: I) => Effect.Effect<T, any, any>): Promise<T> =>
      rt.runPromise(wrap(fn)) as Promise<T>,
    runSync: <T>(fn: (svc: I) => Effect.Effect<T, any, any>): T =>
      rt.runSync(wrap(fn)) as T,
    runFork: <T>(fn: (svc: I) => Effect.Effect<T, any, any>) =>
      rt.runFork(wrap(fn)),
    runCallback: <T>(fn: (svc: I) => Effect.Effect<T, any, any>) =>
      rt.runFork(wrap(fn)),
  }
}
