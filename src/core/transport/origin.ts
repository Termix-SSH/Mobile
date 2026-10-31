import type { Transport, TransportCapability } from "./types";

/**
 * Where a host's connections start. Saved per host as the ssh-terminal host
 * setting `connectFrom`, so it syncs like any other host setting.
 */
export type ConnectionOrigin = "auto" | "device" | "server";

export const ORIGINS: ConnectionOrigin[] = ["auto", "device", "server"];

export const ORIGIN_LABELS: Record<ConnectionOrigin, string> = {
  auto: "Automatic",
  device: "This phone",
  server: "Termix server",
};

export const ORIGIN_HELP: Record<ConnectionOrigin, string> = {
  auto: "Uses this phone when it can reach the host, otherwise the server.",
  device: "This phone opens SSH itself.",
  server: "The Termix server opens SSH for you.",
};

export function isOrigin(value: unknown): value is ConnectionOrigin {
  return ORIGINS.includes(value as ConnectionOrigin);
}

/** The host's saved value, then the copy kept on the phone, then automatic. */
export function readOrigin(
  hostValue: unknown,
  stored?: unknown,
): ConnectionOrigin {
  if (isOrigin(hostValue)) return hostValue;
  if (isOrigin(stored)) return stored;
  return "auto";
}

export interface OriginInputs {
  accountKind: "local" | "server";
  local: Transport;
  /** Null on This device, which has no server. */
  relay: Transport | null;
  /**
   * The phone can dial this host for this tab: an SSH host, or a protocol the
   * phone opens itself like Telnet. RDP and VNC still go through the server.
   */
  isSsh: boolean;
}

export interface Blocked {
  reason: string;
  /** Another origin that would work. */
  fix?: ConnectionOrigin;
}

export interface ConnectionPlan {
  origin: ConnectionOrigin;
  /** Ways to try, in order. A later one is only used when an earlier can't reach the host. */
  attempts: Transport[];
  blocked?: Blocked;
}

const usable = (t: Transport | null | undefined): boolean => !!t && t.available;

/** Which transports a host's connection tries, for a given origin. */
export function planConnection(
  origin: ConnectionOrigin,
  inputs: OriginInputs,
): ConnectionPlan {
  const { local, relay, isSsh } = inputs;
  const localOk = isSsh && usable(local);
  const localReason = isSsh
    ? local.unavailableReason
    : "The phone only connects to SSH and Telnet hosts.";

  // This device has nothing to relay through.
  if (inputs.accountKind === "local" || !relay) {
    return localOk
      ? { origin: "device", attempts: [local] }
      : {
          origin: "device",
          attempts: [],
          blocked: { reason: localReason ?? "Can't connect." },
        };
  }

  const relayOk = usable(relay);
  switch (origin) {
    case "device":
      return localOk
        ? { origin, attempts: [local] }
        : {
            origin,
            attempts: [],
            blocked: {
              reason: localReason ?? "Can't connect from the phone.",
              fix: relayOk ? "server" : undefined,
            },
          };
    case "server":
      return relayOk
        ? { origin, attempts: [relay] }
        : {
            origin,
            attempts: [],
            blocked: {
              reason: relay.unavailableReason ?? "Can't reach the server.",
              fix: localOk ? "device" : undefined,
            },
          };
    case "auto": {
      const attempts = [localOk && local, relayOk && relay].filter(
        (t): t is Transport => !!t,
      );
      return attempts.length
        ? { origin, attempts }
        : {
            origin,
            attempts,
            blocked: {
              reason:
                relay.unavailableReason ?? localReason ?? "Can't connect.",
            },
          };
    }
  }
}

export interface NeedsResult {
  attempts: Transport[];
  blocked?: Blocked;
}

const NEED_WORDS: Record<TransportCapability, string> = {
  shell: "an SSH connection",
  exec: "an SSH connection",
  sftp: "an SSH connection",
  forward: "an SSH connection",
  server: "a Termix server",
  guacd: "a Termix server",
  tcp: "a connection from the phone",
};

/**
 * What a feature needs: one list that must all be there, or several lists
 * where any one will do (like SFTP from the phone or the server's routes).
 */
export type Needs = TransportCapability[] | TransportCapability[][];

export function needGroups(needs: Needs): TransportCapability[][] {
  if (!needs.length) return [[]];
  return Array.isArray(needs[0])
    ? (needs as TransportCapability[][])
    : [needs as TransportCapability[]];
}

export interface NeedsOptions {
  /** False when the server lacks what the feature needs there, so relay attempts drop out. */
  relayOk?: boolean;
}

/**
 * Narrows a plan to the ways that can do everything a feature needs. When
 * none can, says why and which origin would work.
 */
export function checkNeeds(
  needs: Needs,
  plan: ConnectionPlan,
  title: string,
  planFor: (origin: ConnectionOrigin) => ConnectionPlan,
  options: NeedsOptions = {},
): NeedsResult {
  const groups = needGroups(needs);
  const relayOff = options.relayOk === false;
  const provides = (t: Transport, group: TransportCapability[]) =>
    group.every((n) => t.provides.includes(n));
  const fits = (t: Transport) =>
    !(relayOff && t.kind === "relay") && groups.some((g) => provides(t, g));
  const attempts = plan.attempts.filter(fits);
  if (attempts.length) return { attempts };
  if (plan.blocked && !plan.attempts.length) {
    return { attempts, blocked: plan.blocked };
  }
  const fix = (["server", "device"] as const).find(
    (o) => o !== plan.origin && planFor(o).attempts.some(fits),
  );
  const how =
    fix === "server"
      ? "Connect this host through the server"
      : "Connect this host from the phone";
  // The server could do it but has it turned off.
  if (
    relayOff &&
    plan.attempts.some(
      (t) => t.kind === "relay" && groups.some((g) => provides(t, g)),
    )
  ) {
    const reason = fix
      ? `${title} is off on this server. ${how} to use it.`
      : `${title} is off on this server.`;
    return { attempts, blocked: { reason, fix } };
  }
  const first = groups[0];
  const missing = first.find(
    (n) => !plan.attempts.some((t) => t.provides.includes(n)),
  );
  const what = NEED_WORDS[missing ?? first[0]] ?? "another way to connect";
  const reason = fix
    ? `${title} needs ${what}. ${how} to use it.`
    : `${title} needs ${what}, which this host can't use right now.`;
  return { attempts, blocked: { reason, fix } };
}
