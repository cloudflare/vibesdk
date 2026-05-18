import z from "zod"

export abstract class NamedError extends Error {
  abstract schema(): any
  abstract toObject(): { name: string; data: any }

  static create(name: string, data?: any) {
    const schema = z.object({
      name: z.literal(name),
      data: data || z.any(),
    })
    const result = class extends NamedError {
      public static readonly Schema = schema
      public override readonly name = name

      constructor(public readonly data: any, options?: ErrorOptions) {
        super(name, options)
        this.name = name
      }

      static isInstance(input: any): boolean {
        return typeof input === "object" && input !== null && "name" in input && input.name === name
      }

      schema() { return schema }
      toObject() { return { name, data: this.data } }
    }
    Object.defineProperty(result, "name", { value: name })
    return result
  }

  public static readonly Unknown = NamedError.create("UnknownError", z.object({ message: z.string() }))
}
