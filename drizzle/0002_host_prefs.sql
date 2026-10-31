CREATE TABLE `host_prefs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`host_sync_id` text NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_host_prefs_host_key` ON `host_prefs` (`host_sync_id`,`key`);