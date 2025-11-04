// Import Env type from worker-configuration
/// <reference types="../worker-configuration.d.ts" />

declare module "cloudflare:test" {
  // Export env for test access
  export const env: ProvidedEnv;
  
  // ProvidedEnv extends the Env from worker-configuration.d.ts
  interface ProvidedEnv extends Env {
  }
}
