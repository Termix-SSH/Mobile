import type {
  InitSystem,
  JournalEntry,
  UnitDetail,
  UnitSummary,
} from "@termix-ssh/plugin-sdk/host-scripts";

export interface HostServices {
  init: InitSystem;
  version: string;
  os: string;
  hostname: string;
  /** Changes can run as root without asking. */
  root: boolean;
  journal: boolean;
  failed: number;
  /** The server says this user can't change services on this host. */
  readOnly?: boolean;
}

export type ServiceAction = "start" | "stop" | "restart";
export type UnitKind = "service" | "timer" | "socket" | "all";

export interface JournalFilter {
  units: string[];
  /** 0 (emerg) to 7 (debug); this level and worse. */
  priority?: number;
  lines: number;
}

export interface Follow {
  stop(): void;
}

/** Services on one host, over the phone's SSH or the server's Service Manager. */
export interface ServicesBackend {
  via: "local" | "relay";
  status(signal?: AbortSignal): Promise<HostServices>;
  units(kind: UnitKind, signal?: AbortSignal): Promise<UnitSummary[]>;
  unit(name: string, signal?: AbortSignal): Promise<UnitDetail>;
  /** Resolves with the unit's state afterwards. */
  action(name: string, action: ServiceAction): Promise<string>;
  journal(filter: JournalFilter, signal?: AbortSignal): Promise<JournalEntry[]>;
  /** New journal lines as they come, until stopped. */
  follow(
    filter: Omit<JournalFilter, "lines">,
    onEntries: (entries: JournalEntry[]) => void,
    onEnd: (error?: string) => void,
  ): Follow;
}

export type { JournalEntry, UnitDetail, UnitSummary };
