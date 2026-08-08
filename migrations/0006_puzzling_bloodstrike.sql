ALTER TABLE `app_views` ADD `viewer_hash` text;--> statement-breakpoint
-- Backfill existing rows with their unique id so historical view counts are
-- preserved under COUNT(DISTINCT viewer_hash) and the unique index below is
-- satisfied. Going-forward dedup uses a per-viewer/per-bucket hash on insert.
UPDATE `app_views` SET `viewer_hash` = `id` WHERE `viewer_hash` IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `app_views_app_viewer_idx` ON `app_views` (`app_id`,`viewer_hash`);