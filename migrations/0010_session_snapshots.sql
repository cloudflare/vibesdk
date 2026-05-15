-- ADR-010 Option A: Degraded-mode UX — session snapshots.
--
-- Written once per session on REVIEWING → IDLE transition in
-- PhasicCodingBehavior.executeReviewCycle(). Stores lightweight
-- project metadata so the frontend DegradedModeBanner can surface
-- last-known-good state during CF platform incidents.
--
-- session_id has a UNIQUE index — upsert overwrites on re-completion.

CREATE TABLE IF NOT EXISTS `session_snapshots` (
    `id` text PRIMARY KEY NOT NULL,
    `session_id` text NOT NULL,
    `project_name` text NOT NULL DEFAULT '',
    `files_count` integer NOT NULL DEFAULT 0,
    `template_name` text NOT NULL DEFAULT '',
    `snapshot_json` text NOT NULL DEFAULT '{}',
    `created_at` integer DEFAULT (CURRENT_TIMESTAMP)
);

CREATE UNIQUE INDEX IF NOT EXISTS `session_snapshots_session_idx` ON `session_snapshots` (`session_id`);
CREATE INDEX IF NOT EXISTS `session_snapshots_created_at_idx` ON `session_snapshots` (`created_at`);
