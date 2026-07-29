## Usage Limits UI Rules

Defines when each limits-related UI element renders, based on `UsageSummary` from `GET /api/limits/usage`.

## Inputs

| Field | Meaning |
| --- | --- |
| `config.unlimited` | True when the user has no free-tier cap (Cloudflare-connected, or self-hosted with `ENABLE_CLOUDFLARE_LIMITS != 'true'`). |
| `config.limit.maxValue` | Free-tier cap for the current window. `Infinity` when unlimited (serializes to `null`). |
| `config.limit.window` | `daily` (calendar-aligned UTC) or `rolling`. |
| `config.limit.resetAt` | ISO timestamp when the free window resets. |
| `hasUserToken` | Server has a decrypted Cloudflare OAuth token for the user. |
| `hasCloudflareConfigured` | User has selected an account + AI Gateway. |
| `cloudflareCredits` | Fetched Cloudflare AI Gateway balance (nullable). |
| `limitCheck.withinLimits` | False when free-tier is exhausted. |

`hasClientTokens` is a browser-side check (`hasTokens()` in `src/lib/cloudflare-oauth-provider.ts`) used only by the top-right badge to gate credit display.

## Top-right badge — `src/components/usage-limits-badge.tsx`

| User state | Badge content |
| --- | --- |
| Loading | Spinner |
| Token missing, free tier remaining | "Connect" label + usage pill (`N free credits left`) |
| Token present, gateway not selected | "Configure AI Gateway" (links to `/settings`) |
| Connected (token + gateway), free tier remaining | Usage pill (`N free credits left`) + `$X.XX credits` |
| Connected, free tier exhausted, credits known | `$X.XX credits` only |
| Connected but `cloudflareCredits` missing / `hasClientTokens` false | "Connect" label (credit display needs browser token) |
| Free tier exhausted, no token | Red "Free limit exhausted" pill + "Connect" label |

Rules:

*   Credit balance requires **all three**: `hasClientTokens` (browser) AND `hasCloudflareConfigured` (server) AND `cloudflareCredits` present. Otherwise falls back to "Connect".
*   Free-tier usage pill only renders when `config.limit` exists AND `!config.unlimited`.
*   Click target: `/settings` when `needsConfiguration` or Connected, otherwise the `onConnect` handler (OAuth flow).

## Credits banner — `src/components/credits-banner.tsx`

| User state | Banner content | CTA |
| --- | --- | --- |
| No `limitsData` / dismissed | Hidden | — |
| `config.unlimited` + connected (BYOK / feature flag on) | `$X.XX remaining · free credits reset in Yh` | Dismiss only |
| `config.unlimited` + not connected (self-hosted) | Hidden | — |
| Free tier active, not connected | `N free credits remaining · resets in Yh` | "Connect Cloudflare" + dismiss |
| Free tier active, connected | Same free-tier text | Dismiss only (no connect CTA) |
| Free tier exhausted, connected | `$X.XX remaining in AI Gateway · free credits reset in Yh` | Dismiss only |

**Note:** Default backend policy (`excludeCloudflareConnected: false`) keeps connected users on the free-tier counter until exhausted. They only hit the unlimited row when in BYOK mode (`excludeBYOKUsers` bypass) or when `excludeCloudflareConnected` is explicitly enabled.

Rules:

*   Reset text prefers `config.limit.resetAt` (server-provided); falls back to client-side calculation via `getResetDate(window, periodSeconds)`.
*   `rolling` window without `resetAt` uses the verb "resets within" (upper bound); everything else uses "resets in".
*   Connect CTA renders only when `!isConnected` (where `isConnected = hasUserToken &amp;&amp; hasCloudflareConfigured`).

## Limit popups — `src/utils/usage-limit-checker.tsx`

Triggered by `checkCanSendPrompt` (pre-flight) and `getBackendLimitDialog` (on backend `USAGE_LIMIT_EXCEEDED`).

| Condition | Dialog | Primary action |
| --- | --- | --- |
| `loading || !limitsData` | None (optimistic allow) | — |
| `limitCheck.withinLimits` (pre-flight only) | None | — |
| `!hasUserToken` | **Daily free limit exhausted** | "Connect Cloudflare" (OAuth) |
| `hasUserToken &amp;&amp; !hasCloudflareConfigured` | **Configure AI Gateway** | Navigate to `/settings?config_needed=true` |
| `hasUserToken &amp;&amp; hasCloudflareConfigured &amp;&amp; credits &lt; MINIMUM_CLOUDFLARE_BALANCE` | **Insufficient credits** (`$X.XX`) | Open `dash.cloudflare.com/{accountId}/ai/ai-gateway/credits` |
| Everything else | None (allow) | — |

`MINIMUM_CLOUDFLARE_BALANCE` is defined in `shared/constants/limits.ts`.

## Deploy gate popup — `src/utils/usage-limit-checker.tsx` (`getDeployGateDialog`)

Unlike the pre-flight limit popups, this one is **backend-error-triggered**: a user-account deploy (`target: 'user'`, think behavior) can fail with a structured `code` on the `cloudflare_deployment_error` WebSocket message (`worker/api/websocketTypes.ts`). `handle-websocket-message.ts` forwards the code via `onCloudflareDeployGate`; `chat.tsx` renders the dialog. The toast + chat message still show in all cases.

| `code` | Emitted when | Dialog | Primary action |
| --- | --- | --- | --- |
| `cloudflare_not_connected` | No decrypted Cloudflare OAuth token for the user | **Connect Cloudflare to deploy** | OAuth flow (`/oauth/login?return_url=...`) |
| `cloudflare_not_configured` | Multiple accounts connected and none selected (a sole connected account is used automatically — deploying needs no AI Gateway) | **Select a Cloudflare account** | Navigate to `/settings?config_needed=true` |
| _(absent)_ | Any other deploy failure | None (toast only) | — |

Think deploy targets are gated by the worker flag `ENABLE_USER_ACCOUNT_DEPLOY` (surfaced to the frontend as `userAccountDeploy` on `GET /api/capabilities`): when on, the think deploy button sends `target: 'user'` ("Deploy to My Account"); when off it sends `target: 'platform'` ("Deploy") and the backend publishes to the platform dispatch namespace with platform credentials — no Cloudflare connection required, so the popup never fires.

## Backend interactions

| Behavior | Source |
| --- | --- |
| BYOK users bypass LLM rate limits | `llmConfig.excludeBYOKUsers` (default: `true`) |
| Optionally exempt all connected users from limits | `llmConfig.excludeCloudflareConnected` (default: `false`) |
| Free tier uses calendar-daily window (UTC midnight reset) | `llmConfig.calendarDaily` |
| App-creation limits are independent of LLM limits | Separate `appCreation` config; not touched by connected/BYOK bypass |
| Limits feature disabled entirely | `ENABLE_CLOUDFLARE_LIMITS != 'true'` → `checkUsageAndBalance` returns `limit: Infinity` immediately |