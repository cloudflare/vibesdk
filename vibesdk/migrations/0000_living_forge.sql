CREATE TABLE `api_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`key_hash` text NOT NULL,
	`key_preview` text NOT NULL,
	`scopes` text NOT NULL,
	`is_active` integer DEFAULT true,
	`last_used` integer,
	`request_count` integer DEFAULT 0,
	`expires_at` integer,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `api_keys_key_hash_unique` ON `api_keys` (`key_hash`);--> statement-breakpoint
CREATE INDEX `api_keys_user_id_idx` ON `api_keys` (`user_id`);--> statement-breakpoint
CREATE INDEX `api_keys_key_hash_idx` ON `api_keys` (`key_hash`);--> statement-breakpoint
CREATE INDEX `api_keys_is_active_idx` ON `api_keys` (`is_active`);--> statement-breakpoint
CREATE INDEX `api_keys_expires_at_idx` ON `api_keys` (`expires_at`);--> statement-breakpoint
CREATE TABLE `app_comments` (
	`id` text PRIMARY KEY NOT NULL,
	`app_id` text NOT NULL,
	`user_id` text NOT NULL,
	`content` text NOT NULL,
	`parent_comment_id` text,
	`is_edited` integer DEFAULT false,
	`is_deleted` integer DEFAULT false,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`app_id`) REFERENCES `apps`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `app_comments_app_idx` ON `app_comments` (`app_id`);--> statement-breakpoint
CREATE INDEX `app_comments_user_idx` ON `app_comments` (`user_id`);--> statement-breakpoint
CREATE INDEX `app_comments_parent_idx` ON `app_comments` (`parent_comment_id`);--> statement-breakpoint
CREATE TABLE `app_likes` (
	`id` text PRIMARY KEY NOT NULL,
	`app_id` text NOT NULL,
	`user_id` text NOT NULL,
	`reaction_type` text DEFAULT 'like' NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`app_id`) REFERENCES `apps`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `app_likes_app_user_idx` ON `app_likes` (`app_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `app_likes_user_idx` ON `app_likes` (`user_id`);--> statement-breakpoint
CREATE TABLE `app_views` (
	`id` text PRIMARY KEY NOT NULL,
	`app_id` text NOT NULL,
	`user_id` text,
	`session_token` text,
	`ip_address_hash` text,
	`referrer` text,
	`user_agent` text,
	`device_type` text,
	`viewed_at` integer DEFAULT CURRENT_TIMESTAMP,
	`duration_seconds` integer,
	FOREIGN KEY (`app_id`) REFERENCES `apps`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `app_views_app_idx` ON `app_views` (`app_id`);--> statement-breakpoint
CREATE INDEX `app_views_user_idx` ON `app_views` (`user_id`);--> statement-breakpoint
CREATE INDEX `app_views_viewed_at_idx` ON `app_views` (`viewed_at`);--> statement-breakpoint
CREATE TABLE `apps` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`icon_url` text,
	`original_prompt` text NOT NULL,
	`final_prompt` text,
	`blueprint` text,
	`framework` text,
	`user_id` text,
	`session_token` text,
	`visibility` text DEFAULT 'private' NOT NULL,
	`status` text DEFAULT 'generating' NOT NULL,
	`deployment_url` text,
	`github_repository_url` text,
	`github_repository_visibility` text,
	`is_archived` integer DEFAULT false,
	`is_featured` integer DEFAULT false,
	`version` integer DEFAULT 1,
	`parent_app_id` text,
	`screenshot_url` text,
	`screenshot_captured_at` integer,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP,
	`last_deployed_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `apps_user_idx` ON `apps` (`user_id`);--> statement-breakpoint
CREATE INDEX `apps_status_idx` ON `apps` (`status`);--> statement-breakpoint
CREATE INDEX `apps_visibility_idx` ON `apps` (`visibility`);--> statement-breakpoint
CREATE INDEX `apps_session_token_idx` ON `apps` (`session_token`);--> statement-breakpoint
CREATE INDEX `apps_parent_app_idx` ON `apps` (`parent_app_id`);--> statement-breakpoint
CREATE INDEX `apps_search_idx` ON `apps` (`title`,`description`);--> statement-breakpoint
CREATE INDEX `apps_framework_status_idx` ON `apps` (`framework`,`status`);--> statement-breakpoint
CREATE INDEX `apps_visibility_status_idx` ON `apps` (`visibility`,`status`);--> statement-breakpoint
CREATE INDEX `apps_created_at_idx` ON `apps` (`created_at`);--> statement-breakpoint
CREATE INDEX `apps_updated_at_idx` ON `apps` (`updated_at`);--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`action` text NOT NULL,
	`old_values` text,
	`new_values` text,
	`ip_address` text,
	`user_agent` text,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `audit_logs_user_idx` ON `audit_logs` (`user_id`);--> statement-breakpoint
CREATE INDEX `audit_logs_entity_idx` ON `audit_logs` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE INDEX `audit_logs_created_at_idx` ON `audit_logs` (`created_at`);--> statement-breakpoint
CREATE TABLE `auth_attempts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`identifier` text NOT NULL,
	`attempt_type` text NOT NULL,
	`success` integer NOT NULL,
	`ip_address` text NOT NULL,
	`user_agent` text,
	`attempted_at` integer DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX `auth_attempts_lookup_idx` ON `auth_attempts` (`identifier`,`attempted_at`);--> statement-breakpoint
CREATE INDEX `auth_attempts_ip_idx` ON `auth_attempts` (`ip_address`,`attempted_at`);--> statement-breakpoint
CREATE INDEX `auth_attempts_success_idx` ON `auth_attempts` (`success`,`attempted_at`);--> statement-breakpoint
CREATE INDEX `auth_attempts_type_idx` ON `auth_attempts` (`attempt_type`,`attempted_at`);--> statement-breakpoint
CREATE TABLE `comment_likes` (
	`id` text PRIMARY KEY NOT NULL,
	`comment_id` text NOT NULL,
	`user_id` text NOT NULL,
	`reaction_type` text DEFAULT 'like' NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`comment_id`) REFERENCES `app_comments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `comment_likes_comment_user_idx` ON `comment_likes` (`comment_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `comment_likes_user_idx` ON `comment_likes` (`user_id`);--> statement-breakpoint
CREATE INDEX `comment_likes_comment_idx` ON `comment_likes` (`comment_id`);--> statement-breakpoint
CREATE TABLE `email_verification_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`email` text NOT NULL,
	`expires_at` integer NOT NULL,
	`used` integer DEFAULT false,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `email_verification_tokens_token_hash_unique` ON `email_verification_tokens` (`token_hash`);--> statement-breakpoint
CREATE INDEX `email_verification_tokens_lookup_idx` ON `email_verification_tokens` (`token_hash`);--> statement-breakpoint
CREATE INDEX `email_verification_tokens_expiry_idx` ON `email_verification_tokens` (`expires_at`);--> statement-breakpoint
CREATE TABLE `favorites` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`app_id` text NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`app_id`) REFERENCES `apps`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `favorites_user_app_idx` ON `favorites` (`user_id`,`app_id`);--> statement-breakpoint
CREATE INDEX `favorites_user_idx` ON `favorites` (`user_id`);--> statement-breakpoint
CREATE INDEX `favorites_app_idx` ON `favorites` (`app_id`);--> statement-breakpoint
CREATE TABLE `oauth_states` (
	`id` text PRIMARY KEY NOT NULL,
	`state` text NOT NULL,
	`provider` text NOT NULL,
	`redirect_uri` text,
	`scopes` text DEFAULT '[]',
	`user_id` text,
	`code_verifier` text,
	`nonce` text,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP,
	`expires_at` integer NOT NULL,
	`is_used` integer DEFAULT false,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `oauth_states_state_unique` ON `oauth_states` (`state`);--> statement-breakpoint
CREATE UNIQUE INDEX `oauth_states_state_idx` ON `oauth_states` (`state`);--> statement-breakpoint
CREATE INDEX `oauth_states_expires_at_idx` ON `oauth_states` (`expires_at`);--> statement-breakpoint
CREATE TABLE `password_reset_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`used` integer DEFAULT false,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `password_reset_tokens_token_hash_unique` ON `password_reset_tokens` (`token_hash`);--> statement-breakpoint
CREATE INDEX `password_reset_tokens_lookup_idx` ON `password_reset_tokens` (`token_hash`);--> statement-breakpoint
CREATE INDEX `password_reset_tokens_expiry_idx` ON `password_reset_tokens` (`expires_at`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`device_info` text,
	`user_agent` text,
	`ip_address` text,
	`is_revoked` integer DEFAULT false,
	`revoked_at` integer,
	`revoked_reason` text,
	`access_token_hash` text NOT NULL,
	`refresh_token_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP,
	`last_activity` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sessions_user_id_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `sessions_expires_at_idx` ON `sessions` (`expires_at`);--> statement-breakpoint
CREATE INDEX `sessions_access_token_hash_idx` ON `sessions` (`access_token_hash`);--> statement-breakpoint
CREATE INDEX `sessions_refresh_token_hash_idx` ON `sessions` (`refresh_token_hash`);--> statement-breakpoint
CREATE INDEX `sessions_last_activity_idx` ON `sessions` (`last_activity`);--> statement-breakpoint
CREATE INDEX `sessions_is_revoked_idx` ON `sessions` (`is_revoked`);--> statement-breakpoint
CREATE TABLE `stars` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`app_id` text NOT NULL,
	`starred_at` integer DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`app_id`) REFERENCES `apps`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stars_user_app_idx` ON `stars` (`user_id`,`app_id`);--> statement-breakpoint
CREATE INDEX `stars_user_idx` ON `stars` (`user_id`);--> statement-breakpoint
CREATE INDEX `stars_app_idx` ON `stars` (`app_id`);--> statement-breakpoint
CREATE TABLE `system_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`value` text,
	`description` text,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP,
	`updated_by` text,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `system_settings_key_unique` ON `system_settings` (`key`);--> statement-breakpoint
CREATE UNIQUE INDEX `system_settings_key_idx` ON `system_settings` (`key`);--> statement-breakpoint
CREATE TABLE `user_model_configs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`agent_action_name` text NOT NULL,
	`model_name` text,
	`max_tokens` integer,
	`temperature` real,
	`reasoning_effort` text,
	`provider_override` text,
	`fallback_model` text,
	`is_active` integer DEFAULT true,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_model_configs_user_agent_idx` ON `user_model_configs` (`user_id`,`agent_action_name`);--> statement-breakpoint
CREATE INDEX `user_model_configs_user_idx` ON `user_model_configs` (`user_id`);--> statement-breakpoint
CREATE INDEX `user_model_configs_is_active_idx` ON `user_model_configs` (`is_active`);--> statement-breakpoint
CREATE TABLE `user_model_providers` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`base_url` text NOT NULL,
	`secret_id` text,
	`is_active` integer DEFAULT true,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`secret_id`) REFERENCES `user_secrets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_model_providers_user_name_idx` ON `user_model_providers` (`user_id`,`name`);--> statement-breakpoint
CREATE INDEX `user_model_providers_user_idx` ON `user_model_providers` (`user_id`);--> statement-breakpoint
CREATE INDEX `user_model_providers_is_active_idx` ON `user_model_providers` (`is_active`);--> statement-breakpoint
CREATE TABLE `user_secrets` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`provider` text NOT NULL,
	`secret_type` text NOT NULL,
	`encrypted_value` text NOT NULL,
	`key_preview` text NOT NULL,
	`description` text,
	`expires_at` integer,
	`last_used` integer,
	`usage_count` integer DEFAULT 0,
	`is_active` integer DEFAULT true,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `user_secrets_user_idx` ON `user_secrets` (`user_id`);--> statement-breakpoint
CREATE INDEX `user_secrets_provider_idx` ON `user_secrets` (`provider`);--> statement-breakpoint
CREATE INDEX `user_secrets_user_provider_idx` ON `user_secrets` (`user_id`,`provider`,`secret_type`);--> statement-breakpoint
CREATE INDEX `user_secrets_active_idx` ON `user_secrets` (`is_active`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`username` text,
	`display_name` text NOT NULL,
	`avatar_url` text,
	`bio` text,
	`provider` text NOT NULL,
	`provider_id` text NOT NULL,
	`email_verified` integer DEFAULT false,
	`password_hash` text,
	`failed_login_attempts` integer DEFAULT 0,
	`locked_until` integer,
	`password_changed_at` integer,
	`preferences` text DEFAULT '{}',
	`theme` text DEFAULT 'system',
	`timezone` text DEFAULT 'UTC',
	`is_active` integer DEFAULT true,
	`is_suspended` integer DEFAULT false,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP,
	`last_active_at` integer,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);--> statement-breakpoint
CREATE INDEX `users_email_idx` ON `users` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_provider_unique_idx` ON `users` (`provider`,`provider_id`);--> statement-breakpoint
CREATE INDEX `users_username_idx` ON `users` (`username`);--> statement-breakpoint
CREATE INDEX `users_failed_login_attempts_idx` ON `users` (`failed_login_attempts`);--> statement-breakpoint
CREATE INDEX `users_locked_until_idx` ON `users` (`locked_until`);--> statement-breakpoint
CREATE INDEX `users_is_active_idx` ON `users` (`is_active`);--> statement-breakpoint
CREATE INDEX `users_last_active_at_idx` ON `users` (`last_active_at`);--> statement-breakpoint
CREATE TABLE `verification_otps` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`otp` text NOT NULL,
	`expires_at` integer NOT NULL,
	`used` integer DEFAULT false,
	`used_at` integer,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX `verification_otps_email_idx` ON `verification_otps` (`email`);--> statement-breakpoint
CREATE INDEX `verification_otps_expires_at_idx` ON `verification_otps` (`expires_at`);--> statement-breakpoint
CREATE INDEX `verification_otps_used_idx` ON `verification_otps` (`used`);