-- Multi-agent plan + tiered entitlements
-- Adds plan tree (Manus-style hierarchy), per-session agent budget tracking,
-- and subscription tier metadata. Extends the existing credit_system (0006).

-- ── plan_nodes ─────────────────────────────────────────────────────────
-- One row per milestone/task/subtask. `parent_id = NULL` => root milestone.
-- `assigned_agent` = 'teamlead' | 'planner' | 'coder-1' | 'coder-2' |
--                   'coder-3' | 'coder-4' | 'tester' | 'critic'
-- `owned_files_json` = JSON array of glob strings; Planner partitions file set
--   so sibling tasks never overlap (see ADR-001).
CREATE TABLE IF NOT EXISTS `plan_nodes` (
    `id` text PRIMARY KEY NOT NULL,
    `session_id` text NOT NULL,
    `parent_id` text,
    `sort_index` integer NOT NULL DEFAULT 0,
    `role` text NOT NULL,                      -- 'milestone' | 'task' | 'subtask'
    `title` text NOT NULL,
    `description` text,
    `status` text NOT NULL DEFAULT 'pending',  -- 'pending' | 'running' | 'done' | 'failed' | 'skipped'
    `assigned_agent` text,
    `owned_files_json` text NOT NULL DEFAULT '[]',
    `critic_rounds` integer NOT NULL DEFAULT 0,
    `critic_verdict` text,
    `tokens_spent` integer NOT NULL DEFAULT 0,
    `started_at` integer,
    `completed_at` integer,
    `created_at` integer DEFAULT (CURRENT_TIMESTAMP),
    `updated_at` integer DEFAULT (CURRENT_TIMESTAMP),
    FOREIGN KEY (`parent_id`) REFERENCES `plan_nodes`(`id`) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS `plan_nodes_session_idx` ON `plan_nodes` (`session_id`);
CREATE INDEX IF NOT EXISTS `plan_nodes_parent_idx` ON `plan_nodes` (`parent_id`);
CREATE INDEX IF NOT EXISTS `plan_nodes_session_status_idx` ON `plan_nodes` (`session_id`, `status`);
CREATE INDEX IF NOT EXISTS `plan_nodes_session_sort_idx` ON `plan_nodes` (`session_id`, `sort_index`);

-- ── agent_budgets ──────────────────────────────────────────────────────
-- Per-session token accounting by model tier. Enforced at TeamLead before
-- any sub-agent spawn. Feeds entitlement gate + cost telemetry.
CREATE TABLE IF NOT EXISTS `agent_budgets` (
    `session_id` text PRIMARY KEY NOT NULL,
    `user_id` text NOT NULL,
    `tier` text NOT NULL,                      -- 'free' | 'pro' | 'team' | 'enterprise'
    `opus_tokens_used` integer NOT NULL DEFAULT 0,
    `sonnet_high_tokens_used` integer NOT NULL DEFAULT 0,
    `sonnet_med_tokens_used` integer NOT NULL DEFAULT 0,
    `sonnet_low_tokens_used` integer NOT NULL DEFAULT 0,
    `haiku_tokens_used` integer NOT NULL DEFAULT 0,
    `max_parallel_agents` integer NOT NULL DEFAULT 1,
    `critic_enabled` integer NOT NULL DEFAULT 0,
    `created_at` integer DEFAULT (CURRENT_TIMESTAMP),
    `updated_at` integer DEFAULT (CURRENT_TIMESTAMP),
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS `agent_budgets_user_idx` ON `agent_budgets` (`user_id`);
CREATE INDEX IF NOT EXISTS `agent_budgets_tier_idx` ON `agent_budgets` (`tier`);

-- ── subscription_tiers ─────────────────────────────────────────────────
-- One row per user. Updated by Stripe webhook handler (idempotent on
-- stripe_event_id). Queried by entitlements service on every session start.
CREATE TABLE IF NOT EXISTS `subscription_tiers` (
    `user_id` text PRIMARY KEY NOT NULL,
    `tier` text NOT NULL DEFAULT 'free',       -- 'free' | 'pro' | 'team' | 'enterprise'
    `billing_cycle` text NOT NULL DEFAULT 'monthly', -- 'monthly' | 'annual'
    `stripe_customer_id` text,
    `stripe_subscription_id` text,
    `stripe_last_event_id` text,
    `seats` integer NOT NULL DEFAULT 1,
    `generations_limit` integer NOT NULL DEFAULT 5,
    `generations_used_this_period` integer NOT NULL DEFAULT 0,
    `period_started_at` integer NOT NULL DEFAULT (CURRENT_TIMESTAMP),
    `period_ends_at` integer,
    `active` integer NOT NULL DEFAULT 1,
    `created_at` integer DEFAULT (CURRENT_TIMESTAMP),
    `updated_at` integer DEFAULT (CURRENT_TIMESTAMP),
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS `subscription_tiers_stripe_cust_idx` ON `subscription_tiers` (`stripe_customer_id`);
CREATE INDEX IF NOT EXISTS `subscription_tiers_stripe_sub_idx` ON `subscription_tiers` (`stripe_subscription_id`);
CREATE INDEX IF NOT EXISTS `subscription_tiers_tier_idx` ON `subscription_tiers` (`tier`);

-- Stripe webhook idempotency: record every processed event to prevent replay.
CREATE TABLE IF NOT EXISTS `stripe_events` (
    `event_id` text PRIMARY KEY NOT NULL,
    `event_type` text NOT NULL,
    `processed_at` integer DEFAULT (CURRENT_TIMESTAMP)
);
