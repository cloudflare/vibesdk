/**
 * Durable checkpoint of the workspace overlay in the SpaceDO's own SQLite
 * storage.
 *
 * Why this exists: the workspace (overlay workdir + `.git` objects) is
 * in-memory, and Cloudflare resets DO instances on every code update, eviction,
 * or runtime update. Artifacts only holds PUSHED commits — so until the first
 * `deploy_space` (and between deploys), a reset wipes everything the agent has
 * written. The checkpoint closes that gap: every write is mirrored into DO
 * storage (debounced), and a cold-started DO replays it on top of the
 * Artifacts base — the overlay shadows the base, so the newer checkpointed
 * content wins automatically.
 *
 * Rows are a delta against the last successful push: after a push succeeds the
 * table is cleared (the base now covers those files) and only subsequent
 * writes are checkpointed. Tombstones record deletions relative to the base.
 *
 * Everything here is best-effort: checkpoint failures must never break a file
 * operation.
 */

/** The checkpoint contents, applied over the Artifacts base after a cold start. */
export interface CheckpointSnapshot {
  /** Absolute path -> current bytes (shadows the base). */
  files: Array<[path: string, bytes: Uint8Array]>
  /** Absolute paths deleted relative to the base (applied as whiteouts). */
  tombstones: string[]
}

export interface CheckpointSource {
  load(): CheckpointSnapshot
}

const TABLE = "space_checkpoint"

/** Minimal shape of `ctx.storage.sql` this store relies on. */
export interface SqlStorageLike {
  exec(
    query: string,
    ...bindings: unknown[]
  ): { toArray(): Array<Record<string, unknown>> }
}

export class CheckpointStore implements CheckpointSource {
  private readonly sql: SqlStorageLike

  constructor(storage: { sql: SqlStorageLike }) {
    this.sql = storage.sql
    this.sql.exec(
      `CREATE TABLE IF NOT EXISTS ${TABLE} (` +
        `path TEXT PRIMARY KEY, data BLOB, tombstone INTEGER NOT NULL DEFAULT 0)`,
    )
  }

  /**
   * Record a path's current bytes — or, with `null`, its deletion. Deleting a
   * path also drops any checkpointed rows BENEATH it (a recursive `rm`), so a
   * later restore cannot resurrect them; base files under the path are hidden
   * by the whiteout's ancestor coverage.
   */
  save(path: string, bytes: Uint8Array | null): void {
    if (bytes === null) {
      this.sql.exec(
        `DELETE FROM ${TABLE} WHERE path = ? OR substr(path, 1, ?) = ?`,
        path,
        path.length + 1,
        `${path}/`,
      )
      this.sql.exec(
        `INSERT OR REPLACE INTO ${TABLE} (path, data, tombstone) VALUES (?, NULL, 1)`,
        path,
      )
      return
    }
    // `.slice().buffer`: a fresh, exactly-sized ArrayBuffer for the blob binding.
    this.sql.exec(
      `INSERT OR REPLACE INTO ${TABLE} (path, data, tombstone) VALUES (?, ?, 0)`,
      path,
      bytes.slice().buffer,
    )
  }

  /**
   * Drop every row. Call after a successful Artifacts push — the pushed base
   * now covers all checkpointed content, so the checkpoint restarts empty.
   */
  clear(): void {
    this.sql.exec(`DELETE FROM ${TABLE}`)
  }

  load(): CheckpointSnapshot {
    const files: Array<[string, Uint8Array]> = []
    const tombstones: string[] = []
    for (const row of this.sql.exec(`SELECT path, data, tombstone FROM ${TABLE}`).toArray()) {
      const path = row.path as string
      if (row.tombstone) tombstones.push(path)
      else files.push([path, new Uint8Array(row.data as ArrayBuffer)])
    }
    return { files, tombstones }
  }
}
