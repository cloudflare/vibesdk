// Shim: @/util/update-schema
import z from "zod"

export function createUpdateSchema<T extends z.ZodRawShape>(shape: z.ZodObject<T>) {
  return shape.partial()
}
