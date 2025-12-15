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

// 3. Create the custom logger for Vite
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

const SCRATCH_TEMPLATE_INSTRUCTIONS = `
To build a valid, previewable and deployable project, it is essential to follow few important rules:

1. The package.json **MUST** be of the following form: 
\`\`\`
...
	"scripts": {
		"dev": "vite --host 0.0.0.0 --port \${PORT:-8001}",
		"build": "vite build",
		"lint": "eslint --cache -f json --quiet .",
		"preview": "bun run build && vite preview --host 0.0.0.0 --port \${PORT:-8001}",
		"deploy": "bun run build && wrangler deploy",
		"cf-typegen": "wrangler types"
	}
...
\`\`\`

Failure to have a compatible package.json would result in the app un-previewable and un-deployable.

2. The project **MUST** be a valid Cloudflare worker/durable object + Vite + bun project. 

3. It must have a valid wrangler.jsonc and a vite.config.ts file.

4. The vite config file MUST have the following minimal config:
\`\`\`ts
${VITE_CONFIG_MINIMAL}
\`\`\`
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
        allFiles: {},
        language: 'typescript',
        deps: {},
        projectType: 'general',
        frameworks: [],
        importantFiles: [],
        dontTouchFiles: [],
        redactedFiles: [],
        disabled: false,
    };
}

