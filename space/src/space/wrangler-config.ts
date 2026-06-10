// ─── Wrangler Config Parser ──────────────────────────────────────────────────
// Parses the child project's wrangler.toml / wrangler.json / wrangler.jsonc
// to extract deployment-relevant configuration.

export interface ParsedDurableObjectBinding {
  name: string
  className: string
}

export interface ParsedWranglerConfig {
  main?: string
  compatibilityDate?: string
  compatibilityFlags?: string[]
  assets?: {
    directory?: string
    binding?: string
    htmlHandling?: "auto-trailing-slash" | "force-trailing-slash" | "drop-trailing-slash" | "none"
    notFoundHandling?: "single-page-application" | "404-page" | "none"
  }
  /**
   * Durable Object bindings declared by the child project (Tier-2 apps).
   * Each binding must reference a SQLite-backed class exported from `main`.
   * `script_name`-style externals and KV-backed (`new_classes`) DOs are
   * rejected upstream of the parser so we keep this shape minimal.
   */
  durableObjects?: ParsedDurableObjectBinding[]
}

export class WranglerConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "WranglerConfigError"
  }
}

/**
 * Try to parse wrangler config from a set of project files.
 * Checks wrangler.json, wrangler.jsonc, then wrangler.toml.
 */
export function parseWranglerConfig(files: Record<string, string>): ParsedWranglerConfig {
  const jsonContent = files["wrangler.json"] ?? files["wrangler.jsonc"]
  if (jsonContent) return parseJsonConfig(jsonContent)

  const tomlContent = files["wrangler.toml"]
  if (tomlContent) return parseTomlConfig(tomlContent)

  return {}
}

function parseJsonConfig(content: string): ParsedWranglerConfig {
  // Strip single-line comments for jsonc support
  const stripped = content.replace(/^\s*\/\/.*$/gm, "")
  const raw = JSON.parse(stripped)

  const cfg: ParsedWranglerConfig = {}
  if (typeof raw.main === "string") cfg.main = raw.main
  if (typeof raw.compatibility_date === "string") cfg.compatibilityDate = raw.compatibility_date
  if (Array.isArray(raw.compatibility_flags)) cfg.compatibilityFlags = raw.compatibility_flags

  if (raw.assets && typeof raw.assets === "object") {
    cfg.assets = {}
    if (typeof raw.assets.directory === "string") cfg.assets.directory = raw.assets.directory
    if (typeof raw.assets.binding === "string") cfg.assets.binding = raw.assets.binding
    if (typeof raw.assets.html_handling === "string") cfg.assets.htmlHandling = raw.assets.html_handling
    if (typeof raw.assets.not_found_handling === "string") cfg.assets.notFoundHandling = raw.assets.not_found_handling
  }

  // ── Durable Objects (Tier 2) ───────────────────────────────────
  const dos = parseDurableObjectsJson(raw)
  if (dos && dos.length > 0) cfg.durableObjects = dos

  return cfg
}

function parseDurableObjectsJson(raw: any): ParsedDurableObjectBinding[] | undefined {
  const block = raw?.durable_objects
  if (!block || typeof block !== "object") return undefined
  const bindings = block.bindings
  if (!Array.isArray(bindings) || bindings.length === 0) return undefined

  // Collect the set of class names allowed by migrations.
  const sqliteClasses = new Set<string>()
  const nonSqliteClasses = new Set<string>()
  const migrations = Array.isArray(raw.migrations) ? raw.migrations : []
  for (const m of migrations) {
    if (!m || typeof m !== "object") continue
    if (Array.isArray(m.new_sqlite_classes)) {
      for (const c of m.new_sqlite_classes) {
        if (typeof c === "string") sqliteClasses.add(c)
      }
    }
    if (Array.isArray(m.new_classes)) {
      for (const c of m.new_classes) {
        if (typeof c === "string") nonSqliteClasses.add(c)
      }
    }
  }

  const result: ParsedDurableObjectBinding[] = []
  for (const b of bindings) {
    if (!b || typeof b !== "object") continue
    if (typeof b.script_name === "string") {
      throw new WranglerConfigError(
        `Durable Object binding "${b.name ?? "?"}" uses script_name. ` +
        `Generated apps cannot reference Durable Objects from other scripts.`,
      )
    }
    const name = typeof b.name === "string" ? b.name : null
    const className = typeof b.class_name === "string" ? b.class_name : null
    if (!name || !className) {
      throw new WranglerConfigError(
        `Durable Object binding must have both "name" and "class_name".`,
      )
    }
    if (nonSqliteClasses.has(className)) {
      throw new WranglerConfigError(
        `Durable Object class "${className}" uses new_classes (KV storage). ` +
        `Generated apps must declare it under new_sqlite_classes instead.`,
      )
    }
    if (!sqliteClasses.has(className)) {
      throw new WranglerConfigError(
        `Durable Object class "${className}" is not declared in migrations.new_sqlite_classes. ` +
        `Add a migration tag with new_sqlite_classes: ["${className}"].`,
      )
    }
    result.push({ name, className })
  }

  return result
}

function parseTomlConfig(content: string): ParsedWranglerConfig {
  const cfg: ParsedWranglerConfig = {}

  // Top-level fields (before any [section])
  cfg.main = extractTomlString(content, "main", true)
  cfg.compatibilityDate = extractTomlString(content, "compatibility_date", true)

  const flags = extractTomlArray(content, "compatibility_flags", true)
  if (flags) cfg.compatibilityFlags = flags

  // [assets] section
  const assetsSection = extractTomlSection(content, "assets")
  if (assetsSection) {
    cfg.assets = {}
    cfg.assets.directory = extractTomlString(assetsSection, "directory")
    cfg.assets.binding = extractTomlString(assetsSection, "binding")
    cfg.assets.htmlHandling = extractTomlString(assetsSection, "html_handling") as ParsedWranglerConfig["assets"] extends { htmlHandling?: infer T } ? T : never
    cfg.assets.notFoundHandling = extractTomlString(assetsSection, "not_found_handling") as ParsedWranglerConfig["assets"] extends { notFoundHandling?: infer T } ? T : never
  }

  // TOML DO parsing is intentionally not supported; the space skill
  // tells the LLM to use wrangler.json (the file the bundler emits). If
  // a TOML config declares DOs, we surface a clear error so the user
  // knows to switch to JSON.
  if (/\[\[durable_objects\.bindings\]\]/.test(content)) {
    throw new WranglerConfigError(
      "Durable Object bindings in wrangler.toml are not supported. " +
      "Use wrangler.json instead.",
    )
  }

  return cfg
}

// ─── TOML Helpers (minimal, field-specific) ──────────────────────────────────

function extractTomlSection(content: string, name: string): string | undefined {
  const pattern = new RegExp(`^\\[${name}\\]\\s*\\n((?:(?!^\\[)[^\\n]*\\n?)*)`, "m")
  const match = content.match(pattern)
  return match?.[1]
}

function extractTomlString(content: string, key: string, topLevelOnly?: boolean): string | undefined {
  // If topLevelOnly, only match before the first [section]
  const scope = topLevelOnly ? content.split(/^\[/m)[0] : content
  const pattern = new RegExp(`^${key}\\s*=\\s*"([^"]*)"`, "m")
  return scope.match(pattern)?.[1]
}

function extractTomlArray(content: string, key: string, topLevelOnly?: boolean): string[] | undefined {
  const scope = topLevelOnly ? content.split(/^\[/m)[0] : content
  const pattern = new RegExp(`^${key}\\s*=\\s*\\[([^\\]]*)\\]`, "m")
  const match = scope.match(pattern)?.[1]
  if (!match) return undefined
  return match.split(",").map(s => s.trim().replace(/^"|"$/g, "")).filter(Boolean)
}
