import type { AccountClient } from "@/core/api/AccountClient";
import type { SSHHost } from "@/types";
import type { JournalEntry, ServicesBackend } from "./types";

/** The server's Service Manager plugin for `host` (the server's own copy). */
export function createRelayServicesBackend(
  client: AccountClient,
  host: SSHHost,
): ServicesBackend {
  const api = client.api.services;
  return {
    via: "relay",

    async status() {
      const s = await api.getServicesStatus(host.id);
      return { ...s, readOnly: s.readOnly || !s.canEdit };
    },

    units: (kind) => api.getUnits(host.id, kind),

    unit: (name) => api.getUnit(host.id, name),

    async action(name, action) {
      return (await api.unitAction(host.id, name, action)).state || "unknown";
    },

    async journal(filter) {
      return (await api.getJournal(host.id, filter)).entries;
    },

    follow(filter, onEntries, onEnd) {
      let ws: WebSocket | null = null;
      let stopped = false;
      let ended = false;
      const end = (error?: string) => {
        if (ended || stopped) return;
        ended = true;
        onEnd(error);
      };
      void (async () => {
        const token = await client.token();
        if (stopped) return;
        if (!token) return end("Not signed in");
        ws = client.openSocket(
          client.pluginWebSocketUrl("service-manager", "follow"),
          [`termix.jwt.${token}`],
        ) as WebSocket;
        ws.onopen = () =>
          ws?.send(
            JSON.stringify({
              type: "connect",
              data: {
                hostConfig: {
                  id: host.id,
                  syncId: host.syncId ?? null,
                  ip: host.ip,
                },
                source: "journal",
                units: filter.units,
                priority: filter.priority,
                lines: 50,
              },
            }),
          );
        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(String(event.data)) as {
              type?: string;
              data?: JournalEntry[];
              message?: string;
            };
            if (msg.type === "lines" && msg.data?.length) onEntries(msg.data);
            else if (msg.type === "error") end(msg.message || "Follow failed");
            else if (msg.type === "ended") end();
          } catch {}
        };
        ws.onerror = () => end("Connection failed");
        ws.onclose = () => end();
      })();
      return {
        stop: () => {
          stopped = true;
          try {
            ws?.send(JSON.stringify({ type: "disconnect" }));
            ws?.close();
          } catch {}
        },
      };
    },
  };
}
