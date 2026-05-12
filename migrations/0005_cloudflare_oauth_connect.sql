CREATE TABLE `ai_gateways` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`cloudflare_account_id` text NOT NULL,
	`gateway_id` text NOT NULL,
	`gateway_name` text NOT NULL,
	`gateway_slug` text NOT NULL,
	`credits_remaining` real DEFAULT 0,
	`credits_last_updated` integer,
	`auto_created` integer DEFAULT false,
	`is_active` integer DEFAULT false,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`cloudflare_account_id`) REFERENCES `cloudflare_accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ai_gateways_user_idx` ON `ai_gateways` (`user_id`);--> statement-breakpoint
CREATE INDEX `ai_gateways_account_idx` ON `ai_gateways` (`cloudflare_account_id`);--> statement-breakpoint
CREATE INDEX `ai_gateways_user_account_idx` ON `ai_gateways` (`user_id`,`cloudflare_account_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `ai_gateways_gateway_id_idx` ON `ai_gateways` (`cloudflare_account_id`,`gateway_id`);--> statement-breakpoint
CREATE TABLE `cloudflare_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`account_id` text NOT NULL,
	`account_name` text NOT NULL,
	`account_email` text,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP,
	`last_synced_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `cloudflare_accounts_user_idx` ON `cloudflare_accounts` (`user_id`);--> statement-breakpoint
CREATE INDEX `cloudflare_accounts_account_id_idx` ON `cloudflare_accounts` (`account_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `cloudflare_accounts_user_account_idx` ON `cloudflare_accounts` (`user_id`,`account_id`);