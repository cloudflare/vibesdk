// ─── Inspector wrapper module ──────────────────────────────────────────────
//
// The DB-viewer tab needs to read SQL from the user's App Durable Object,
// but the Facet's storage is fully isolated from the supervisor (SpaceDO).
// The only way to read it is via methods on the App class itself.
//
// Rather than asking the LLM to paste ~60 lines of inspector boilerplate
// into every app, we inject a small wrapper module into the dynamic
// worker. The wrapper:
//   1. imports the user's App class,
//   2. re-exports every other named export unchanged,
//   3. exports a subclass `App` (shadowing the user's) that extends the
//      user's App and adds `__vibeInspectListTables` / `__vibeInspectRead`.
//
// SpaceDO loads this wrapper as the main module and `getDurableObjectClass
// ("App")` returns the subclass. The subclass shares the user's `ctx`,
// `ctx.storage`, and any state — so the inspector reads the same SQLite
// database the user's App writes to.

export const VIBE_APP_MODULE = "__vibe_app__.js"

/**
 * Build the wrapper source. `userMainModule` is the key in `modules`
 * holding the LLM's compiled main (which must `export class App
 * extends DurableObject`).
 */
export function buildInspectorWrapperSource(userMainModule: string): string {
  return `import * as __vibeUserModule from ${JSON.stringify(userMainModule)}

// Re-export everything from the user's module first. We then shadow the
// \`App\` export below with the subclass.
export * from ${JSON.stringify(userMainModule)}

const __VIBE_UserApp = __vibeUserModule.App
if (typeof __VIBE_UserApp !== "function") {
  throw new Error(
    "Your main module must export a class named \`App\` extending DurableObject. " +
    "See the cloudflare-bundler-apps skill for the required app structure."
  )
}

const __VIBE_IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/
const __VIBE_MAX_PAGE_SIZE = 200

function __vibeIsSafeIdentifier(name) {
  return typeof name === "string" && __VIBE_IDENT_RE.test(name)
}

function __vibeQuote(name) {
  return '"' + String(name).replace(/"/g, '""') + '"'
}

export class App extends __VIBE_UserApp {
  async __vibeInspectListTables() {
    const sql = this.ctx.storage.sql
    const tableRows = sql.exec(
      "SELECT name FROM sqlite_master " +
      "WHERE type = 'table' " +
      "  AND name NOT LIKE 'sqlite_%' " +
      "  AND name NOT LIKE '_cf_%' " +
      "ORDER BY name"
    ).toArray()
    const out = []
    for (const row of tableRows) {
      const name = row.name
      if (!__vibeIsSafeIdentifier(name)) continue
      const columns = sql.exec(
        "PRAGMA table_info(" + __vibeQuote(name) + ")"
      ).toArray().map((c) => ({
        name: c.name, type: c.type, notnull: c.notnull, pk: c.pk,
      }))
      let rowCount = 0
      try {
        const cnt = sql.exec(
          "SELECT COUNT(*) AS c FROM " + __vibeQuote(name)
        ).one()
        rowCount = Number(cnt.c)
      } catch {
        rowCount = 0
      }
      out.push({ name, rowCount, columns })
    }
    return out
  }

  async __vibeInspectRead(table, opts) {
    opts = opts || {}
    if (!__vibeIsSafeIdentifier(table)) {
      throw new Error("Invalid table name: " + table)
    }
    const sql = this.ctx.storage.sql
    const exists = sql.exec(
      "SELECT COUNT(*) AS c FROM sqlite_master WHERE type='table' AND name = ?",
      table
    ).one().c
    if (!exists) throw new Error("Unknown table: " + table)
    const columns = sql.exec(
      "PRAGMA table_info(" + __vibeQuote(table) + ")"
    ).toArray().map((c) => c.name)
    const limit = Math.max(1, Math.min(__VIBE_MAX_PAGE_SIZE, opts.limit || 50))
    const offset = Math.max(0, opts.offset || 0)
    let orderClause = ""
    if (opts.orderBy) {
      if (!columns.includes(opts.orderBy)) {
        throw new Error("Unknown column: " + opts.orderBy)
      }
      const dir = opts.orderDir === "desc" ? "DESC" : "ASC"
      orderClause = " ORDER BY " + __vibeQuote(opts.orderBy) + " " + dir
    }
    const totalCount = Number(sql.exec(
      "SELECT COUNT(*) AS c FROM " + __vibeQuote(table)
    ).one().c)
    const rows = sql.exec(
      "SELECT * FROM " + __vibeQuote(table) + orderClause + " LIMIT ? OFFSET ?",
      limit, offset
    ).toArray()
    return { columns, rows, totalCount }
  }

  async __vibeWipe() {
    // Drop every user table. The next request recreates whatever
    // CREATE TABLE IF NOT EXISTS the App runs on startup.
    const sql = this.ctx.storage.sql
    const tableRows = sql.exec(
      "SELECT name FROM sqlite_master " +
      "WHERE type = 'table' " +
      "  AND name NOT LIKE 'sqlite_%' " +
      "  AND name NOT LIKE '_cf_%'"
    ).toArray()
    this.ctx.storage.transactionSync(() => {
      for (const row of tableRows) {
        const name = row.name
        if (!__vibeIsSafeIdentifier(name)) continue
        sql.exec("DROP TABLE IF EXISTS " + __vibeQuote(name))
      }
    })
    return { ok: true }
  }
}
`
}
