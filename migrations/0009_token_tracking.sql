-- Token tracking columns for effort-based pricing transparency (ADR-004 §S3).
--
-- Adds three optional columns to credit_transactions so every AI spend row
-- records the actual token counts consumed. This enables:
--   1. Per-session cost breakdown visible to users in the credits dashboard.
--   2. Future effort-based pricing ($/token) rather than flat credit tiers.
--   3. Audit + anomaly detection on runaway token spend per session.
--
-- All three columns are nullable / have defaults so existing rows are valid
-- and existing INSERT paths that do not supply them continue to work.

ALTER TABLE `credit_transactions` ADD `input_tokens` integer NOT NULL DEFAULT 0;
ALTER TABLE `credit_transactions` ADD `output_tokens` integer NOT NULL DEFAULT 0;
ALTER TABLE `credit_transactions` ADD `session_id` text;

-- Index on session_id to support the per-session cost query.
CREATE INDEX IF NOT EXISTS `credit_transactions_session_idx` ON `credit_transactions` (`session_id`);
