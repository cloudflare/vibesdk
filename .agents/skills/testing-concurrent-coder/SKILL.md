# Testing Concurrent Coder Feature

## Overview
The Concurrent Coder (CC) is a swarm AI coding assistant with 6 specialist Durable Object agents, accessible at `/concurrent-coder`. It requires authentication (ProtectedRoute).

## Local Dev Setup

### Required Environment Variables
The following must be set in `.dev.vars` (NOT just `wrangler.jsonc`, since `.dev.vars` overrides wrangler vars):

- `JWT_SECRET` - Must be a non-empty string. Without this, user registration/login fails with "JWT_SECRET not configured"
- `CUSTOM_DOMAIN` - Must be set to `"localhost"` for local dev. Without this, ALL API calls return 500 "Server configuration error: Application domain is not set."

### Devin Secrets Needed
No external secrets are required for local testing. The JWT_SECRET and CUSTOM_DOMAIN can be set to local dev values.

### Vite Config
- `remoteBindings: false` must be set in `vite.config.ts` cloudflare plugin config to avoid "Timed out waiting for authorization code" errors when no Cloudflare credentials are available
- Dev server runs on `http://localhost:5173/`

### Starting Dev Server
```bash
npm run dev
```
The server will rebuild Docker containers on startup (for sandbox service). Wait for "server restarted" message before testing.

## Authentication for Testing
- Email auth is enabled by default (`requiresEmailAuth: true` in config)
- No OAuth setup needed
- Register a test user via the browser UI: Sign In → Sign Up → fill name/email/password
- The ProtectedRoute at `/concurrent-coder` redirects to `/` if not authenticated

## Browser Testing
- Chrome may not be pre-installed. Use the Chrome binary at `/opt/.devin/chrome/chrome/linux-133.0.6943.126/chrome-linux64/chrome`
- Launch with: `--no-sandbox --remote-debugging-port=29229 --user-data-dir=/tmp/chrome-data`
- The wrapper at `/home/ubuntu/.local/bin/google-chrome` connects to port 29229

## Test Cases

### 1. Registration & Dashboard Access
- Register via Sign In → Sign Up with email/password
- Navigate to `/concurrent-coder`
- Verify: title "Concurrent Coder", prompt textarea, Build button, tabs

### 2. Build Session
- Type prompt (e.g., "Build a todo app with React + D1") and click Build
- Orchestrator DO starts and creates timeline events
- Without real LLM API keys, the pipeline won't progress beyond Orchestrator start, but the session starts successfully

### 3. STOP Button
- Click Stop while session is running
- Status changes to "aborted", timeline shows "Session aborted by user"

### 4. AUTO Toggle
- Click "Auto OFF" → toggles to "Auto ON" and vice versa
- Works even on aborted sessions

### 5. Erase Modal
- Click "Erase History" (red button)
- Modal shows session list with checkboxes, "Also erase long-term AI memory" option
- Cancel closes modal without erasing

### 6. Skills Manager
- Click "Skills Manager" tab
- Shows "Superpowers / Skills" with "+ Add Skill" button
- Upload form has filename and content fields
- Tab switching between Timeline and Skills Manager is instant

## Known Limitations in Local Dev
- No real LLM APIs available → Architect/Coder/etc. agents can't generate code
- Vectorize bindings don't work locally → embedding erasure can't be tested
- Dispatch Namespace bindings don't work locally → deployment can't be tested
- D1 database works locally via miniflare
- KV works locally via miniflare
- Durable Objects work locally via miniflare

## Common Issues
- `.dev.vars` overrides `wrangler.jsonc` vars — always check both files when debugging env var issues
- CSRF validation requires browser-based testing (curl won't work due to cookie handling)
- Dev server auto-restarts on config changes but you may need to press `r + Enter` to force restart
