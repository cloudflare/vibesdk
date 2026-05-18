// Shim: @/effect/cross-spawn-spawner — not used in Workers
import { Layer } from "effect"
import { ChildProcessSpawner } from "effect/unstable/process"

export const defaultLayer = Layer.succeed(
  ChildProcessSpawner.ChildProcessSpawner,
  { spawn: () => { throw new Error("ChildProcess not available in Workers") } } as any,
)
