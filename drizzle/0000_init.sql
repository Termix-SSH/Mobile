CREATE TABLE `host_defaults_admin` (
	`id` integer PRIMARY KEY NOT NULL,
	`values` text DEFAULT '{}' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `command_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`host_sync_id` text NOT NULL,
	`command` text NOT NULL,
	`used_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_command_history_host_command` ON `command_history` (`host_sync_id`,`command`);--> statement-breakpoint
CREATE TABLE `ssh_credentials` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`sync_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`folder` text,
	`tags` text,
	`pin` integer DEFAULT false NOT NULL,
	`sort_order` integer,
	`auth_type` text NOT NULL,
	`username` text,
	`password` text,
	`key` text,
	`private_key` text,
	`public_key` text,
	`key_password` text,
	`key_type` text,
	`detected_key_type` text,
	`cert_public_key` text,
	`usage_count` integer DEFAULT 0 NOT NULL,
	`last_used` text,
	`shared_source` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ssh_credentials_sync_id_unique` ON `ssh_credentials` (`sync_id`);--> statement-breakpoint
CREATE TABLE `ssh_folders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`sync_id` text NOT NULL,
	`name` text NOT NULL,
	`color` text,
	`icon` text,
	`sort_order` integer,
	`credential_id` integer,
	`local_only` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`credential_id`) REFERENCES `ssh_credentials`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ssh_folders_sync_id_unique` ON `ssh_folders` (`sync_id`);--> statement-breakpoint
CREATE TABLE `host_defaults` (
	`sync_id` text PRIMARY KEY NOT NULL,
	`level` text NOT NULL,
	`folder_sync_id` text,
	`namespace` text NOT NULL,
	`key` text NOT NULL,
	`value` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_host_defaults_folder` ON `host_defaults` (`folder_sync_id`);--> statement-breakpoint
CREATE TABLE `ssh_data` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`sync_id` text NOT NULL,
	`connection_type` text DEFAULT 'ssh' NOT NULL,
	`name` text,
	`ip` text NOT NULL,
	`port` integer NOT NULL,
	`username` text NOT NULL,
	`folder` text,
	`parent_host_id` integer,
	`tags` text,
	`pin` integer DEFAULT false NOT NULL,
	`sort_order` integer,
	`auth_type` text NOT NULL,
	`share_ssh_auth` integer DEFAULT false NOT NULL,
	`force_keyboard_interactive` text,
	`password` text,
	`key` text,
	`key_password` text,
	`key_type` text,
	`sudo_password` text,
	`credential_id` integer,
	`override_credential_username` integer,
	`jump_hosts` text,
	`status_check_enabled` integer DEFAULT true NOT NULL,
	`status_check_interval` integer,
	`ssh_options` text,
	`notes` text,
	`enable_ssh` integer DEFAULT true NOT NULL,
	`ssh_port` integer DEFAULT 22,
	`use_socks5` integer,
	`socks5_host` text,
	`socks5_port` integer,
	`socks5_username` text,
	`socks5_password` text,
	`socks5_proxy_chain` text,
	`connection_origin` text,
	`port_knock_sequence` text,
	`host_key_fingerprint` text,
	`host_key_type` text,
	`host_key_algorithm` text DEFAULT 'sha256',
	`host_key_first_seen` text,
	`host_key_last_verified` text,
	`host_key_changed_count` integer DEFAULT 0,
	`local_only` integer DEFAULT false NOT NULL,
	`shared_source` text,
	`default_overrides` text,
	`plugin_settings` text,
	`protocol_auth` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`parent_host_id`) REFERENCES `ssh_data`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`credential_id`) REFERENCES `ssh_credentials`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ssh_data_sync_id_unique` ON `ssh_data` (`sync_id`);--> statement-breakpoint
CREATE INDEX `idx_ssh_data_parent_host` ON `ssh_data` (`parent_host_id`);--> statement-breakpoint
CREATE INDEX `idx_ssh_data_credential` ON `ssh_data` (`credential_id`);--> statement-breakpoint
CREATE TABLE `recent_activity` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`host_sync_id` text,
	`title` text NOT NULL,
	`at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_recent_activity_at` ON `recent_activity` (`at`);--> statement-breakpoint
CREATE TABLE `snippet_folders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`sync_id` text NOT NULL,
	`name` text NOT NULL,
	`color` text,
	`icon` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `snippet_folders_sync_id_unique` ON `snippet_folders` (`sync_id`);--> statement-breakpoint
CREATE TABLE `snippets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`sync_id` text NOT NULL,
	`name` text NOT NULL,
	`content` text NOT NULL,
	`description` text,
	`folder` text,
	`order` integer DEFAULT 0 NOT NULL,
	`host_filter` text,
	`is_note` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `snippets_sync_id_unique` ON `snippets` (`sync_id`);--> statement-breakpoint
CREATE TABLE `sync_conflicts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`entity_type` text NOT NULL,
	`sync_id` text NOT NULL,
	`local_row` text NOT NULL,
	`server_revision` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sync_entities` (
	`entity_type` text NOT NULL,
	`sync_id` text NOT NULL,
	`data` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_sync_entities_type_sync` ON `sync_entities` (`entity_type`,`sync_id`);--> statement-breakpoint
CREATE TABLE `sync_records` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`entity_type` text NOT NULL,
	`sync_id` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`seq` integer DEFAULT 0 NOT NULL,
	`hash` text,
	`deleted` integer DEFAULT false NOT NULL,
	`error` text,
	`error_hash` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_sync_records_entity_sync` ON `sync_records` (`entity_type`,`sync_id`);--> statement-breakpoint
CREATE INDEX `idx_sync_records_seq` ON `sync_records` (`seq`);--> statement-breakpoint
CREATE TABLE `sync_state` (
	`id` integer PRIMARY KEY NOT NULL,
	`cursor` integer DEFAULT 0 NOT NULL,
	`known_types` text,
	`last_sync_at` text
);
--> statement-breakpoint
CREATE TABLE `user_preferences` (
	`id` integer PRIMARY KEY NOT NULL,
	`reopen_tabs_on_login` integer DEFAULT false NOT NULL,
	`theme` text,
	`font_size` text,
	`accent_color` text,
	`language` text,
	`command_palette_enabled` integer,
	`show_host_tags` integer,
	`host_tray_on_click` integer,
	`pin_app_rail` integer,
	`expand_app_rail_on_hover` integer,
	`show_pin_app_rail_button` integer,
	`folders_collapsed` integer,
	`disable_update_check` integer,
	`confirm_tab_close` integer,
	`hidden_rail_tabs` text,
	`compact_host_view` integer,
	`status_color_scheme` text,
	`custom_keybindings` text,
	`layout_id` text,
	`theme_id` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
