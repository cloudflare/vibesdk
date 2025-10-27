CREATE TABLE `deployments` (
	`id` text PRIMARY KEY NOT NULL,
	`app_id` text NOT NULL,
	`provider` text NOT NULL,
	`deployment_id` text,
	`build_id` text,
	`deployment_url` text,
	`preview_url` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`config` text,
	`is_production` integer DEFAULT false,
	`error_message` text,
	`logs` text,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP,
	`deployed_at` integer,
	FOREIGN KEY (`app_id`) REFERENCES `apps`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `deployments_app_idx` ON `deployments` (`app_id`);--> statement-breakpoint
CREATE INDEX `deployments_provider_idx` ON `deployments` (`provider`);--> statement-breakpoint
CREATE INDEX `deployments_status_idx` ON `deployments` (`status`);--> statement-breakpoint
CREATE INDEX `deployments_app_provider_idx` ON `deployments` (`app_id`,`provider`);--> statement-breakpoint
CREATE INDEX `deployments_created_at_idx` ON `deployments` (`created_at`);--> statement-breakpoint
CREATE TABLE `deployment_credentials` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`provider` text NOT NULL,
	`name` text NOT NULL,
	`encrypted_credentials` text NOT NULL,
	`credential_preview` text,
	`is_active` integer DEFAULT true,
	`is_default` integer DEFAULT false,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP,
	`last_used` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `deployment_credentials_user_idx` ON `deployment_credentials` (`user_id`);--> statement-breakpoint
CREATE INDEX `deployment_credentials_provider_idx` ON `deployment_credentials` (`provider`);--> statement-breakpoint
CREATE INDEX `deployment_credentials_user_provider_idx` ON `deployment_credentials` (`user_id`,`provider`);--> statement-breakpoint
CREATE INDEX `deployment_credentials_is_default_idx` ON `deployment_credentials` (`is_default`);