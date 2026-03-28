-- Credit System Tables
CREATE TABLE IF NOT EXISTS `credits` (
    `id` text PRIMARY KEY NOT NULL,
    `user_id` text NOT NULL UNIQUE,
    `balance` integer NOT NULL DEFAULT 50,
    `total_earned` integer NOT NULL DEFAULT 50,
    `total_spent` integer NOT NULL DEFAULT 0,
    `created_at` integer DEFAULT (CURRENT_TIMESTAMP),
    `updated_at` integer DEFAULT (CURRENT_TIMESTAMP),
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS `credits_user_idx` ON `credits` (`user_id`);

CREATE TABLE IF NOT EXISTS `credit_transactions` (
    `id` text PRIMARY KEY NOT NULL,
    `user_id` text NOT NULL,
    `amount` integer NOT NULL,
    `type` text NOT NULL,
    `description` text NOT NULL,
    `model` text,
    `provider` text,
    `app_id` text,
    `balance_after` integer NOT NULL,
    `created_at` integer DEFAULT (CURRENT_TIMESTAMP),
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS `credit_transactions_user_idx` ON `credit_transactions` (`user_id`);
CREATE INDEX IF NOT EXISTS `credit_transactions_type_idx` ON `credit_transactions` (`type`);
CREATE INDEX IF NOT EXISTS `credit_transactions_created_at_idx` ON `credit_transactions` (`created_at`);
CREATE INDEX IF NOT EXISTS `credit_transactions_user_created_at_idx` ON `credit_transactions` (`user_id`, `created_at`);
