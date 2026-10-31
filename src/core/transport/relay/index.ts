import type { AccountClient } from "@/core/api/AccountClient";
import { serverHostConfig } from "@/core/sync/host-ids";
import type { Transport } from "../types";
import { RelayShell } from "./RelayShell";

/** Connects through a linked Termix server, which opens SSH for us. */
export function createRelayTransport(client: AccountClient): Transport {
  return {
    kind: "relay",
    // Whether the server runs a feature's plugin is checked by the registry.
    provides: ["shell", "server", "guacd"],
    get available() {
      return client.isAuthenticated();
    },
    get unavailableReason() {
      return client.isAuthenticated()
        ? undefined
        : "You are signed out of this server. Sign in to connect through it.";
    },
    openShell: (options) =>
      new RelayShell({
        ...options,
        client,
        prepareHostConfig: (config) =>
          serverHostConfig(client.accountId, config),
      }),
  };
}
