CREATE INDEX `app_views_app_viewed_at_idx` ON `app_views` (`app_id`,`viewed_at`);--> statement-breakpoint
CREATE INDEX `stars_app_starred_at_idx` ON `stars` (`app_id`,`starred_at`);