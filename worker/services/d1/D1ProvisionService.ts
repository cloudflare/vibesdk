/**
 * D1ProvisionService — Cloudflare D1 database auto-provisioning.
 *
 * Creates and manages per-session D1 databases via the Cloudflare REST API.
 * No SDK dependency — raw fetch() only; compatible with Cloudflare Workers.
 *
 * Endpoint: POST /client/v4/accounts/{account_id}/d1/database
 * Auth: Bearer {CLOUDFLARE_API_TOKEN}
 *
 * Design (DEC-035-D):
 *   - One D1 database per session for live preview (vibesdk-owned CF account)
 *   - generateSetupDoc() returns a wrangler.setup.md the user copies to deploy
 *     their own D1 in their own CF account
 *   - deleteSessionDatabase() called on session expiry to avoid accumulating DBs
 *
 * Required env bindings (already present in worker-configuration.d.ts):
 *   CLOUDFLARE_API_TOKEN — CF API token with D1:Edit permission
 *   CLOUDFLARE_ACCOUNT_ID — CF account ID
 */

const CF_API = 'https://api.cloudflare.com/client/v4';

export interface D1ProvisionEnv {
    readonly CLOUDFLARE_API_TOKEN: string;
    readonly CLOUDFLARE_ACCOUNT_ID: string;
}

export interface D1Database {
    readonly uuid: string;
    readonly name: string;
    readonly created_at: string;
}

export interface D1ProvisionResult {
    readonly success: boolean;
    readonly database?: D1Database;
    readonly error?: string;
}

export interface D1DeleteResult {
    readonly success: boolean;
    readonly error?: string;
}

interface CloudflareApiResponse<T> {
    readonly success: boolean;
    readonly result?: T;
    readonly errors?: ReadonlyArray<{ readonly code: number; readonly message: string }>;
}

export class D1ProvisionService {
    private readonly accountId: string;
    private readonly apiToken: string;

    constructor(env: D1ProvisionEnv) {
        this.accountId = env.CLOUDFLARE_ACCOUNT_ID;
        this.apiToken = env.CLOUDFLARE_API_TOKEN;
    }

    /**
     * Create a new D1 database for a session.
     *
     * Database name format: `vibesdk-{sessionId}-{epochSeconds}`.
     * Truncated to 32 chars to stay within CF naming limits.
     */
    async createSessionDatabase(sessionId: string): Promise<D1ProvisionResult> {
        const epoch = Math.floor(Date.now() / 1000);
        // CF D1 name limit: 64 chars, alphanumeric + hyphens
        const rawName = `vibesdk-${sessionId}-${epoch}`;
        const name = rawName.replace(/[^a-zA-Z0-9-]/g, '-').slice(0, 64);

        try {
            const response = await fetch(
                `${CF_API}/accounts/${this.accountId}/d1/database`,
                {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${this.apiToken}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ name }),
                },
            );

            const json = (await response.json()) as CloudflareApiResponse<D1Database>;

            if (!response.ok || !json.success || !json.result) {
                const errMsg = json.errors?.[0]?.message ?? `CF API ${response.status}`;
                return { success: false, error: errMsg };
            }

            return { success: true, database: json.result };
        } catch (err) {
            return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
        }
    }

    /**
     * Delete a session D1 database by UUID.
     * Call on session expiry to avoid accumulating unused databases.
     */
    async deleteSessionDatabase(databaseUuid: string): Promise<D1DeleteResult> {
        try {
            const response = await fetch(
                `${CF_API}/accounts/${this.accountId}/d1/database/${databaseUuid}`,
                {
                    method: 'DELETE',
                    headers: { Authorization: `Bearer ${this.apiToken}` },
                },
            );

            if (!response.ok) {
                const body = await response.text();
                return { success: false, error: `CF API ${response.status}: ${body}` };
            }

            return { success: true };
        } catch (err) {
            return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
        }
    }

    /**
     * Generate a wrangler.setup.md explaining how the user provisions their own
     * D1 database in their CF account for production deployment.
     *
     * @param databaseName - Suggested DB name (e.g. the app name slug)
     * @param bindingName  - Wrangler binding variable name (e.g. "DB")
     * @param migrationSql - Optional migration SQL to include in the doc
     */
    generateSetupDoc(
        databaseName: string,
        bindingName: string = 'DB',
        migrationSql?: string,
    ): string {
        const safeName = databaseName.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase().slice(0, 64);

        return `# D1 Database Setup Guide

This app requires a Cloudflare D1 database. Follow the steps below to provision
it in your own Cloudflare account.

## Prerequisites

- Cloudflare account (free plan works)
- Wrangler CLI installed: \`npm install -g wrangler\`
- Logged in: \`wrangler login\`

## Step 1 — Create the database

\`\`\`bash
wrangler d1 create ${safeName}
\`\`\`

Note the **database_id** from the output (e.g. \`xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx\`).

## Step 2 — Add the binding to wrangler.jsonc

Open your \`wrangler.jsonc\` and add:

\`\`\`jsonc
{
  "d1_databases": [
    {
      "binding": "${bindingName}",
      "database_name": "${safeName}",
      "database_id": "<YOUR_DATABASE_ID_FROM_STEP_1>"
    }
  ]
}
\`\`\`
${
    migrationSql
        ? `
## Step 3 — Run migrations

Save the following SQL to \`migrations/0001_initial.sql\`:

\`\`\`sql
${migrationSql}
\`\`\`

Apply migrations to local D1 (dev):

\`\`\`bash
wrangler d1 execute ${safeName} --local --file=migrations/0001_initial.sql
\`\`\`

Apply migrations to production D1:

\`\`\`bash
wrangler d1 execute ${safeName} --remote --file=migrations/0001_initial.sql
\`\`\`
`
        : `
## Step 3 — Apply migrations

\`\`\`bash
# Apply to local D1 (dev)
wrangler d1 execute ${safeName} --local --file=migrations/0001_initial.sql

# Apply to production D1
wrangler d1 execute ${safeName} --remote --file=migrations/0001_initial.sql
\`\`\`
`
}
## Step 4 — Deploy

\`\`\`bash
wrangler deploy
\`\`\`

Your app is now connected to D1. The \`${bindingName}\` binding is available in
your Worker as \`env.${bindingName}\`.

---

*Generated by vibesdk. Questions? Visit vibesdk.app or reply to your welcome email.*
`;
    }
}
