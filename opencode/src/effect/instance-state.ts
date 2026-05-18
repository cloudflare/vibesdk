// Shim: upstream @/effect/instance-state
import { Effect, Scope } from "effect"
import { Instance } from "../project/instance"

export namespace InstanceState {
  export function bind<F extends (...args: any[]) => any>(fn: F): F {
    return fn
  }

  const ctx = {
    directory: Instance.directory,
    worktree: Instance.worktree,
    project: Instance.project,
  }

  // Effect-compatible: yield* InstanceState.context → { directory, worktree, project }
  export const context = Effect.succeed(ctx)
  export const directory = Effect.succeed(Instance.directory)

  // InstanceState.make(fn) — fn receives context, returns initial state. We run it once.
  export function make<T>(fn: Effect.Effect<T> | ((...args: any[]) => Effect.Effect<T>)): Effect.Effect<T> {
    if (typeof fn === "function") return (fn as any)(ctx)
    return fn
  }

  // InstanceState.get(ref) — returns the state value
  export function get<T>(ref: T): Effect.Effect<T> {
    return Effect.succeed(ref)
  }

  export function useEffect<T, R>(ref: T, fn: (state: T) => R): Effect.Effect<R> {
    return Effect.succeed(fn(ref))
  }

  export function withALS<T>(fn: () => T): Effect.Effect<T> {
    return Effect.succeed(fn())
  }
}
