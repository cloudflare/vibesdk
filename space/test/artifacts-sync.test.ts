import { describe, it, expect } from "vitest"
import type { Git } from "@cloudflare/shell/git"
import { ArtifactsSync, type ArtifactsRemoteStore } from "../src/space/artifacts-sync"

type ArtifactsBinding = ConstructorParameters<typeof ArtifactsSync>[0]

/**
 * Minimal fakes for the Artifacts binding. Only the methods ArtifactsSync
 * exercises (get -> createToken) are implemented; provisioning is short-circuited
 * by seeding the remote URL in the durable store so ensureRepo never calls
 * create().
 */
function fakeArtifacts(): ArtifactsBinding {
  const repo = {
    createToken: async () => ({
      plaintext: "tok",
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    }),
    remote: "https://artifacts.example/repo.git",
  }
  return {
    get: async () => repo,
  } as unknown as ArtifactsBinding
}

function memStore(seed?: string): ArtifactsRemoteStore {
  let url = seed ?? null
  return {
    read: async () => url,
    write: async (u: string) => {
      url = u
    },
  }
}

const silentLogger = { warn: () => {}, info: () => {} }

describe("ArtifactsSync.push", () => {
  it("retries a stale-ref rejection and eventually succeeds", async () => {
    let calls = 0
    const git = {
      remote: async () => ({ added: "artifacts", url: "x" }),
      push: async () => {
        calls++
        if (calls < 3) {
          const err = new Error("One or more branches were not updated: stale info")
          ;(err as { code?: string }).code = "GitPushError"
          throw err
        }
        return { ok: true, refs: {} }
      },
    } as unknown as Git

    const sync = new ArtifactsSync(
      fakeArtifacts(),
      git,
      "repo",
      memStore("https://artifacts.example/repo.git"),
      silentLogger,
    )

    const ok = await sync.push("main")
    expect(ok).toBe(true)
    expect(calls).toBe(3)
  })

  it("gives up after the retry budget and reports failure", async () => {
    const git = {
      remote: async () => ({ added: "artifacts", url: "x" }),
      push: async () => {
        const err = new Error("stale ref")
        ;(err as { code?: string }).code = "GitPushError"
        throw err
      },
    } as unknown as Git

    const sync = new ArtifactsSync(
      fakeArtifacts(),
      git,
      "repo",
      memStore("https://artifacts.example/repo.git"),
      silentLogger,
    )

    const ok = await sync.push("main")
    expect(ok).toBe(false)
  })

  it("serializes concurrent pushes so they never overlap", async () => {
    let active = 0
    let maxConcurrent = 0
    const git = {
      remote: async () => ({ added: "artifacts", url: "x" }),
      push: async () => {
        active++
        maxConcurrent = Math.max(maxConcurrent, active)
        await new Promise((r) => setTimeout(r, 10))
        active--
        return { ok: true, refs: {} }
      },
    } as unknown as Git

    const sync = new ArtifactsSync(
      fakeArtifacts(),
      git,
      "repo",
      memStore("https://artifacts.example/repo.git"),
      silentLogger,
    )

    const results = await Promise.all([
      sync.push("main"),
      sync.push("main"),
      sync.push("main"),
    ])
    expect(results).toEqual([true, true, true])
    expect(maxConcurrent).toBe(1)
  })

  /**
   * Fake Git whose `log` answers the tracking-ref lookup
   * (`refs/remotes/artifacts/<branch>`) with `remoteHistory` and the local
   * branch lookup with `localHistory`.
   */
  function fakeGitWithHistory(opts: {
    remoteHistory?: string[]
    localHistory?: string[]
    onPush?: () => void
  }): Git {
    return {
      remote: async () => ({ added: "artifacts", url: "x" }),
      log: async ({ ref }: { ref?: string }) => {
        const oids = ref?.startsWith("refs/remotes/") ? opts.remoteHistory : opts.localHistory
        if (!oids) throw new Error("ref not found")
        return oids.map((oid) => ({ oid, message: "c", author: {}, parent: [] }))
      },
      push: async () => {
        opts.onPush?.()
        return { ok: true, refs: {} }
      },
    } as unknown as Git
  }

  it("refuses to force-push when local history does not contain the remote head", async () => {
    let pushes = 0
    const git = fakeGitWithHistory({
      remoteHistory: ["remote-head"],
      localHistory: ["diverged-root"],
      onPush: () => pushes++,
    })
    const sync = new ArtifactsSync(
      fakeArtifacts(),
      git,
      "repo",
      memStore("https://artifacts.example/repo.git"),
      silentLogger,
    )

    // A diverged local branch (e.g. a root commit made while the base could
    // not be loaded) must NOT overwrite remote history.
    expect(await sync.push("main")).toBe(false)
    expect(pushes).toBe(0)
  })

  it("pushes when the local branch descends from the remote head", async () => {
    let pushes = 0
    const git = fakeGitWithHistory({
      remoteHistory: ["base-commit"],
      localHistory: ["new-commit", "base-commit"],
      onPush: () => pushes++,
    })
    const sync = new ArtifactsSync(
      fakeArtifacts(),
      git,
      "repo",
      memStore("https://artifacts.example/repo.git"),
      silentLogger,
    )

    expect(await sync.push("main")).toBe(true)
    expect(pushes).toBe(1)
  })

  it("pushes when no remote head is known (first push / never fetched)", async () => {
    let pushes = 0
    const git = fakeGitWithHistory({
      remoteHistory: undefined,
      localHistory: ["first-commit"],
      onPush: () => pushes++,
    })
    const sync = new ArtifactsSync(
      fakeArtifacts(),
      git,
      "repo",
      memStore("https://artifacts.example/repo.git"),
      silentLogger,
    )

    expect(await sync.push("main")).toBe(true)
    expect(pushes).toBe(1)
  })
})
