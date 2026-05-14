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

// ── DO SQLite scaffolding types (ADR-009) ────────────────────────────────────

/**
 * Column definition for a Durable Object SQLite table scaffold.
 */
export interface DurableObjectColumnDef {
    readonly name: string;
    readonly type: 'TEXT' | 'INTEGER' | 'REAL' | 'BLOB';
    readonly primaryKey?: boolean;
    readonly notNull?: boolean;
    /** Raw SQL default expression, e.g. "(unixepoch())" or "'active'" */
    readonly defaultSql?: string;
}

/**
 * Table definition for the DO SQLite scaffold.
 */
export interface DurableObjectTableDef {
    readonly name: string;
    readonly columns: readonly DurableObjectColumnDef[];
}

/**
 * Output of generateDurableObjectSQLiteCode — three ready-to-paste code blocks.
 */
export interface DurableObjectSQLiteCodeResult {
    /** TypeScript DO class file content */
    readonly doClassCode: string;
    /** wrangler.jsonc durable_objects + migrations snippet */
    readonly wranglerSnippet: string;
    /** Example Worker fetch handler calling the DO via RPC */
    readonly workerExampleCode: string;
}

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
     * Generate a complete Durable Object class with built-in SQLite storage.
     *
     * Generates three code blocks (ADR-009):
     * 1. DO class TypeScript — uses ctx.storage.sql (zero-setup, per-user isolation)
     * 2. wrangler.jsonc snippet — durable_objects + migrations entries
     * 3. Worker RPC example — how to call the DO from a standard Worker
     *
     * The generated DO is the preferred S14 database strategy for generated apps
     * that need a single-user backend (no D1 manual provisioning required).
     * Upgrade path → DO Facets (S15, requires Dynamic Workers).
     *
     * @param className   - DO class name, e.g. "AppDatabase"
     * @param bindingName - Env binding name, e.g. "APP_DB"
     * @param tables      - Table definitions to scaffold
     */
    generateDurableObjectSQLiteCode(
        className: string,
        bindingName: string,
        tables: readonly DurableObjectTableDef[],
    ): DurableObjectSQLiteCodeResult {
        const safeClass = className.replace(/[^a-zA-Z0-9]/g, '');
        const safeBinding = bindingName.replace(/[^a-zA-Z0-9_]/g, '_').toUpperCase();

        // ── Build CREATE TABLE statements ─────────────────────────────────────
        const createStatements = tables.map((table) => {
            const cols = table.columns.map((col) => {
                const parts: string[] = [`            ${col.name} ${col.type}`];
                if (col.primaryKey) parts.push('PRIMARY KEY');
                if (col.notNull && !col.primaryKey) parts.push('NOT NULL');
                if (col.defaultSql) parts.push(`DEFAULT ${col.defaultSql}`);
                return parts.join(' ');
            });
            return `            this.sql.exec(\`\n                CREATE TABLE IF NOT EXISTS ${table.name} (\n${cols.join(',\n')}\n                );\n            \`);`;
        });

        // ── DO class code ─────────────────────────────────────────────────────
        const doClassCode = `/**
 * ${safeClass} — Durable Object with SQLite storage.
 *
 * Generated by vibesdk. Uses Cloudflare Durable Objects ctx.storage.sql API.
 * Zero-config — each user gets an isolated SQLite instance automatically.
 * No wrangler d1 create or database ID required.
 *
 * Upgrade path (S15): wrap as a DO Facet for platform-managed provisioning.
 */

import { DurableObject } from 'cloudflare:workers';

export interface Env {
    ${safeBinding}: DurableObjectNamespace<${safeClass}>;
}

export class ${safeClass} extends DurableObject<Env> {
    private readonly sql: SqlStorage;

    constructor(ctx: DurableObjectState, env: Env) {
        super(ctx, env);
        this.sql = ctx.storage.sql;
        this.initializeSchema();
    }

    private initializeSchema(): void {
${createStatements.join('\n')}
    }
${tables
    .map((table) => {
        const pkCol = table.columns.find((c) => c.primaryKey);
        const pkName = pkCol?.name ?? 'id';
        return `
    /** Fetch all rows from ${table.name} */
    async getAll${capitalize(table.name)}(): Promise<ReadonlyArray<Record<string, unknown>>> {
        const cursor = this.sql.exec('SELECT * FROM ${table.name}');
        return cursor.toArray() as ReadonlyArray<Record<string, unknown>>;
    }

    /** Insert or replace a row in ${table.name} */
    async upsert${capitalize(table.name)}(${pkName}: string, data: Record<string, unknown>): Promise<void> {
        const cols = Object.keys(data);
        const placeholders = cols.map(() => '?').join(', ');
        const vals = cols.map((k) => data[k]);
        this.sql.exec(
            \`INSERT OR REPLACE INTO ${table.name} (${pkName}, \${cols.join(', ')}) VALUES (?, \${placeholders})\`,
            ${pkName}, ...vals,
        );
    }

    /** Delete a row from ${table.name} by ${pkName} */
    async delete${capitalize(table.name)}(${pkName}: string): Promise<void> {
        this.sql.exec('DELETE FROM ${table.name} WHERE ${pkName} = ?', ${pkName});
    }`;
    })
    .join('\n')}
}
`;

        // ── wrangler.jsonc snippet ────────────────────────────────────────────
        const wranglerSnippet = `// Add to wrangler.jsonc:
{
  "durable_objects": {
    "bindings": [
      {
        "name": "${safeBinding}",
        "class_name": "${safeClass}"
      }
    ]
  },
  "migrations": [
    {
      "tag": "v1",
      "new_sqlite_classes": ["${safeClass}"]
    }
  ]
}`;

        // ── Worker RPC example ────────────────────────────────────────────────
        const firstTable = tables[0];
        const firstMethod = firstTable ? `getAll${capitalize(firstTable.name)}` : 'getAll';
        const workerExampleCode = `// In your Worker's fetch handler (index.ts):
export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        // Each user gets their own isolated SQLite instance.
        // Use any stable per-user identifier as the DO name.
        const userId = request.headers.get('CF-Connecting-IP') ?? 'anonymous';
        const stub = env.${safeBinding}.get(
            env.${safeBinding}.idFromName(userId),
        );

        // RPC call — no network hop within the same CF datacenter
        const rows = await stub.${firstMethod}();
        return Response.json(rows);
    },
} satisfies ExportedHandler<Env>;`;

        return { doClassCode, wranglerSnippet, workerExampleCode };
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

// ── Module-level helpers ──────────────────────────────────────────────────────

function capitalize(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
}
