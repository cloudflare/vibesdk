// Shim: @/util/fn
import z from "zod"

export function fn<S extends z.ZodType, T>(schema: S, handler: (input: z.infer<S>) => T | Promise<T>) {
  return async (input: unknown) => {
    const parsed = schema.parse(input)
    return handler(parsed)
  }
}
