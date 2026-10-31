import type { AccountClient } from "@/core/api/AccountClient";
import type { SSHHost } from "@/types";
import { hostStacksOn } from "./stacks-setting";
import type { DockerBackend } from "./types";

/** Docker through the server's plugin, on a connected Docker session. */
export function createRelayDockerBackend(
  client: AccountClient,
  sessionId: () => string,
  host: SSHHost,
): DockerBackend {
  const api = client.api.docker;
  return {
    via: "relay",
    async check() {
      const v = await api.dockerValidate(sessionId());
      return v;
    },
    containers: () => api.getDockerContainers(sessionId()),
    action: (id, action) => api.dockerContainerAction(sessionId(), id, action),
    stats: (id) => api.getDockerContainerStats(sessionId(), id),
    logs: (id, tail) => api.getDockerContainerLogs(sessionId(), id, tail),
    async stacksEnabled() {
      if (!hostStacksOn(host)) return false;
      return api.getDockerStacksEnabled();
    },
    async stacks() {
      return (await api.getDockerStacks(sessionId())).stacks ?? [];
    },
    async stack(stack) {
      const d = await api.getDockerStack(sessionId(), stack.name);
      return {
        name: d.name,
        composeFile: d.composeFile,
        compose: d.compose,
        services: d.services ?? [],
        running: d.running,
        total: d.total,
      };
    },
    console: () => ({ kind: "relay", host }),
  };
}
