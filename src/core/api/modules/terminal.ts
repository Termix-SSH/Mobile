import type { AccountClient } from "../AccountClient";
import { sshLogger } from "@/core/log/logger";

export function createTerminalApi(c: AccountClient) {
  /** Per-host shell command history (deduped, newest first, max 500). */
  async function getCommandHistory(hostId: number): Promise<string[]> {
    if (!c.isPluginEnabled("ssh-terminal")) return [];
    try {
      const response = await c.http.auth.get(
        `/terminal/command_history/${hostId}`,
      );
      const data = response.data;
      if (Array.isArray(data)) {
        return data
          .map((row: any) => (typeof row === "string" ? row : row?.command))
          .filter((c: unknown): c is string => typeof c === "string");
      }
      return [];
    } catch {
      return [];
    }
  }

  async function saveCommandToHistory(
    hostId: number,
    command: string,
  ): Promise<void> {
    try {
      await c.http.auth.post("/terminal/command_history", { hostId, command });
    } catch {
      // History is best-effort; never block the terminal on it.
    }
  }

  async function deleteCommandFromHistory(
    hostId: number,
    command: string,
  ): Promise<void> {
    try {
      await c.http.auth.post("/terminal/command_history/delete", {
        hostId,
        command,
      });
    } catch {
      // Best-effort.
    }
  }

  async function clearCommandHistory(hostId: number): Promise<void> {
    try {
      await c.http.auth.delete(`/terminal/command_history/${hostId}`);
    } catch {
      // Best-effort.
    }
  }

  async function createTerminalWebSocket(): Promise<WebSocket | null> {
    try {
      const jwtToken = c.token();
      if (!jwtToken || jwtToken.trim() === "") {
        return null;
      }

      const wsUrl = c.terminalWebSocketUrl(jwtToken);
      return c.openSocket(wsUrl, [`termix.jwt.${jwtToken}`]) as WebSocket;
    } catch (error) {
      return null;
    }
  }

  function connectToTerminalHost(
    ws: WebSocket,
    hostConfig: any,
    cols: number,
    rows: number,
  ): void {
    if (ws.readyState === WebSocket.OPEN) {
      const connectMessage = {
        type: "connectToHost",
        data: {
          cols,
          rows,
          hostConfig,
        },
      };
      ws.send(JSON.stringify(connectMessage));
    } else {
      sshLogger.warn(
        "[connectToTerminalHost] WebSocket is not open, connect message dropped",
        {
          operation: "connect_to_host",
          readyState: ws.readyState,
        },
      );
    }
  }

  function sendTerminalInput(ws: WebSocket, input: string): void {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "input", data: input }));
    }
  }

  function sendTerminalResize(ws: WebSocket, cols: number, rows: number): void {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "resize", data: { cols, rows } }));
    }
  }

  return {
    getCommandHistory,
    saveCommandToHistory,
    deleteCommandFromHistory,
    clearCommandHistory,
    createTerminalWebSocket,
    connectToTerminalHost,
    sendTerminalInput,
    sendTerminalResize,
  };
}

export type TerminalApi = ReturnType<typeof createTerminalApi>;
