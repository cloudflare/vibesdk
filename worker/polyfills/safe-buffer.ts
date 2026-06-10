/**
 * ESM shim for the `safe-buffer` package.
 *
 * `@cloudflare/shell` bundles standard `isomorphic-git`, whose `sha.js`
 * transitive `require("safe-buffer")`, and `safe-buffer` itself does an
 * unguarded `require("buffer")`. When bundled for Workers that becomes an
 * eager `__require("buffer")` inside a code-split chunk, which throws at
 * startup because Workers does not expose a global `require` there
 * (deploy error 10021).
 *
 * `safe-buffer` is just a pass-through to the `buffer` module on modern
 * runtimes (Node >= 4.5 / `node:buffer`), so re-export `node:buffer` via a
 * static ESM import. Being ESM, the bundler links `node:buffer` as a normal
 * runtime-provided import (`nodejs_compat`) instead of a `require()` call.
 */
import { Buffer } from 'node:buffer';

export * from 'node:buffer';
export default { Buffer };
