// Shim: upstream @/storage/db
// Provides NotFoundError and stub drizzle-orm operators.
// Database.use() is stubbed — toModelMessagesEffect doesn't use it.
// Future: wire Database.use() to DO SQLite via drizzle adapter.
import { NamedError } from "../vendor/named-error"
import z from "zod"

// Stub drizzle-orm operators (only used by MessageV2.page/stream/get/parts)
export const and = (..._args: any[]) => undefined as any
export const desc = (..._args: any[]) => undefined as any
export const eq = (..._args: any[]) => undefined as any
export const inArray = (..._args: any[]) => undefined as any
export const lt = (..._args: any[]) => undefined as any
export const or = (..._args: any[]) => undefined as any

export const NotFoundError = NamedError.create(
  "NotFoundError",
  z.object({
    message: z.string(),
  }),
)

export namespace Database {
  export type TxOrDb = any
  export type Transaction = any

  export function use<T>(_callback: (trx: TxOrDb) => T): T {
    throw new Error("Database.use() is not available in the Workers shim — use DO SQLite directly")
  }

  export function transaction<T>(_callback: (tx: TxOrDb) => T): T {
    throw new Error("Database.transaction() is not available in the Workers shim")
  }

  export function effect(_fn: () => any): void {
    throw new Error("Database.effect() is not available in the Workers shim")
  }
}
