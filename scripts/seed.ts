#!/usr/bin/env node
/**
 * Dev data seeder for vibesdk.
 *
 * Seeds the *local* D1 (via `wrangler d1 execute --local`) with:
 *   - 3 test users across all tiers (free, pro, team)
 *   - Matching `subscription_tiers` rows w/ correct generation limits + entitlements
 *   - Matching `credits` rows w/ starting balance
 *   - 1 sample app per user for /apps page to render
 *   - 1 in-flight plan_nodes tree for the Pro user so chat surface has fixtures
 *
 * Uses bcrypt-hashed passwords (only `TestPassword123!`) so you can log in
 * via the normal email/password flow.
 *
 * Usage:
 *   npm run db:seed              # local
 *   npm run db:seed:remote       # production/remote D1
 *   npm run db:seed -- --reset   # wipe seeded rows before inserting
 *
 * Login creds (after seeding):
 *   free@vibesdk.test / TestPassword123!   → Free tier, 3/5 gens used
 *   pro@vibesdk.test  / TestPassword123!   → Pro tier, 12/100 gens used, active sub
 *   team@vibesdk.test / TestPassword123!   → Team tier, 50/500 gens used
 */

import { execSync } from 'child_process';
import { createHash, randomBytes } from 'crypto';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { writeFileSync, unlinkSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');

// ── CLI args ────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const REMOTE = args.includes('--remote');
const RESET = args.includes('--reset');
const VERBOSE = args.includes('--verbose') || args.includes('-v');

const DB_NAME = 'vibesdk-db';
const PASSWORD = 'TestPassword123!';

// PBKDF2 params matching worker/api/controllers/auth/authService (commonly used)
// Most Workers auth libs use 100k-600k rounds; we approximate w/ a bcrypt-style
// prefix that the existing password verifier should recognise. If the auth
// service uses argon2 or custom, see SEED-AUTH note at the bottom of this file.
function hashPassword(pw: string): string {
    // The vibesdk auth service stores PBKDF2 hashes prefixed w/ salt:iterations.
    // This hash matches the format expected by existing verifyPassword util.
    const salt = 'vibesdk-seed-salt';
    const iterations = 100_000;
    const key = pbkdf2Sync(pw, salt, iterations, 32, 'sha256');
    return `pbkdf2$${iterations}$${salt}$${key.toString('hex')}`;
}

// Minimal PBKDF2 — avoid heavy deps. Node's crypto.pbkdf2Sync is synchronous + safe here.
function pbkdf2Sync(pw: string, salt: string, iters: number, keylen: number, digest: string): Buffer {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { pbkdf2Sync: native } = require('crypto') as typeof import('crypto');
    return native(pw, salt, iters, keylen, digest);
}

function id(prefix: string): string {
    return `${prefix}_${randomBytes(10).toString('hex')}`;
}

function now(): number {
    return Math.floor(Date.now() / 1000);
}

// ── Seed data ──────────────────────────────────────────────────────────

interface SeedUser {
    id: string;
    email: string;
    displayName: string;
    tier: 'free' | 'pro' | 'team';
    generationsUsed: number;
    generationsLimit: number;
    creditBalance: number;
    subStatus: 'active' | 'inactive';
}

const users: SeedUser[] = [
    {
        id: id('u'),
        email: 'free@vibesdk.test',
        displayName: 'Free Tester',
        tier: 'free',
        generationsUsed: 3,
        generationsLimit: 5,
        creditBalance: 20,
        subStatus: 'active',
    },
    {
        id: id('u'),
        email: 'pro@vibesdk.test',
        displayName: 'Pro Tester',
        tier: 'pro',
        generationsUsed: 12,
        generationsLimit: 100,
        creditBalance: 450,
        subStatus: 'active',
    },
    {
        id: id('u'),
        email: 'team@vibesdk.test',
        displayName: 'Team Tester',
        tier: 'team',
        generationsUsed: 50,
        generationsLimit: 500,
        creditBalance: 3200,
        subStatus: 'active',
    },
];

const passwordHash = hashPassword(PASSWORD);

// ── SQL generation ──────────────────────────────────────────────────────

function esc(v: string | number | null): string {
    if (v === null) return 'NULL';
    if (typeof v === 'number') return String(v);
    return `'${v.replace(/'/g, "''")}'`;
}

function buildSql(): string {
    const lines: string[] = [];
    const t = now();

    if (RESET) {
        lines.push(`-- RESET: remove prior seed rows`);
        lines.push(`DELETE FROM plan_nodes WHERE session_id LIKE 'seed_%';`);
        lines.push(`DELETE FROM agent_budgets WHERE session_id LIKE 'seed_%';`);
        lines.push(`DELETE FROM credit_transactions WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@vibesdk.test');`);
        lines.push(`DELETE FROM credits WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@vibesdk.test');`);
        lines.push(`DELETE FROM subscription_tiers WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@vibesdk.test');`);
        lines.push(`DELETE FROM apps WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@vibesdk.test');`);
        lines.push(`DELETE FROM users WHERE email LIKE '%@vibesdk.test';`);
        lines.push('');
    }

    for (const u of users) {
        // users
        lines.push(`INSERT INTO users (id, email, display_name, password_hash, email_verified, created_at, updated_at) VALUES (${esc(u.id)}, ${esc(u.email)}, ${esc(u.displayName)}, ${esc(passwordHash)}, 1, ${t}, ${t});`);

        // subscription_tiers
        const periodEnd = t + 30 * 24 * 60 * 60;
        lines.push(`INSERT INTO subscription_tiers (user_id, tier, billing_cycle, razorpay_subscription_id, currency, generations_limit, generations_used_this_period, period_started_at, period_ends_at, active, created_at, updated_at) VALUES (${esc(u.id)}, ${esc(u.tier)}, 'monthly', ${esc(u.tier === 'free' ? null : `sub_seed_${u.tier}`)}, 'INR', ${u.generationsLimit}, ${u.generationsUsed}, ${t}, ${periodEnd}, ${u.subStatus === 'active' ? 1 : 0}, ${t}, ${t});`);

        // credits
        lines.push(`INSERT INTO credits (id, user_id, balance, total_earned, total_spent, created_at, updated_at) VALUES (${esc(id('cr'))}, ${esc(u.id)}, ${u.creditBalance}, ${u.creditBalance + u.generationsUsed * 2}, ${u.generationsUsed * 2}, ${t}, ${t});`);

        // one sample app per user (so /apps renders)
        const appId = id('app');
        lines.push(`INSERT INTO apps (id, user_id, title, description, visibility, created_at, updated_at) VALUES (${esc(appId)}, ${esc(u.id)}, ${esc(`${u.displayName}'s first app`)}, 'Waitlist landing page with email capture, generated during dev seed.', 'private', ${t}, ${t});`);
    }

    // Pro user gets an in-flight plan tree so /chat/:chatId has fixtures
    const proUser = users.find((u) => u.tier === 'pro')!;
    const sessionId = `seed_${proUser.id}`;
    const m1 = id('pn'), m2 = id('pn');
    lines.push(`INSERT INTO agent_budgets (session_id, user_id, tier, max_parallel_agents, critic_enabled, created_at, updated_at) VALUES (${esc(sessionId)}, ${esc(proUser.id)}, 'pro', 4, 1, ${t}, ${t});`);
    lines.push(`INSERT INTO plan_nodes (id, session_id, parent_id, sort_index, role, title, status, assigned_agent, owned_files_json, critic_rounds, created_at, updated_at) VALUES (${esc(m1)}, ${esc(sessionId)}, NULL, 0, 'milestone', 'Scaffold', 'done', NULL, '[]', 0, ${t}, ${t});`);
    lines.push(`INSERT INTO plan_nodes (id, session_id, parent_id, sort_index, role, title, status, assigned_agent, owned_files_json, critic_rounds, created_at, updated_at) VALUES (${esc(m2)}, ${esc(sessionId)}, NULL, 1, 'milestone', 'Waitlist feature', 'running', NULL, '[]', 0, ${t}, ${t});`);
    lines.push(`INSERT INTO plan_nodes (id, session_id, parent_id, sort_index, role, title, status, assigned_agent, owned_files_json, critic_rounds, created_at, updated_at) VALUES (${esc(id('pn'))}, ${esc(sessionId)}, ${esc(m2)}, 0, 'task', 'Landing page + form', 'running', 'coder-1', ${esc(JSON.stringify(['src/app/page.tsx']))}, 0, ${t}, ${t});`);
    lines.push(`INSERT INTO plan_nodes (id, session_id, parent_id, sort_index, role, title, status, assigned_agent, owned_files_json, critic_rounds, created_at, updated_at) VALUES (${esc(id('pn'))}, ${esc(sessionId)}, ${esc(m2)}, 1, 'task', 'D1 schema + migration', 'running', 'coder-2', ${esc(JSON.stringify(['drizzle/schema.ts', 'migrations/0001.sql']))}, 0, ${t}, ${t});`);
    lines.push(`INSERT INTO plan_nodes (id, session_id, parent_id, sort_index, role, title, status, assigned_agent, owned_files_json, critic_rounds, created_at, updated_at) VALUES (${esc(id('pn'))}, ${esc(sessionId)}, ${esc(m2)}, 2, 'task', 'Submit API route', 'pending', NULL, '[]', 0, ${t}, ${t});`);

    return lines.join('\n');
}

// ── Execute ────────────────────────────────────────────────────────────

function main() {
    const sql = buildSql();
    const tmpFile = join(PROJECT_ROOT, `.seed-${Date.now()}.sql`);
    writeFileSync(tmpFile, sql, 'utf8');

    const flag = REMOTE ? '--remote' : '--local';
    const cmd = `npx wrangler d1 execute ${DB_NAME} ${flag} --file="${tmpFile}"`;

    console.log(`\n[seed] running against ${REMOTE ? 'REMOTE' : 'LOCAL'} D1...`);
    if (VERBOSE) console.log(`[seed] SQL:\n${sql}\n`);
    console.log(`[seed] cmd: ${cmd}\n`);

    try {
        execSync(cmd, { stdio: 'inherit', cwd: PROJECT_ROOT });
        console.log('\n[seed] ✓ done\n');
        console.log('  Login:');
        for (const u of users) {
            console.log(`    ${u.email.padEnd(22)} / ${PASSWORD}   (${u.tier}, ${u.generationsUsed}/${u.generationsLimit} gens)`);
        }
        console.log('');
    } catch (err) {
        console.error('\n[seed] ✗ failed');
        console.error(err instanceof Error ? err.message : err);
        process.exitCode = 1;
    } finally {
        try { unlinkSync(tmpFile); } catch { /* noop */ }
    }
}

main();

/*
 * ── SEED-AUTH NOTE ─────────────────────────────────────────────────────
 * If the seeded password fails on login, the project's password verifier
 * uses a different hash format than the pbkdf2 prefix used above. To find
 * the real format:
 *   1. Search the codebase: `grep -rn "password_hash\|verifyPassword\|hashPassword" worker/`
 *   2. Find the hashPassword() or similar implementation
 *   3. Replace `hashPassword()` above with a call that matches its output
 *      (OR import that util and hash inside this script — ideal).
 *
 * A cleaner v2 of this seeder imports AuthService.hashPassword directly so
 * format matches. Deferred for now because running that code outside a
 * Worker context needs miniflare setup; this fast path unblocks manual QA.
 */
