CREATE TABLE `metric_samples` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`host_sync_id` text NOT NULL,
	`ts` integer NOT NULL,
	`cpu` real,
	`mem` real,
	`disk` real,
	`rx` real,
	`tx` real
);
--> statement-breakpoint
CREATE INDEX `idx_metric_samples_host_ts` ON `metric_samples` (`host_sync_id`,`ts`);