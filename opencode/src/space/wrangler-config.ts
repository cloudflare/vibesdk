// ─── Wrangler Config Parser ──────────────────────────────────────────────────
// Parses the child project's wrangler.toml / wrangler.json / wrangler.jsonc
// to extract deployment-relevant configuration.

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

  return cfg
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
