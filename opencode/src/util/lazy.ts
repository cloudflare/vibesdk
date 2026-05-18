// Shim: @/util/lazy
export function lazy<T>(fn: () => T): () => T {
  let val: T | undefined
  let done = false
  return () => {
    if (!done) { val = fn(); done = true }
    return val!
  }
}
