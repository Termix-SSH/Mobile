import type { TerminalThemeColors } from "@/constants/terminal-themes";
// ============================================================================
// SSH HOST TYPES
// ============================================================================

export interface JumpHost {
  hostId: number;
}

export interface QuickAction {
  name: string;
  snippetId: number;
}

/** Who shared a host or login with this account (synced from the server). */
export interface SharedInfo {
  owner: string;
  permissionLevel: string;
}

export interface SSHHost {
  id: number;
  /** A linked server's own id for this host, when the phone keeps a copy. */
  serverId?: number | null;
  /** Set on hosts shared with you. They are read only here. */
  shared?: SharedInfo | null;
  // Names the host on both sides of a sync pair. Numeric ids can drift between
  // a device and its sync server, so connect calls pass this when present.
  syncId?: string | null;
  connectionType?: "ssh" | "rdp" | "vnc" | "telnet" | string;
  name: string;
  ip: string;
  port: number;
  username: string;
  folder: string;
  /** Set on sub-hosts: the host this one sits under, in place of a folder. */
  parentHostId?: number | null;
  tags: string[];
  pin: boolean;
  /** Manual place in its folder; unset sorts by name. */
  sortOrder?: number | null;
  authType: AuthType;
  password?: string;
  key?: string;
  keyPassword?: string;
  keyType?: string;
  /** Typed into sudo prompts when the host turns that on. */
  sudoPassword?: string;
  forceKeyboardInteractive?: boolean;

  autostartPassword?: string;
  autostartKey?: string;
  autostartKeyPassword?: string;

  credentialId?: number;
  overrideCredentialUsername?: boolean;
  userId?: string;
  enableTerminal: boolean;
  enableTunnel: boolean;
  enableFileManager: boolean;
  defaultPath: string;
  /** File Manager host setting showPanel: the files panel beside terminals. */
  showFilesPanel?: boolean;
  tunnelConnections: TunnelConnection[];
  jumpHosts?: JumpHost[];
  quickActions?: QuickAction[];
  statsConfig?: string;
  terminalConfig?: Partial<TerminalConfig>;
  /** Keepalive, environment variables and other SSH options. */
  sshOptions?: Record<string, unknown>;
  /** Where the app connects from: "auto", "device" or "server". */
  connectFrom?: string;
  createdAt: string;
  updatedAt: string;

  // --- Modern multi-protocol model (matches the redesigned web backend).
  // All optional so legacy SSH-only hosts keep working unchanged.
  enableSsh?: boolean;
  enableRdp?: boolean;
  enableVnc?: boolean;
  enableTelnet?: boolean;
  enableDocker?: boolean;
  enableServices?: boolean;
  sshPort?: number;
  notes?: string;
  /** Hex color like #3b82f6, synced with the server. */
  color?: string | null;
  /** Lucide icon name. */
  icon?: string | null;
  guacamoleConfig?: string | Record<string, unknown> | null;
  // Remote desktop (Guacamole) protocol fields
  rdpAuthType?: "direct" | "credential" | "none";
  authOverrides?: Record<string, { credentialId?: number | string | null }>;
  domain?: string;
  rdpUser?: string;
  rdpPassword?: string;
  rdpDomain?: string;
  rdpPort?: number;
  vncUser?: string;
  vncPassword?: string;
  vncPort?: number;
  telnetUser?: string;
  telnetPassword?: string;
  telnetPort?: number;
  /** The remote desktop plugin's RDP security: any, nla, tls. Empty means any. */
  rdpSecurity?: string;
  dockerConfig?: string;
  macAddress?: string;

  // 2.9+ only. Per plugin host settings; the app reads the flat fields above,
  // which are filled from this on load.
  pluginSettings?: Record<string, Record<string, unknown>>;
  protocolAuth?: Record<string, unknown>;
  statusCheckEnabled?: boolean;
  statusCheckInterval?: number | null;
}

export interface JumpHostData {
  hostId: number;
}

export interface QuickActionData {
  name: string;
  snippetId: number;
}

export interface SSHHostData {
  name?: string;
  ip: string;
  port: number;
  username: string;
  folder?: string;
  /** Undefined keeps the saved one, null takes it out from under a host. */
  parentHostId?: number | null;
  tags?: string[];
  pin?: boolean;
  authType: AuthType;
  password?: string;
  key?: File | null;
  keyPassword?: string;
  keyType?: string;
  /** Undefined keeps the saved one, an empty string clears it. */
  sudoPassword?: string;
  credentialId?: number | null;
  overrideCredentialUsername?: boolean;
  enableTerminal?: boolean;
  enableTunnel?: boolean;
  enableFileManager?: boolean;
  defaultPath?: string;
  forceKeyboardInteractive?: boolean;
  tunnelConnections?: TunnelConnection[];
  jumpHosts?: JumpHostData[];
  quickActions?: QuickActionData[];
  statsConfig?: string | Record<string, unknown>;
  terminalConfig?: Partial<TerminalConfig>;
  sshOptions?: Record<string, unknown>;

  // --- Modern multi-protocol model (optional; SSH-only hosts omit these).
  enableSsh?: boolean;
  enableRdp?: boolean;
  enableVnc?: boolean;
  enableTelnet?: boolean;
  enableDocker?: boolean;
  enableServices?: boolean;
  notes?: string;
  color?: string | null;
  icon?: string | null;
  macAddress?: string;
  /** Plugin host settings the editor changed directly, by plugin id. */
  pluginSettingsPatch?: Record<string, Record<string, unknown>>;
  /** Vault plugin profile for hosts that sign in with Vault. */
  vaultProfileId?: number | null;
  rdpUser?: string;
  rdpPassword?: string;
  rdpDomain?: string;
  rdpPort?: number;
  vncUser?: string;
  vncPassword?: string;
  vncPort?: number;
  telnetUser?: string;
  telnetPassword?: string;
  telnetPort?: number;
}

/**
 * A node in the host sidebar tree. Folders nest recursively - built from each
 * host's `folder` string by splitting on " / " (matches the web app). Leaves
 * are hosts. `path` is the full accumulated folder path (e.g. "Prod / DBs") and
 * is used as a stable key for expansion state.
 */
export type HostTreeNode =
  | {
      kind: "host";
      host: SSHHost;
      /** Sub-hosts nested under this host, by parentHostId. */
      children?: HostTreeNode[];
    }
  | {
      kind: "folder";
      name: string;
      path: string;
      color?: string;
      children: HostTreeNode[];
    };

// ============================================================================
// CREDENTIAL TYPES
// ============================================================================

export interface Credential {
  id: number;
  /** Set on logins shared with you. They are read only here. */
  shared?: SharedInfo | null;
  name: string;
  description?: string;
  folder?: string;
  tags: string[];
  authType: "password" | "key";
  username: string;
  password?: string;
  key?: string;
  publicKey?: string;
  keyPassword?: string;
  keyType?: string;
  /** OpenSSH user certificate signed for the key. */
  certPublicKey?: string;
  usageCount: number;
  lastUsed?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CredentialData {
  name: string;
  description?: string;
  folder?: string;
  tags: string[];
  authType: "password" | "key";
  username: string;
  password?: string;
  key?: string;
  publicKey?: string;
  keyPassword?: string;
  keyType?: string;
  /** Empty clears the saved certificate. */
  certPublicKey?: string;
}

// ============================================================================
// TUNNEL TYPES
// ============================================================================

export interface TunnelConnection {
  scope?: "s2s" | "c2s";
  mode?: "local" | "remote" | "dynamic";
  tunnelType?: "local" | "remote";
  bindHost?: string;
  sourceHostId?: number;
  sourceHostName?: string;
  targetHost?: string;
  sourcePort: number;
  endpointPort: number;
  endpointHost?: string;

  endpointPassword?: string;
  endpointKey?: string;
  endpointKeyPassword?: string;
  endpointAuthType?: string;
  endpointKeyType?: string;

  maxRetries: number;
  retryInterval: number;
  autoStart: boolean;
}

/** 2.9+ connect body; the server resolves the hosts and secrets. */
export interface PluginTunnelConnect {
  name: string;
  sourceHostId: number;
  tunnelIndex: number;
  scope?: "s2s" | "c2s";
  mode?: "local" | "remote" | "dynamic";
  sourcePort: number;
  endpointHost?: string;
  endpointPort: number;
  maxRetries?: number;
  retryInterval?: number;
  autoStart?: boolean;
}

export interface TunnelConfig {
  name: string;
  scope?: "s2s" | "c2s";
  mode?: "local" | "remote" | "dynamic";
  tunnelType?: "local" | "remote";
  bindHost?: string;
  targetHost?: string;
  sourceHostId: number;
  tunnelIndex: number;
  hostName: string;
  sourceIP: string;
  sourceSSHPort: number;
  sourceUsername: string;
  sourcePassword?: string;
  sourceAuthMethod: string;
  sourceSSHKey?: string;
  sourceKeyPassword?: string;
  sourceKeyType?: string;
  sourceCredentialId?: number;
  sourceUserId?: string;
  endpointIP: string;
  endpointSSHPort: number;
  endpointUsername: string;
  endpointPassword?: string;
  endpointAuthMethod: string;
  endpointSSHKey?: string;
  endpointKeyPassword?: string;
  endpointKeyType?: string;
  endpointCredentialId?: number;
  endpointUserId?: string;
  sourcePort: number;
  endpointPort: number;
  maxRetries: number;
  retryInterval: number;
  autoStart: boolean;
  isPinned: boolean;
}

export interface TunnelStatus {
  connected: boolean;
  status: ConnectionState;
  retryCount?: number;
  maxRetries?: number;
  nextRetryIn?: number;
  reason?: string;
  errorType?: ErrorType;
  manualDisconnect?: boolean;
  retryExhausted?: boolean;
}

// ============================================================================
// FILE MANAGER TYPES
// ============================================================================

export interface Tab {
  id: string | number;
  title: string;
  fileName: string;
  content: string;
  isSSH?: boolean;
  sshSessionId?: string;
  filePath?: string;
  loading?: boolean;
  dirty?: boolean;
}

export interface FileManagerFile {
  name: string;
  path: string;
  type?: "file" | "directory";
  isSSH?: boolean;
  sshSessionId?: string;
}

export interface FileManagerShortcut {
  name: string;
  path: string;
}

// ============================================================================
// TERMINAL CONFIGURATION TYPES
// ============================================================================

export interface TerminalConfig {
  cursorBlink: boolean;
  cursorStyle: "block" | "underline" | "bar";
  fontSize: number;
  fontFamily: string;
  letterSpacing: number;
  lineHeight: number;
  theme: string;

  scrollback: number;
  bellStyle: "none" | "sound" | "visual" | "both";
  rightClickSelectsWord: boolean;
  fastScrollModifier: "alt" | "ctrl" | "shift";
  fastScrollSensitivity: number;
  minimumContrastRatio: number;

  backspaceMode: "normal" | "control-h";
  agentForwarding: boolean;
  environmentVariables: { key: string; value: string }[];
  /** A server's snippet id, or the snippet's syncId in a local copy. */
  startupSnippetId: number | string | null;
  autoMosh: boolean;
  moshCommand: string;
  sudoPasswordAutoFill: boolean;

  /** Colors for the "custom" theme. */
  customThemeColors: TerminalThemeColors | null;
  /** Taps a link opens right away instead of asking first. */
  linkClickBehavior: "default" | "confirm" | "direct";
  /** Phone only: vibrate on bell and long press. */
  haptics: boolean;
  /** Phone only: Option on an iPad keyboard sends Alt instead of symbols. */
  optionAsMeta: boolean;
  /** Phone only: ask before a snippet runs. */
  confirmSnippetRun?: boolean;
  /** Phone only: show past commands that match the typed line. */
  commandSuggestions?: boolean;

  // Host only, from the ssh-terminal plugin.
  useSSHTitle?: boolean;
  autoReconnect?: boolean;
  keepOpenOnExit?: boolean;
  autoTmux?: boolean;
  passwordPromptAutoFill?: boolean;
  enableCommandHistory?: boolean;
}

// ============================================================================
// TAB TYPES
// ============================================================================

export interface TunnelSessionProps {
  hostConfig: {
    id: number;
    name: string;
    ip: string;
    username?: string;
    enableTunnel: boolean;
    tunnelConnections: TunnelConnection[];
  };
  /** The saved host, for opening SSH from the phone. */
  host?: SSHHost;
  isVisible: boolean;
  title?: string;
  onClose?: () => void;
}

export interface TunnelCardProps {
  tunnel: TunnelConnection;
  tunnelName: string;
  status: TunnelStatus | null;
  isLoading: boolean;
  onAction: (action: "connect" | "disconnect" | "cancel") => Promise<void>;
}

// ============================================================================
// CONNECTION STATES
// ============================================================================

export const CONNECTION_STATES = {
  DISCONNECTED: "disconnected",
  CONNECTING: "connecting",
  CONNECTED: "connected",
  VERIFYING: "verifying",
  FAILED: "failed",
  UNSTABLE: "unstable",
  RETRYING: "retrying",
  WAITING: "waiting",
  DISCONNECTING: "disconnecting",
} as const;

export type ConnectionState =
  (typeof CONNECTION_STATES)[keyof typeof CONNECTION_STATES];

export type ErrorType =
  | "CONNECTION_FAILED"
  | "AUTHENTICATION_FAILED"
  | "TIMEOUT"
  | "NETWORK_ERROR"
  | "UNKNOWN";

// ============================================================================
// AUTHENTICATION TYPES
// ============================================================================

export type AuthType =
  | "password"
  | "key"
  | "credential"
  | "none"
  | "tailscale"
  // Sign ins the linked server runs in a browser.
  | "opkssh"
  | "stepca"
  | "vault";

// ============================================================================
// SNIPPETS TYPES
// ============================================================================

export interface Snippet {
  id: number;
  syncId?: string | null;
  userId: string;
  name: string;
  content: string;
  description?: string;
  folder?: string;
  order?: number;
  /** Pasted without running. */
  isNote?: boolean;
  /** Hosts the web app runs it on, as the server's JSON list. Kept as is. */
  hostFilter?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SnippetFolder {
  id: number;
  userId: string;
  name: string;
  color?: string;
  icon?: string;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// UTILITY TYPES
// ============================================================================

export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

// ============================================================================
// DATABASE EXPORT/IMPORT TYPES
// ============================================================================

export interface ExportSummary {
  sshHostsImported: number;
  sshCredentialsImported: number;
  fileManagerItemsImported: number;
  dismissedAlertsImported: number;
  credentialUsageImported: number;
  settingsImported: number;
  skippedItems: number;
  errors: string[];
}

export interface ImportResult {
  success: boolean;
  summary: ExportSummary;
}

// ============================================================================
// SERVER METRICS TYPES
// ============================================================================

export interface CpuMetrics {
  percent: number | null;
  cores: number | null;
  load: [number, number, number] | null;
  /** Per core percent, from the 1s live sample. */
  perCore?: (number | null)[];
  coreIds?: string[];
  /** Percent of CPU time by kind since the last live sample. */
  mix?: { user: number; system: number; iowait: number; steal: number };
}

export interface MemoryMetrics {
  percent: number | null;
  usedGiB: number | null;
  totalGiB: number | null;
  /** Buffers plus page cache, from the live sample. */
  cachedGiB?: number;
  freeGiB?: number;
}

export interface DiskFilesystem {
  filesystem: string;
  type: string;
  mount: string;
  percent: number | null;
  usedHuman: string | null;
  totalHuman: string | null;
  availableHuman: string | null;
  label?: string;
}

export interface DiskMetrics {
  percent: number | null;
  usedHuman: string | null;
  totalHuman: string | null;
  availableHuman?: string | null;
  mount?: string | null;
  filesystems?: DiskFilesystem[];
}

export interface NetworkInterface {
  name: string;
  state?: "UP" | "DOWN" | string;
  ip?: string | null;
  rx?: string | null;
  tx?: string | null;
  rxBytes?: string | null;
  txBytes?: string | null;
  /** Bytes per second, from the live sample. */
  rxRateBps?: number | null;
  txRateBps?: number | null;
}

export interface NetworkMetrics {
  interfaces: NetworkInterface[];
}

export interface UptimeMetrics {
  seconds: number | null;
  formatted: string | null;
}

export interface ProcessInfo {
  pid: string | number;
  cpu: number;
  mem: number;
  command: string;
  user?: string;
  state?: string;
  ppid?: string;
}

export interface ProcessesMetrics {
  total: number | null;
  running: number | null;
  top: ProcessInfo[];
}

export interface SystemMetrics {
  hostname: string | null;
  kernel: string | null;
  os: string | null;
  arch?: string | null;
}

/** One login as the server's login_stats collector sends it. */
export interface LoginEvent {
  user: string;
  ip?: string;
  time?: string;
  status?: "success" | "failed";
}

export interface TemperatureMetrics {
  source?: "sysfs" | "sensors" | "none";
  highestCelsius?: number | null;
  sensors?: { label: string; celsius: number }[];
}

export interface GpuDevice {
  index: number;
  uuid: string;
  name: string;
  driverVersion: string | null;
  utilizationPercent: number | null;
  memoryUsedMiB: number | null;
  memoryTotalMiB: number | null;
  memoryPercent: number | null;
  temperatureCelsius: number | null;
  powerDrawWatts: number | null;
  powerLimitWatts: number | null;
  fanPercent: number | null;
}

export interface GpuMetrics {
  source: "nvidia-smi" | "amdgpu" | "none";
  gpus: GpuDevice[];
  processes: {
    gpuIndex: number | null;
    pid: number;
    name: string;
    memoryUsedMiB: number | null;
  }[];
}

export interface LoginStatsMetrics {
  recentLogins: LoginEvent[];
  failedLogins: LoginEvent[];
  totalLogins: number;
  uniqueIPs: number;
}

/**
 * Full metrics payload from `GET /metrics/:id`. Mirrors the web's widget
 * collectors - every connection-type widget reads from here. All fields
 * nullable because the host may not have collected a given metric yet.
 */
export interface ServerMetrics {
  cpu: CpuMetrics;
  memory: MemoryMetrics;
  disk: DiskMetrics;
  network?: NetworkMetrics;
  uptime?: UptimeMetrics;
  processes?: ProcessesMetrics;
  system?: SystemMetrics;
  ports?: PortsMetrics;
  firewall?: FirewallMetrics;
  loginStats?: LoginStatsMetrics;
  temperature?: TemperatureMetrics;
  gpu?: GpuMetrics;
  lastChecked: string;
}

export interface ListeningPort {
  protocol: "tcp" | "udp";
  localAddress: string;
  localPort: number;
  state?: string;
  pid?: number;
  process?: string;
}

export interface PortsMetrics {
  source: "ss" | "netstat" | "none";
  ports: ListeningPort[];
}

export interface FirewallRule {
  chain: string;
  target: string;
  protocol: string;
  source: string;
  destination: string;
  dport?: string;
  sport?: string;
  state?: string;
  interface?: string;
  extra?: string;
}

export interface FirewallChain {
  name: string;
  policy: string;
  rules: FirewallRule[];
}

export interface FirewallMetrics {
  type: "iptables" | "nftables" | "ufw" | "none";
  status: "active" | "inactive" | "unknown";
  chains: FirewallChain[];
}

export interface ServerStatus {
  status: "online" | "offline";
  lastChecked: string;
  rawStatus?: "reachable";
  reason?: string;
}

// ============================================================================
// CONNECTION LOG TYPES
// ============================================================================

/**
 * A single connection-log entry. Mirrors the web `src/types/connection-log`.
 * Connect endpoints return arrays of these (sans id/timestamp) as
 * `connectionLogs`; the mobile useConnectionLog hook stamps id/timestamp.
 */
export type ConnectionLogLevel = "info" | "success" | "warning" | "error";

export interface ConnectionLogEntry {
  id: string;
  timestamp: number;
  level: ConnectionLogLevel;
  stage?: string;
  message: string;
}

export type ConnectionLogPayload = Omit<ConnectionLogEntry, "id" | "timestamp">;

// ============================================================================
// DOCKER TYPES
// ============================================================================

export interface DockerContainer {
  id: string;
  name: string;
  image: string;
  status: string;
  state: string;
  ports?: string;
  created?: string;
}

export interface DockerContainerStats {
  cpu: string;
  memoryUsed: string;
  memoryLimit: string;
  memoryPercent: string;
  netInput: string;
  netOutput: string;
  blockRead: string;
  blockWrite: string;
  pids: string;
}

export type DockerContainerAction =
  "start" | "stop" | "restart" | "pause" | "unpause" | "remove";

// ============================================================================
// SESSION CONNECT TYPES
// ============================================================================

/**
 * Auth material a user supplies interactively when a stored host needs more
 * (e.g. credential-less host, key passphrase, TOTP). Passed to the
 * session-based connect endpoints (file manager / docker).
 */
export interface SessionAuthOverrides {
  userProvidedPassword?: string;
  userProvidedSshKey?: string;
  userProvidedKeyPassword?: string;
  totpCode?: string;
}

// ============================================================================
// AUTH TYPES
// ============================================================================

export interface AuthResponse {
  token: string;
  success?: boolean;
  is_admin?: boolean;
  username?: string;
  userId?: string;
  is_external?: boolean;
  totp_enabled?: boolean;
  data_unlocked?: boolean;
  requires_totp?: boolean;
  temp_token?: string;
}

export interface UserInfo {
  totp_enabled: boolean;
  userId: string;
  username: string;
  is_admin: boolean;
  is_external?: boolean;
  data_unlocked: boolean;
}

export interface UserCount {
  count: number;
}

export interface OIDCAuthorize {
  auth_url: string;
}

// ============================================================================
// FILE MANAGER OPERATION TYPES
// ============================================================================

export interface FileManagerOperation {
  name: string;
  path: string;
  isSSH: boolean;
  sshSessionId?: string;
  hostId: number;
}

// ============================================================================
// HOMEPAGE TYPES
// ============================================================================

export interface UptimeInfo {
  uptimeMs: number;
  uptimeSeconds: number;
  formatted: string;
}

export interface RecentActivityItem {
  id: number;
  userId: string;
  type: "terminal" | "file_manager";
  hostId: number;
  hostName: string;
  timestamp: string;
}
