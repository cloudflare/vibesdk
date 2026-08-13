import { fileURLToPath } from "node:url";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, lazyPlugins } from "vite-plus";

function librarySource(path: string): string {
  return fileURLToPath(new URL(`../../packages/artifacts-viewer/src/${path}`, import.meta.url));
}

/**
 * The package `exports` point at `dist`, so Vite would never pick `src` on its
 * own. Aliasing during `serve` gives source-level HMR without `vp pack --watch`;
 * builds drop the aliases so they exercise the published entry points.
 *
 * Order matters: alias keys match on segment boundaries, so the bare
 * `artifacts-viewer` entry has to come last.
 */
const developmentAliases = {
  "artifacts-viewer/server/cache": librarySource("server/cache-adapters.ts"),
  "artifacts-viewer/client": librarySource("client/index.ts"),
  "artifacts-viewer/react": librarySource("react/index.ts"),
  "artifacts-viewer/styles.css": librarySource("styles/viewer.css"),
  "artifacts-viewer": librarySource("index.ts"),
};

export default defineConfig(({ command }) => ({
  plugins: lazyPlugins(() => [react(), tailwindcss(), cloudflare()]),
  resolve: command === "serve" ? { alias: developmentAliases } : undefined,
  lint: {
    plugins: ["react", "typescript", "oxc"],
    rules: {
      "react/rules-of-hooks": "error",
      "react/only-export-components": ["warn", { allowConstantExport: true }],
      "vite-plus/prefer-vite-plus-imports": "error",
    },
    options: {
      typeAware: true,
      typeCheck: true,
    },
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
  },
}));
