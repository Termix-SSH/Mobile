/**
 * The on device store. One database file per account, so there is no user id
 * column: the file is the account.
 *
 * Synced tables mirror the server's rows (Termix core schema.ts and the
 * Plugin-Snippets tables) column for column, so sync can map them one to one.
 * Like the server, rows point at each other by local id. On the wire those
 * become syncIds (credentialId -> credentialSyncId, parentHostId ->
 * parentHostSyncId, jumpHosts[].hostId -> a host syncId), see core's
 * sync/wire.ts. Secrets are plain text here; the whole file is encrypted.
 *
 * Never edit an applied migration. Change this file, then run
 * `npm run db:generate`.
 */

import { sql } from "drizzle-orm";
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
  type AnySQLiteColumn,
} from "drizzle-orm/sqlite-core";

const timestamps = {
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
};

const bool = (name: string) => integer(name, { mode: "boolean" });

/** Server: ssh_credentials. Keys are credentials too. */
export const credentials = sqliteTable("ssh_credentials", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  syncId: text("sync_id").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  folder: text("folder"),
  tags: text("tags"),
  pin: bool("pin").notNull().default(false),
  sortOrder: integer("sort_order"),
  authType: text("auth_type").notNull(),
  username: text("username"),
  password: text("password"),
  key: text("key"),
  privateKey: text("private_key"),
  publicKey: text("public_key"),
  keyPassword: text("key_password"),
  keyType: text("key_type"),
  detectedKeyType: text("detected_key_type"),
  certPublicKey: text("cert_public_key"),
  usageCount: integer("usage_count").notNull().default(0),
  lastUsed: text("last_used"),
  sharedSource: text("shared_source"),
  ...timestamps,
});

/** Server: ssh_folders. */
export const folders = sqliteTable("ssh_folders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  syncId: text("sync_id").notNull().unique(),
  name: text("name").notNull(),
  color: text("color"),
  icon: text("icon"),
  sortOrder: integer("sort_order"),
  credentialId: integer("credential_id").references(() => credentials.id, {
    onDelete: "set null",
  }),
  localOnly: bool("local_only").notNull().default(false),
  ...timestamps,
});

/**
 * Server: ssh_data. `pluginSettings` and `protocolAuth` are the JSON the
 * server puts on a synced host row: per plugin host settings (terminal, files,
 * docker, tunnels, remote desktop, ...) and plugin protocol logins keyed by
 * protocol (rdp, vnc, telnet, ...).
 */
export const hosts = sqliteTable(
  "ssh_data",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    syncId: text("sync_id").notNull().unique(),
    connectionType: text("connection_type").notNull().default("ssh"),
    name: text("name"),
    ip: text("ip").notNull(),
    port: integer("port").notNull(),
    username: text("username").notNull(),
    folder: text("folder"),
    parentHostId: integer("parent_host_id").references(
      (): AnySQLiteColumn => hosts.id,
      { onDelete: "set null" },
    ),
    tags: text("tags"),
    pin: bool("pin").notNull().default(false),
    sortOrder: integer("sort_order"),
    authType: text("auth_type").notNull(),
    shareSshAuth: bool("share_ssh_auth").notNull().default(false),
    forceKeyboardInteractive: text("force_keyboard_interactive"),
    password: text("password"),
    key: text("key"),
    keyPassword: text("key_password"),
    keyType: text("key_type"),
    sudoPassword: text("sudo_password"),
    credentialId: integer("credential_id").references(() => credentials.id, {
      onDelete: "set null",
    }),
    overrideCredentialUsername: bool("override_credential_username"),
    jumpHosts: text("jump_hosts"),
    statusCheckEnabled: bool("status_check_enabled").notNull().default(true),
    statusCheckInterval: integer("status_check_interval"),
    sshOptions: text("ssh_options"),
    notes: text("notes"),
    color: text("color"),
    icon: text("icon"),
    enableSsh: bool("enable_ssh").notNull().default(true),
    sshPort: integer("ssh_port").default(22),
    useSocks5: bool("use_socks5"),
    socks5Host: text("socks5_host"),
    socks5Port: integer("socks5_port"),
    socks5Username: text("socks5_username"),
    socks5Password: text("socks5_password"),
    socks5ProxyChain: text("socks5_proxy_chain"),
    connectionOrigin: text("connection_origin"),
    portKnockSequence: text("port_knock_sequence"),
    hostKeyFingerprint: text("host_key_fingerprint"),
    hostKeyType: text("host_key_type"),
    hostKeyAlgorithm: text("host_key_algorithm").default("sha256"),
    hostKeyFirstSeen: text("host_key_first_seen"),
    hostKeyLastVerified: text("host_key_last_verified"),
    hostKeyChangedCount: integer("host_key_changed_count").default(0),
    localOnly: bool("local_only").notNull().default(false),
    sharedSource: text("shared_source"),
    defaultOverrides: text("default_overrides"),
    pluginSettings: text("plugin_settings"),
    protocolAuth: text("protocol_auth"),
    /** Device only: the linked server's own id for this host, for server actions. */
    serverId: integer("server_id"),
    ...timestamps,
  },
  (table) => [
    index("idx_ssh_data_parent_host").on(table.parentHostId),
    index("idx_ssh_data_credential").on(table.credentialId),
  ],
);

/** Plugin-Snippets: snippet_folders. */
export const snippetFolders = sqliteTable("snippet_folders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  syncId: text("sync_id").notNull().unique(),
  name: text("name").notNull(),
  color: text("color"),
  icon: text("icon"),
  ...timestamps,
});

/** Plugin-Snippets: snippets. `folder` is the folder's name, like the server. */
export const snippets = sqliteTable("snippets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  syncId: text("sync_id").notNull().unique(),
  name: text("name").notNull(),
  content: text("content").notNull(),
  description: text("description"),
  folder: text("folder"),
  order: integer("order").notNull().default(0),
  hostFilter: text("host_filter"),
  isNote: bool("is_note").notNull().default(false),
  ...timestamps,
});

/**
 * Host defaults as they travel: one row per key. syncId is "u:<ns.key>" for
 * the user's own level or "f:<folderSyncId>:<ns.key>" for a folder.
 */
export const hostDefaults = sqliteTable(
  "host_defaults",
  {
    syncId: text("sync_id").primaryKey(),
    level: text("level", { enum: ["user", "folder"] }).notNull(),
    folderSyncId: text("folder_sync_id"),
    namespace: text("namespace").notNull(),
    key: text("key").notNull(),
    value: text("value"),
    updatedAt: timestamps.updatedAt,
  },
  (table) => [index("idx_host_defaults_folder").on(table.folderSyncId)],
);

/** The server's admin defaults, a read only snapshot. One row. */
export const adminDefaults = sqliteTable("host_defaults_admin", {
  id: integer("id").primaryKey(),
  values: text("values").notNull().default("{}"),
  updatedAt: timestamps.updatedAt,
});

/** Server: user_preferences. Settings that sync, one row. */
export const userPreferences = sqliteTable("user_preferences", {
  id: integer("id").primaryKey(),
  reopenTabsOnLogin: bool("reopen_tabs_on_login").notNull().default(false),
  theme: text("theme"),
  fontSize: text("font_size"),
  accentColor: text("accent_color"),
  language: text("language"),
  commandPaletteEnabled: bool("command_palette_enabled"),
  showHostTags: bool("show_host_tags"),
  hostTrayOnClick: bool("host_tray_on_click"),
  pinAppRail: bool("pin_app_rail"),
  expandAppRailOnHover: bool("expand_app_rail_on_hover"),
  showPinAppRailButton: bool("show_pin_app_rail_button"),
  foldersCollapsed: bool("folders_collapsed"),
  disableUpdateCheck: bool("disable_update_check"),
  confirmTabClose: bool("confirm_tab_close"),
  hiddenRailTabs: text("hidden_rail_tabs"),
  compactHostView: bool("compact_host_view"),
  statusColorScheme: text("status_color_scheme"),
  customKeybindings: text("custom_keybindings"),
  layoutId: text("layout_id"),
  themeId: text("theme_id"),
  updatedAt: timestamps.updatedAt,
});

/**
 * Rows of synced types the app has no table for (homepage items, workspaces,
 * vault profiles, plugin user settings, ...). Kept as wire JSON so nothing a
 * server sends is lost.
 */
export const syncEntities = sqliteTable(
  "sync_entities",
  {
    entityType: text("entity_type").notNull(),
    syncId: text("sync_id").notNull(),
    data: text("data").notNull(),
    updatedAt: timestamps.updatedAt,
  },
  (table) => [
    uniqueIndex("idx_sync_entities_type_sync").on(
      table.entityType,
      table.syncId,
    ),
  ],
);

/**
 * Server: sync_records, as a linked desktop keeps it. revision is the last
 * server revision seen, hash what the row looked like then.
 */
export const syncRecords = sqliteTable(
  "sync_records",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    entityType: text("entity_type").notNull(),
    syncId: text("sync_id").notNull(),
    revision: integer("revision").notNull().default(0),
    seq: integer("seq").notNull().default(0),
    hash: text("hash"),
    deleted: bool("deleted").notNull().default(false),
    error: text("error"),
    errorHash: text("error_hash"),
    /** Wire fields of the last server row the phone has no column for. */
    extra: text("extra"),
    updatedAt: timestamps.updatedAt,
  },
  (table) => [
    uniqueIndex("idx_sync_records_entity_sync").on(
      table.entityType,
      table.syncId,
    ),
    index("idx_sync_records_seq").on(table.seq),
  ],
);

/** Server: sync_conflicts. A local edit that lost to a newer server edit. */
export const syncConflicts = sqliteTable("sync_conflicts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  entityType: text("entity_type").notNull(),
  syncId: text("sync_id").notNull(),
  localRow: text("local_row").notNull(),
  serverRevision: integer("server_revision").notNull(),
  createdAt: timestamps.createdAt,
});

/** Server: the cursor and known types of sync_link. One row. */
export const syncState = sqliteTable("sync_state", {
  id: integer("id").primaryKey(),
  cursor: integer("cursor").notNull().default(0),
  knownTypes: text("known_types"),
  lastSyncAt: text("last_sync_at"),
});

/** Device only. Newest first, capped per host. */
export const commandHistory = sqliteTable(
  "command_history",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    hostSyncId: text("host_sync_id").notNull(),
    command: text("command").notNull(),
    usedAt: text("used_at").notNull(),
  },
  (table) => [
    uniqueIndex("idx_command_history_host_command").on(
      table.hostSyncId,
      table.command,
    ),
  ],
);

/** Device only. What was opened lately, for the home screen. */
export const recentActivity = sqliteTable(
  "recent_activity",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    kind: text("kind").notNull(),
    hostSyncId: text("host_sync_id"),
    title: text("title").notNull(),
    at: text("at").notNull(),
  },
  (table) => [index("idx_recent_activity_at").on(table.at)],
);

/** Device only. Phone choices for one host, like its key rows. */
export const hostPrefs = sqliteTable(
  "host_prefs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    hostSyncId: text("host_sync_id").notNull(),
    key: text("key").notNull(),
    value: text("value").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("idx_host_prefs_host_key").on(table.hostSyncId, table.key),
  ],
);

/**
 * Device only. Host metrics the phone saw, one row a minute per host and kept
 * a week, so the history survives closing the tab. `ts` is unix ms; network is
 * bytes a second.
 */
export const metricSamples = sqliteTable(
  "metric_samples",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    hostSyncId: text("host_sync_id").notNull(),
    ts: integer("ts").notNull(),
    cpu: real("cpu"),
    mem: real("mem"),
    disk: real("disk"),
    rx: real("rx"),
    tx: real("tx"),
  },
  (table) => [
    index("idx_metric_samples_host_ts").on(table.hostSyncId, table.ts),
  ],
);

/** Every table, in an order where a row's targets come first. */
export const allTables = {
  credentials,
  folders,
  hosts,
  snippetFolders,
  snippets,
  hostDefaults,
  adminDefaults,
  userPreferences,
  syncEntities,
  syncRecords,
  syncConflicts,
  syncState,
  commandHistory,
  recentActivity,
  hostPrefs,
  metricSamples,
};

export type HostRow = typeof hosts.$inferSelect;
export type NewHostRow = typeof hosts.$inferInsert;
export type CredentialRow = typeof credentials.$inferSelect;
export type NewCredentialRow = typeof credentials.$inferInsert;
export type FolderRow = typeof folders.$inferSelect;
export type SnippetRow = typeof snippets.$inferSelect;
export type SnippetFolderRow = typeof snippetFolders.$inferSelect;
