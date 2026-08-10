/// <reference path="../../node_modules/@cloudflare/vitest-pool-workers/types/cloudflare-test.d.ts" />

import { describe, expect, it } from "vitest"
import { env, runInDurableObject } from "cloudflare:test"
import {
  ARTIFACTS_REMOTE_URL_KEY,
  resolveSpaceFsBackendMode,
  SPACE_FS_BACKEND_KEY,
  SqlBackend,
} from "../src/space/fs-backend"
import type {} from "./test-env"

function uniqueStub(name: string) {
  const id = env.FsHarnessDO.idFromName(`backend-${name}-${Date.now()}-${Math.random()}`)
  return env.FsHarnessDO.get(id)
}

describe("SqlBackend", () => {
  it("persists git history across backend instances", async () => {
    const stub = uniqueStub("git")
    let firstCommit = ""

    await runInDurableObject(stub, async (_instance, state) => {
      const backend = new SqlBackend(state, "test")
      await backend.git.init({ defaultBranch: "main" })
      await backend.fs.writeFile("/app.ts", "export const version = 1\n")
      firstCommit = (await backend.git.commit({
        message: "first",
        author: { name: "Test", email: "test@vibesdk.local" },
      })).oid
      await backend.fs.writeFile("/app.ts", "export const version = 2\n")
      await backend.git.commit({
        message: "second",
        author: { name: "Test", email: "test@vibesdk.local" },
      })
    })

    await runInDurableObject(stub, async (_instance, state) => {
      const backend = new SqlBackend(state, "test")
      const history = await backend.git.log({ depth: 2 })
      expect(history).toHaveLength(2)
      expect(history[1]?.oid).toBe(firstCommit)
    })
  })

  it("uses no-op Artifacts lifecycle methods", async () => {
    await runInDurableObject(uniqueStub("noops"), async (_instance, state) => {
      const backend = new SqlBackend(state, "test")
      await backend.ready()
      await backend.hydrate("/missing.ts")
      await backend.materializeAll()
      await backend.flushCheckpoint()
      await backend.fetch("main")
      expect(await backend.push("main")).toBe(false)
    })
  })

  it("pins SQL mode even if the flag is enabled later", async () => {
    await runInDurableObject(uniqueStub("sql-pin"), async (_instance, state) => {
      expect(await resolveSpaceFsBackendMode(state.storage, {})).toBe("sql")
      expect(await state.storage.get(SPACE_FS_BACKEND_KEY)).toBe("sql")
      expect(await resolveSpaceFsBackendMode(state.storage, { ENABLE_ARTIFACTS: "true" })).toBe("sql")
    })
  })

  it("preserves prior Artifacts apps when adding backend pins", async () => {
    await runInDurableObject(uniqueStub("artifacts-pin"), async (_instance, state) => {
      await state.storage.put(ARTIFACTS_REMOTE_URL_KEY, "https://artifacts.example/repo.git")
      expect(await resolveSpaceFsBackendMode(state.storage, {})).toBe("artifacts")
      expect(await state.storage.get(SPACE_FS_BACKEND_KEY)).toBe("artifacts")
    })
  })

  it("preserves checkpointed Artifacts apps before their first push", async () => {
    await runInDurableObject(uniqueStub("checkpoint-pin"), async (_instance, state) => {
      state.storage.sql.exec(
        "CREATE TABLE space_checkpoint (path TEXT PRIMARY KEY, data BLOB, tombstone INTEGER NOT NULL DEFAULT 0)",
      )
      state.storage.sql.exec(
        "INSERT INTO space_checkpoint (path, data, tombstone) VALUES (?, ?, 0)",
        "/app.ts",
        new TextEncoder().encode("export {}\n").buffer,
      )
      expect(await resolveSpaceFsBackendMode(state.storage, {})).toBe("artifacts")
    })
  })
})
