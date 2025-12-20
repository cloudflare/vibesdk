## SDK tests

### Unit tests
Run SDK unit tests (no env required):

- `bun run test`

### Integration tests (local platform)
The integration tests hit a real VibeSDK dev server and require an API key.

1. Start the platform dev server:
   - `npm run dev`

2. Create an API key in Settings → API Keys.

3. Run the integration test with the key:

- `VIBESDK_INTEGRATION_API_KEY="..." bun run test:integration`

Optional:
- `VIBESDK_INTEGRATION_BASE_URL="http://localhost:5173"`
- `VIBESDK_INTEGRATION_RUN_PREVIEW=1` (runs preview deployment test; slower)

Notes:
- Integration tests can take 5–10 minutes for real builds; the runner uses `bun test --timeout 600000`.
- The integration tests fail fast if `VIBESDK_INTEGRATION_API_KEY` is missing.
- The key is treated as sensitive; prefer exporting it in your shell rather than committing it.
