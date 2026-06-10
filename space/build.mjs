import { build } from "esbuild"
import { resolve, dirname } from "path"
import { fileURLToPath } from "url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const src = (...p) => resolve(__dirname, "src", ...p)

// Alias map — reserved for any future bare-specifier shims. The live module
// graph (SpaceDO + provider + skill) uses relative imports only, so this is
// currently empty.
const aliasMap = {}

// External packages — NOT bundled into the library output.
//
// We deliberately bundle most npm dependencies (hono, ai, @ai-sdk/*, effect,
// zod, ulid, remeda, decimal.js, qrcode-generator, ai-gateway-provider) so
// `dist/index.js` is a self-contained Workers ESM module. Consumers using the
// @cloudflare/vite-plugin in particular don't follow bare imports inside
// pre-built workspace bundles, so leaving these as external broke
// same-worker integrations with "No such module 'hono'" at runtime.
//
// Kept external on purpose:
//   • cloudflare:workers / node:* / node built-ins — provided by the
//     Workers runtime, not packageable.
//   • @cloudflare/shell, @cloudflare/worker-bundler — Cloudflare runtime
//     libraries that use special Workers features and may need to remain
//     the consumer's exact version.
//   • drizzle-orm — used by `src/project/project.sql.ts`. NOT a declared
//     dependency of @space-do/space; consumer is expected to install
//     drizzle-orm themselves if they exercise that code path.
//   • isomorphic-git + transitives — pulled in by @cloudflare/shell at
//     runtime; must resolve to the consumer's copy to share state.
const external = [
  // Workers runtime
  "cloudflare:workers",
  // Cloudflare runtime libs (keep external — version must match consumer)
  "@cloudflare/shell",
  "@cloudflare/shell/*",
  "@cloudflare/worker-bundler",
  // Not declared in this package's deps; consumer must provide if used
  "drizzle-orm",
  "drizzle-orm/*",
  // Node built-ins (Workers provides nodejs_compat)
  "node:*",
  "crypto",
  "path",
  "os",
  "url",
  "fs",
  "stream",
  "buffer",
  "util",
  "events",
  "assert",
  "http",
  "https",
  "net",
  "tls",
  "zlib",
  "querystring",
  // isomorphic-git transitive deps (pulled in by @cloudflare/shell)
  "isomorphic-git",
  "isomorphic-git/*",
  "crc-32",
  "clean-git-ref",
  "diff3",
  "inherits",
  "sha.js",
  "sha.js/*",
]

await build({
  entryPoints: [src("index.ts")],
  bundle: true,
  format: "esm",
  platform: "neutral",
  target: "es2022",
  // Prefer browser/worker variants over node-CJS variants when resolving
  // package.json `exports`. The Workers runtime doesn't support CommonJS
  // dynamic `require()`, and several transitives (e.g. `@vercel/oidc`,
  // pulled in via `@ai-sdk/gateway` → `ai`) call `require("path")` /
  // `require("fs")` lazily in their node build. Honoring the `workerd` /
  // `worker` / `browser` conditions picks variants that don't.
  conditions: ["workerd", "worker", "browser", "module", "import"],
  mainFields: ["browser", "module", "main"],
  outdir: resolve(__dirname, "dist"),
  alias: aliasMap,
  external,
  sourcemap: true,
  // Text loader for .md and .txt files (prompt templates, etc.)
  loader: {
    ".md": "text",
    ".txt": "text",
  },
  logLevel: "info",
})

console.log("✓ Build complete → dist/")
