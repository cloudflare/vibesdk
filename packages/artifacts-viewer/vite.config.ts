import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    entry: {
      index: "src/index.ts",
      "server/cache": "src/server/cache-adapters.ts",
      client: "src/client/index.ts",
      react: "src/react/index.ts",
    },
    platform: "neutral",
    format: ["esm"],
    dts: {
      tsgo: true,
    },
    sourcemap: true,
    css: {
      splitting: false,
      fileName: "styles.css",
    },
    copy: [
      {
        from: "src/styles/styles.css.d.ts",
        to: "dist",
        flatten: true,
      },
    ],
    exports: {
      customExports: {
        "./styles.css": {
          types: "./dist/styles.css.d.ts",
          default: "./dist/styles.css",
        },
      },
    },
  },
  lint: {
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  fmt: {},
});
