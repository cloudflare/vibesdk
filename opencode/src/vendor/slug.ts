// Shim: @opencode-ai/util/slug
const ADJECTIVES = ["gentle", "swift", "bright", "calm", "bold", "keen", "warm", "cool", "fair", "wise"]
const NOUNS = ["harbor", "forest", "meadow", "river", "canyon", "summit", "valley", "ocean", "island", "garden"]

export function slug(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)]
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)]
  return `${adj}-${noun}`
}
