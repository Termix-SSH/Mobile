import type {
  Credential,
  SSHHost,
  SSHHostData,
  Snippet,
  SnippetFolder,
} from "@/types";

import type { DefaultsIndex } from "@/core/hosts/defaults/resolve";
import type { DefaultsTarget } from "@/core/hosts/defaults/store";

export type Unsubscribe = () => void;

/** Lists that can tell when they changed, so screens stay live. */
export interface Watchable {
  subscribe(listener: () => void): Unsubscribe;
}

export interface Repository<T, Draft> extends Watchable {
  list(): Promise<T[]>;
  get(id: number): Promise<T | null>;
  create(draft: Draft): Promise<T>;
  update(id: number, draft: Draft): Promise<T>;
  remove(id: number): Promise<void>;
}

/** Changes several hosts take at once, like the bulk bar on Hosts. */
export interface HostBulkUpdate {
  pin?: boolean;
  /** Empty puts them in no folder. */
  folder?: string;
  /** Puts them under this host, or null takes them out from under one. */
  parentHostId?: number | null;
}

export interface HostRepository extends Repository<SSHHost, SSHHostData> {
  /** Sets the manual order of hosts, like a drag in the list. */
  reorder(positions: { id: number; sortOrder: number }[]): Promise<void>;
  bulkUpdate(ids: number[], updates: HostBulkUpdate): Promise<void>;
}

export interface SnippetRepository extends Repository<
  Snippet,
  Partial<Snippet>
> {
  reorder(
    items: { id: number; order: number; folder?: string }[],
  ): Promise<void>;
}

/** Snippet folders are named by their name, like the server routes. */
export interface SnippetFolderRepository extends Watchable {
  list(): Promise<SnippetFolder[]>;
  create(folder: {
    name: string;
    color?: string;
    icon?: string;
  }): Promise<void>;
  rename(oldName: string, newName: string): Promise<void>;
  remove(name: string): Promise<void>;
}

export interface HostFolder {
  name: string;
  color?: string;
  icon?: string;
}

export interface HostFolderRepository extends Watchable {
  list(): Promise<HostFolder[]>;
}

/** Commands typed into a host's terminal, newest first. */
export interface CommandHistoryRepository extends Watchable {
  list(host: SSHHost): Promise<string[]>;
  /** Adds commands the list lacks below the ones it has, keeping their order. */
  merge(host: SSHHost, commands: string[]): Promise<void>;
  add(host: SSHHost, command: string): Promise<void>;
  remove(host: SSHHost, command: string): Promise<void>;
  clear(host: SSHHost): Promise<void>;
}

export interface ActivityEntry {
  kind: string;
  title: string;
  hostSyncId?: string | null;
  at: string;
}

export interface RecentActivityRepository extends Watchable {
  list(limit?: number): Promise<ActivityEntry[]>;
  add(entry: Omit<ActivityEntry, "at">): Promise<void>;
}

/** A host key Termix saved, in the server's format. */
export interface SavedHostKey {
  /** Hex of the raw key blob, like the server's host_key_fingerprint. */
  fingerprint: string;
  keyType: string;
  changedCount: number;
}

/** Everything the phone's own SSH engine reads for one host. */
export interface HostConnectProfile {
  host: SSHHost;
  /** The login the host points to, with its secrets and certificate. */
  credential: Credential | null;
  /** Core's ssh_options JSON (keepalive, legacy algorithms, env vars). */
  sshOptions: Record<string, unknown>;
  socks5: {
    use: boolean;
    host?: string;
    port?: number;
    username?: string;
    password?: string;
    chain: unknown[];
  };
  portKnock: { port: number; protocol?: string; delay?: number }[];
  hostKey: SavedHostKey | null;
}

/** Reads and host key writes for connecting from this phone. */
export interface HostConnectRepository {
  profile(id: number): Promise<HostConnectProfile | null>;
  /** Saves a trusted key. `changed` bumps the change count like the server. */
  saveHostKey(
    id: number,
    key: { fingerprint: string; keyType: string },
    changed: boolean,
  ): Promise<void>;
  /** Marks the saved key as just seen. */
  touchHostKey(id: number): Promise<void>;
}

/** Where each host connects from (the ssh-terminal `connectFrom` setting). */
export interface HostOriginRepository {
  get(host: Pick<SSHHost, "id" | "connectFrom">): Promise<string | undefined>;
  set(hostId: number, origin: string): Promise<void>;
}

/** The phone's own choices for one host, like its key rows. Never synced. */
export interface HostPrefsRepository extends Watchable {
  get(host: SSHHost, key: string): Promise<string | null>;
  /** Null removes it. */
  set(host: SSHHost, key: string, value: string | null): Promise<void>;
}

/** One minute of a host's metrics. Percent for cpu, mem and disk; bytes a second for rx and tx. */
export interface MetricPoint {
  /** Unix ms. */
  ts: number;
  cpu: number | null;
  mem: number | null;
  disk: number | null;
  rx: number | null;
  tx: number | null;
}

/** Device only history of what the phone saw. */
export interface MetricSamplesRepository {
  /** Keeps at most one point a minute per host and drops anything older than a week. */
  append(host: SSHHost, point: MetricPoint): Promise<void>;
  /** Points since `fromTs`, oldest first. */
  range(host: SSHHost, fromTs: number): Promise<MetricPoint[]>;
}

/** Where a default is set: the user's own level, or one folder. */
export type HostDefaultsTarget = DefaultsTarget;

/** The user and folder levels of host defaults, plus the server's snapshot. */
export interface HostDefaultsRepository extends Watchable {
  index(): Promise<DefaultsIndex>;
  set(
    target: HostDefaultsTarget,
    fullKey: string,
    value: unknown,
  ): Promise<void>;
  unset(target: HostDefaultsTarget, fullKey: string): Promise<void>;
}

/** Where an account keeps its data. */
export interface DataRepositories {
  /** "local" for the encrypted store on this phone, "server" for the server. */
  source: "local" | "server" | "none";
  hosts: HostRepository;
  hostFolders: HostFolderRepository;
  credentials: Repository<Credential, Partial<Credential>>;
  snippets: SnippetRepository;
  snippetFolders: SnippetFolderRepository;
  commandHistory: CommandHistoryRepository;
  recentActivity: RecentActivityRepository;
  origins: HostOriginRepository;
  hostPrefs: HostPrefsRepository;
  metricSamples: MetricSamplesRepository;
  /** Only in an account's local copy. A live server applies its own. */
  hostDefaults?: HostDefaultsRepository;
  /** Only on This device, where the phone opens SSH itself. */
  connect?: HostConnectRepository;
}
