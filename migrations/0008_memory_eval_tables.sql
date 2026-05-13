-- Memory + Eval tables — ADR-004 (CF-native primitives + DeepEval port).
--
-- Adds:
--   1. memory_blocks   — local cache + offline mirror of CF Agent Memory.
--      Lets us recall on a CF Agent Memory outage and gives ops a way to
--      audit what was remembered without hitting the managed API.
--   2. eval_results    — phase-level quality verdicts from EvalGate.
--      Powers the future /sessions/:id/quality endpoint + telemetry dashboards.
--
-- Both tables degrade gracefully — generation flows do NOT block on writes
-- here (EvalGate writes are best-effort, MemoryClient sits behind a stub
-- when the binding is missing). See worker/services/memory/AgentMemoryClient.ts
-- and worker/agents/operations/EvalGate.ts for the consumer surface.

-- ── memory_blocks ──────────────────────────────────────────────────────
-- Local mirror of CF Agent Memory blocks. `tag` is the same logical bucket
-- the agent recalls by (e.g. 'style:react', 'project:<id>', 'pref:test-fw').
-- `content` capped at 8 KiB inline; longer payloads should be stored in R2
-- and referenced via metadata.
CREATE TABLE IF NOT EXISTS `memory_blocks` (
    `id` text PRIMARY KEY NOT NULL,            -- stable id from CF Agent Memory when available, else local nanoid
    `user_id` text NOT NULL,
    `tag` text NOT NULL,
    `content` text NOT NULL,
    `metadata_json` text NOT NULL DEFAULT '{}',
    `source` text NOT NULL DEFAULT 'cf-agent-memory',  -- 'cf-agent-memory' | 'local-stub' | 'mem0'
    `created_at` integer DEFAULT (CURRENT_TIMESTAMP),
    `updated_at` integer DEFAULT (CURRENT_TIMESTAMP),
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS `memory_blocks_user_idx` ON `memory_blocks` (`user_id`);
CREATE INDEX IF NOT EXISTS `memory_blocks_user_tag_idx` ON `memory_blocks` (`user_id`, `tag`);

-- ── eval_results ───────────────────────────────────────────────────────
-- One row per phase per EvalGate run. Stores the 4 DeepEval-equivalent
-- metric scores + the gate's pass/fail verdict + judge cost telemetry.
--
-- A phase can be re-evaluated (e.g. after Critic retry), so the natural
-- key is (session_id, phase_name, attempt). `attempt` increments on retry.
CREATE TABLE IF NOT EXISTS `eval_results` (
    `id` text PRIMARY KEY NOT NULL,
    `session_id` text NOT NULL,
    `phase_name` text NOT NULL,
    `attempt` integer NOT NULL DEFAULT 1,
    `faithfulness` real NOT NULL,              -- 0..1
    `answer_relevancy` real NOT NULL,          -- 0..1
    `tool_correctness` real NOT NULL,          -- 0..1
    `hallucination_risk` real NOT NULL,        -- 0..1
    `passed` integer NOT NULL,                 -- 0 | 1
    `blocked_reason` text,                     -- null when passed
    `comments` text NOT NULL DEFAULT '',       -- judge comments, ≤240 chars
    `judge_input_tokens` integer NOT NULL DEFAULT 0,
    `judge_output_tokens` integer NOT NULL DEFAULT 0,
    `created_at` integer DEFAULT (CURRENT_TIMESTAMP)
);

CREATE INDEX IF NOT EXISTS `eval_results_session_idx` ON `eval_results` (`session_id`);
CREATE INDEX IF NOT EXISTS `eval_results_session_phase_idx` ON `eval_results` (`session_id`, `phase_name`);
CREATE INDEX IF NOT EXISTS `eval_results_passed_idx` ON `eval_results` (`passed`);
