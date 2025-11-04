import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
  test: {
    globals: true,
    pool: '@cloudflare/vitest-pool-workers',
    deps: {
      optimizer: {
        ssr: {
          enabled: true,
          include: [
            'ajv',
            '@cloudflare/containers',
            '@cloudflare/sandbox',
            '@babel/traverse',
            '@babel/types'
          ],
        },
      },
    },
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.test.jsonc' },
        miniflare: {
          compatibilityDate: '2024-12-12',
          compatibilityFlags: ['nodejs_compat'],
          bindings: {
            SECRETS_ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
          },
        },
      },
    },
    include: ['**/*.{test,spec}.{js,ts,jsx,tsx}'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/.git/**', '**/worker/api/routes/**'],
  },
});