// ── Auto-generated manifest (run: node scripts/gen-skill-manifest.mjs) ──
import { skills as manifest } from "./manifest"

export interface SkillInfo {
  name: string
  description: string
  location: string
  content: string
}

/**
 * Parse a SKILL.md string into SkillInfo.
 *
 * Supports two formats:
 * 1. YAML frontmatter: `---\nname: ...\ndescription: ...\n---\n<body>`
 * 2. No frontmatter: uses `dir` as name, first paragraph as description.
 */
function parse(dir: string, src: string): SkillInfo {
  const fm = src.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/)
  if (fm) {
    const meta: Record<string, string> = {}
    for (const line of fm[1].split("\n")) {
      const idx = line.indexOf(":")
      if (idx < 0) continue
      meta[line.slice(0, idx).trim()] = line.slice(idx + 1).trim()
    }
    return {
      name: meta.name || dir,
      description: meta.description || dir,
      location: `/workspace/.opencode/skills/${dir}/SKILL.md`,
      content: fm[2].trim(),
    }
  }

  // No frontmatter — derive name from directory, first non-heading paragraph as description
  const lines = src.split("\n")
  const desc = lines.find((l) => l.length > 0 && !l.startsWith("#") && !l.startsWith(">") && !l.startsWith("---"))
  return {
    name: dir,
    description: desc?.slice(0, 200) || dir,
    location: `/workspace/.opencode/skills/${dir}/SKILL.md`,
    content: src.trim(),
  }
}

// ── Registry ──────────────────────────────────────────────────────

const skills: SkillInfo[] = manifest.map((entry) => parse(entry.dir, entry.raw))
const index = new Map(skills.map((s) => [s.name, s]))

export function all(): SkillInfo[] {
  return skills
}

export function get(name: string): SkillInfo | undefined {
  return index.get(name)
}

export async function available(_agent?: any): Promise<SkillInfo[]> {
  return skills
}

export function fmt(list: SkillInfo[], opts: { verbose: boolean }): string {
  if (list.length === 0) return "No skills are currently available."

  if (opts.verbose) {
    return [
      "<available_skills>",
      ...list.flatMap((s) => [
        "  <skill>",
        `    <name>${s.name}</name>`,
        `    <description>${s.description}</description>`,
        "  </skill>",
      ]),
      "</available_skills>",
    ].join("\n")
  }

  return ["## Available Skills", ...list.map((s) => `- **${s.name}**: ${s.description}`)].join("\n")
}
