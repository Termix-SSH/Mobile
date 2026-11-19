import type { AccountClient } from "@/core/api/AccountClient";
import { serverHostConfig } from "@/core/sync/host-ids";
import type { Transport } from "../types";
import { RelayShell } from "./RelayShell";
import { t } from "@/i18n";

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
        : t("transport.relay.youAreSignedOutOf");
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
