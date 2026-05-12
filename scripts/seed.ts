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
 * Uses PBKDF2-SHA256 hashed passwords (only `TestPassword123!`) so you can
 * log in via the normal email/password flow. Hash format matches
 * worker/utils/passwordService.ts exactly: base64(salt[16] || pbkdf2[32]).
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
import { pbkdf2Sync, randomBytes } from 'crypto';
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

// Hash format must match worker/utils/passwordService.ts exactly.
// Production PasswordService.hash():
//   1. salt = 16 random bytes (crypto.getRandomValues)
//   2. hash = PBKDF2-SHA256(password, salt, iterations=100_000, keyLen=32)
//   3. stored = btoa(salt || hash)  — base64 of 48-byte concat (16 salt + 32 hash)
// Verifier reads back: atob → first 16 bytes = salt, rest = expected hash.
//
// Approach: re-implement w/ Node's crypto.pbkdf2Sync. PBKDF2-SHA256 is a
// deterministic RFC-8018 KDF — Node's output is byte-identical to Web Crypto
// API output for same inputs. Importing PasswordService directly would require
// miniflare runtime (PasswordService uses Worker-global crypto.subtle), which
// is much heavier than this 4-line re-implementation.
const HASH_SALT_LENGTH = 16;
const HASH_ITERATIONS = 100_000;
const HASH_KEY_LENGTH = 32;

function hashPassword(pw: string): string {
    const salt = randomBytes(HASH_SALT_LENGTH);
    const hash = pbkdf2Sync(pw, salt, HASH_ITERATIONS, HASH_KEY_LENGTH, 'sha256');
    const combined = Buffer.concat([salt, hash]);
    return combined.toString('base64');
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
 * Hash function above mirrors worker/utils/passwordService.ts:
 *   - Algorithm: PBKDF2-SHA256
 *   - Salt: 16 random bytes per password (stored as prefix of blob)
 *   - Iterations: 100_000 (OWASP recommended minimum)
 *   - Key length: 32 bytes (256 bits)
 *   - Storage encoding: base64(salt || hash) — 48 raw bytes → 64-char b64
 *
 * The Worker verifier (PasswordService.verify) decodes the same blob, splits
 * off the first 16 bytes as salt, then PBKDF2-hashes the input password with
 * that salt and timing-safe-compares. Because PBKDF2-SHA256 is deterministic
 * and standardised (RFC 8018), Node's crypto.pbkdf2Sync produces byte-
 * identical output to Web Crypto API's PBKDF2 for the same inputs — so the
 * seeded hash is accepted by the production verifier unchanged.
 *
 * If you ever change the iteration count, salt length, or KDF in
 * worker/utils/passwordService.ts, mirror the change here AND in the
 * HASH_* constants at the top of this file.
 */
