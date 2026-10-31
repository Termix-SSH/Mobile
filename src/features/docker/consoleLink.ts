import {
  containerCommand,
  isContainerId,
} from "@termix-ssh/plugin-sdk/host-scripts";
import type { AccountClient } from "@/core/api/AccountClient";
import type { ExecRunner } from "@/core/exec";
import { Utf8Stream } from "@/core/transport/local/LocalShell";
import type { SSHHost } from "@/types";

export interface ConsoleEvents {
  onOutput(text: string): void;
  onConnected(): void;
  onError(message: string): void;
  onClosed(): void;
}

/** A shell in a container, wherever it runs. */
export interface ConsoleLink {
  input(text: string): void;
  resize(cols: number, rows: number): void;
  close(): void;
}

const SHELL = `sh -c 'command -v bash >/dev/null 2>&1 && exec bash || exec sh'`;

/** The line typed into the host's shell to start the container shell. */
export function execLine(
  runtime: "docker" | "podman",
  id: string,
  sudo: boolean,
): string {
  if (!isContainerId(id)) throw new Error("That is not a valid container id");
  const run = sudo
    ? `sudo ${runtime} exec -it ${id} ${SHELL}`
    : containerCommand(runtime, `exec -it ${id} ${SHELL}`);
  // clear hides the typed line; exec ends the host shell with the container's.
  return `clear; exec ${run}\n`;
}

/** Opens a pty shell on the host over the phone's SSH and starts docker exec in it. */
export function openLocalConsole(
  target: { runner: ExecRunner; runtime: "docker" | "podman"; sudo: boolean },
  containerId: string,
  size: { cols: number; rows: number },
  events: ConsoleEvents,
): ConsoleLink {
  const decoder = new Utf8Stream();
  let shell: Awaited<ReturnType<ExecRunner["shell"]>> | null = null;
  let closed = false;
  target.runner
    .shell(
      {
        onData: (data) => events.onOutput(decoder.decode(data)),
        onExit: () => {
          if (!closed) events.onClosed();
        },
      },
      size,
    )
    .then(async (s) => {
      if (closed) {
        void s.close();
        return;
      }
      shell = s;
      await s.write(execLine(target.runtime, containerId, target.sudo));
      events.onConnected();
    })
    .catch((e) =>
      events.onError(e instanceof Error ? e.message : "Console failed"),
    );
  return {
    input: (text) => void shell?.write(text).catch(() => {}),
    resize: (cols, rows) => void shell?.resize(cols, rows).catch(() => {}),
    close: () => {
      closed = true;
      void shell?.close().catch(() => {});
    },
  };
}

/** The server's docker console socket. */
export function openRelayConsole(
  client: AccountClient,
  host: SSHHost,
  containerId: string,
  size: () => { cols: number; rows: number },
  events: ConsoleEvents,
): ConsoleLink {
  let ws: WebSocket | null = null;
  let closed = false;
  const send = (msg: object) => {
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  };
  void (async () => {
    const token = await client.token();
    if (closed) return;
    if (!token) {
      events.onError("Not authenticated");
      return;
    }
    ws = client.openSocket(client.dockerConsoleWebSocketUrl(token), [
      `termix.jwt.${token}`,
    ]) as WebSocket;
    let failed = false;
    ws.onopen = () => {
      send({
        type: "connect",
        data: {
          // The server checks the ip against the one it resolves from the id
          // and refuses on a mismatch, so send both. syncId wins there.
          hostConfig: {
            id: host.id,
            ip: host.ip,
            syncId: host.syncId ?? undefined,
            enableDocker: true,
          },
          containerId,
          ...size(),
        },
      });
    };
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string);
        if (msg.type === "output") events.onOutput(msg.data);
        else if (msg.type === "connected") {
          events.onConnected();
          send({ type: "resize", data: size() });
        } else if (msg.type === "error") {
          failed = true;
          events.onError(msg.message || "Console error");
        } else if (msg.type === "disconnected") events.onClosed();
      } catch {}
    };
    ws.onerror = () => {
      failed = true;
      events.onError("Connection failed");
    };
    ws.onclose = () => {
      if (!failed && !closed) events.onClosed();
    };
  })();
  return {
    input: (text) => send({ type: "input", data: text }),
    resize: (cols, rows) => send({ type: "resize", data: { cols, rows } }),
    close: () => {
      closed = true;
      try {
        send({ type: "disconnect" });
        ws?.close();
      } catch {}
    },
  };
}
