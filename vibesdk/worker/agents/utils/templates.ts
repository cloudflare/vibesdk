import type { TemplateDetails } from '../../services/sandbox/sandboxTypes';

const VITE_CONFIG_MINIMAL = `
// Making changes to this file is **STRICTLY** forbidden. All the code in here is 100% correct and audited.
import { defineConfig, loadEnv } from "vite";
import path from "path";
import react from "@vitejs/plugin-react";
import { exec } from "node:child_process";
import pino from "pino";
import { cloudflare } from "@cloudflare/vite-plugin";

const logger = pino();

const stripAnsi = (str: string) =>
  str.replace(
    // eslint-disable-next-line no-control-regex -- Allow ANSI escape stripping
    /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g,
    ""
  );

const LOG_MESSAGE_BOUNDARY = /\\n(?=\\[[A-Z][^\\]]*\\])/g;

const emitLog = (level: "info" | "warn" | "error", rawMessage: string) => {
  const cleaned = stripAnsi(rawMessage).replace(/\r\n/g, "\n");
  const parts = cleaned
    .split(LOG_MESSAGE_BOUNDARY)
    .map((part) => part.trimEnd())
    .filter((part) => part.trim().length > 0);

  if (parts.length === 0) {
    logger[level](cleaned.trimEnd());
    return;
  }

  for (const part of parts) {
    logger[level](part);
  }
};

const customLogger = {
  warnOnce: (msg: string) => emitLog("warn", msg),

  // Use Pino's methods, passing the cleaned message
  info: (msg: string) => emitLog("info", msg),
  warn: (msg: string) => emitLog("warn", msg),
  error: (msg: string) => emitLog("error", msg),
  hasErrorLogged: () => false,

  // Keep these as-is
  clearScreen: () => {},
  hasWarned: false,
};

// https://vite.dev/config/
export default ({ mode }: { mode: string }) => {
  const env = loadEnv(mode, process.cwd());
  return defineConfig({
    plugins: [react(), cloudflare()],
    build: {
      minify: true,
      sourcemap: "inline", // Use inline source maps for better error reporting
      rollupOptions: {
        output: {
          sourcemapExcludeSources: false, // Include original source in source maps
        },
      },
    },
    customLogger: env.VITE_LOGGER_TYPE === 'json' ? customLogger : undefined,
    // Enable source maps in development too
    css: {
      devSourcemap: true,
    },
    server: {
      allowedHosts: true,   // This is IMPORTANT for dev server to work
      strictPort: true,     // Prevent auto-port-increment which breaks miniflare/preview mapping
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
        "@shared": path.resolve(__dirname, "./shared"),
      },
    },
    optimizeDeps: {
      // This is still crucial for reducing the time from when \`bun run dev\` is executed to when the server is actually ready.
      include: ["react", "react-dom", "react-router-dom"],
      exclude: ["agents"], // Exclude agents package from pre-bundling due to Node.js dependencies
      force: true,
    },
    define: {
      // Define Node.js globals for the agents package
      global: "globalThis",
    },
    cacheDir: "node_modules/.vite",
  });
};

`;

const SCRATCH_PACKAGE_JSON = `{
  "name": "scratch-project",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite --host 0.0.0.0 --port \${PORT:-8001}",
    "build": "vite build",
    "lint": "eslint --cache -f json --quiet .",
    "preview": "bun run build && vite preview --host 0.0.0.0 --port \${PORT:-8001}",
    "deploy": "bun run build && wrangler deploy",
    "cf-typegen": "wrangler types"
  },
  "dependencies": {
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "hono": "^4.8.5",
    "lucide-react": "^0.525.0",
    "pino": "^9.11.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "6.30.0",
    "tailwind-merge": "^3.3.1",
    "tailwindcss-animate": "^1.0.7"
  },
  "devDependencies": {
    "@cloudflare/vite-plugin": "^1.9.4",
    "@cloudflare/workers-types": "^4.20250807.0",
    "@types/node": "^22.15.3",
    "@types/react": "^18.3.1",
    "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.3.4",
    "autoprefixer": "^10.4.21",
    "postcss": "^8.5.3",
    "tailwindcss": "^3.4.17",
    "typescript": "5.8",
    "vite": "^6.3.1"
  }
}
`;

const SCRATCH_WRANGLER_JSONC = `{
  "name": "scratch-project",
  "main": "worker/index.ts",
  "compatibility_date": "2025-04-01",
  "compatibility_flags": ["nodejs_compat"],
  "assets": {
    "directory": "dist",
    "not_found_handling": "single-page-application",
    "run_worker_first": true,
    "binding": "ASSETS"
  },
  "observability": {
    "enabled": true
  }
}
`;

const SCRATCH_TEMPLATE_INSTRUCTIONS = `
To build a valid, previewable and deployable project, it is essential to follow few important rules:

1. A baseline \`package.json\` is already provided with required scripts and core dependencies. You may modify it to add additional dependencies your code needs.

2. The project **MUST** be a valid Cloudflare worker/durable object + Vite + bun project. 

3. A \`wrangler.jsonc\` is already provided and **MUST NOT be modified**. It is preconfigured for the deployment environment.

4. A \`vite.config.ts\` is already provided. **DO NOT modify it** unless absolutely necessary.
`;

/**
 * Single source of truth for an in-memory "scratch" template.
 * Used when starting from-scratch (general mode) or when no template fits.
 */
export function createScratchTemplateDetails(): TemplateDetails {
    return {
        name: 'scratch',
        description: { selection: 'from-scratch baseline', usage: `No template. Agent will scaffold as needed. **IT IS RECOMMENDED THAT YOU CHOOSE A VALID PRECONFIGURED TEMPLATE IF POSSIBLE** ${SCRATCH_TEMPLATE_INSTRUCTIONS}` },
        fileTree: { path: '/', type: 'directory', children: [] },
        allFiles: {
            'package.json': SCRATCH_PACKAGE_JSON,
            'vite.config.ts': VITE_CONFIG_MINIMAL,
            'wrangler.jsonc': SCRATCH_WRANGLER_JSONC,
        },
        language: 'typescript',
        deps: {},
        projectType: 'general',
        frameworks: [],
        importantFiles: [],
        dontTouchFiles: ['wrangler.jsonc'],
        redactedFiles: [],
        disabled: false,
    };
}

