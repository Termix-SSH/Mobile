import { accounts } from "@/core/accounts";
import type { Account } from "@/core/accounts/types";
import type { AccountClient } from "@/core/api/AccountClient";
import { repositoriesFor } from "@/core/data/repositories";
import { isSshEngineAvailable } from "@/modules/termix-ssh";
import { SHOWCASE } from "@/showcase/enabled";
import { showcaseTransport } from "@/showcase/transport";
import { createLocalTransport, localTransport, NO_SERVER_COPY } from "./local";
import {
  planConnection,
  readOrigin,
  type ConnectionOrigin,
  type ConnectionPlan,
  type OriginInputs,
} from "./origin";
import { createRelayTransport } from "./relay";
import type { Transport } from "./types";

export * from "./types";
export * from "./origin";
export * from "./errors";
export * from "./reconnect";
export { HostConnection } from "./connection";
export type {
  ConnectedInfo,
  ConnectionPrompt,
  ConnectionSnapshot,
  ConnectionStatus,
  NetworkInfo,
} from "./connection";

const relays = new WeakMap<AccountClient, Transport>();
const serverLocals = new Map<string, Transport>();

function relayFor(client: AccountClient): Transport {
  let relay = relays.get(client);
  if (!relay) {
    relay = createRelayTransport(client);
    relays.set(client, relay);
  }
  return relay;
}

function localFor(account: Account): Transport {
  if (SHOWCASE) return showcaseTransport;
  if (account.kind === "local") return localTransport;
  let local = serverLocals.get(account.id);
  if (!local) {
    // A linked server's hosts reach the phone through sync. Read the account
    // each time: sync can turn on after this was made.
    local = createLocalTransport(
      isSshEngineAvailable,
      () => {
        const current = accounts.find(account.id) ?? account;
        return repositoriesFor(current, accounts.client(account.id)).connect;
      },
      NO_SERVER_COPY,
    );
    serverLocals.set(account.id, local);
  }
  return local;
}

/** The ways an account can connect: the phone, and its server if it has one. */
export function transportsFor(accountId: string | null): {
  account: Account;
  local: Transport;
  relay: Transport | null;
} {
  const account = (accountId && accounts.find(accountId)) || accounts.active();
  const client = account.kind === "server" ? accounts.client(account.id) : null;
  return {
    account,
    local: localFor(account),
    relay: client ? relayFor(client) : null,
  };
}

export function originInputs(
  accountId: string | null,
  isSsh: boolean,
): OriginInputs {
  const { account, local, relay } = transportsFor(accountId);
  return { accountKind: account.kind, local, relay, isSsh };
}

/** The host's saved origin, from its account's store. */
export async function originOf(
  accountId: string | null,
  host: { id: number; connectFrom?: string },
): Promise<ConnectionOrigin> {
  const { account } = transportsFor(accountId);
  const repos = repositoriesFor(account, accounts.client(account.id));
  const saved = await repos.origins.get(host).catch(() => undefined);
  return readOrigin(saved, host.connectFrom);
}

/** How a host would connect right now, from its saved origin or `override`. */
export async function planFor(
  accountId: string | null,
  host: { id: number; connectFrom?: string },
  isSsh: boolean,
  override?: ConnectionOrigin,
): Promise<ConnectionPlan> {
  const origin = override ?? (await originOf(accountId, host));
  return planConnection(origin, originInputs(accountId, isSsh));
}

/** Saves a host's origin in its account's store (and on the server when it can). */
export async function saveOrigin(
  accountId: string | null,
  hostId: number,
  origin: ConnectionOrigin,
): Promise<void> {
  const { account } = transportsFor(accountId);
  await repositoriesFor(account, accounts.client(account.id)).origins.set(
    hostId,
    origin,
  );
}
