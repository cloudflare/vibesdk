import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.test.jsonc' },
        miniflare: {
          compatibilityDate: '2024-12-12',
          compatibilityFlags: ['nodejs_compat'],
        },
      },
    },
    globals: true,
    setupFiles: ['./test/setup.ts'],
    include: ['**/*.{test,spec}.{js,ts,jsx,tsx}'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/.git/**', '**/test/**', '**/worker/api/routes/**'],
  },
});