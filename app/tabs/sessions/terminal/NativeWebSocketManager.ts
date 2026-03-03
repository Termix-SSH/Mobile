import { getCurrentServerUrl, getCookie } from "../../../main-axios";

export interface TerminalHostConfig {
  id: number;
  name: string;
  ip: string;
  port: number;
  username: string;
  authType: "password" | "key" | "credential" | "none";
  password?: string;
  key?: string;
  keyPassword?: string;
  keyType?: string;
  credentialId?: number;
}

export type WsState =
  | "connecting"
  | "connected"
  | "disconnected"
  | "dataReceived"
  | "connectionFailed";

export interface HostKeyData {
  ip: string;
  port: number;
  hostname?: string;
  fingerprint: string;
  oldFingerprint?: string;
  keyType: string;
  oldKeyType?: string;
  algorithm: string;
}

export interface NativeWSConfig {
  hostConfig: TerminalHostConfig;
  onStateChange: (state: WsState, data?: Record<string, unknown>) => void;
  onData: (data: string) => void;
  onTotpRequired: (prompt: string, isPassword: boolean) => void;
  onAuthDialogNeeded: (
    reason: "no_keyboard" | "auth_failed" | "timeout",
  ) => void;
  onHostKeyVerificationRequired?: (
    scenario: "new" | "changed",
    data: HostKeyData,
  ) => void;
  onPostConnectionSetup: () => void;
  onDisconnected: (hostName: string) => void;
  onConnectionFailed: (message: string) => void;
}

export class NativeWebSocketManager {
  private config: NativeWSConfig;
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 5;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private connectionTimeout: ReturnType<typeof setTimeout> | null = null;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private shouldNotReconnect = false;
  private hasNotifiedFailure = false;
  private isAppInBackground = false;
  private backgroundTime: number | null = null;
  private isReconnectFromBackground = false;
  private currentConnectionFromBackground = false;
  private destroyed = false;
  private cols = 80;
  private rows = 24;
  private wsUrl: string | null = null;
  private serverSessionId: string | null = null;
  private pendingReattach = false;

  constructor(config: NativeWSConfig) {
    this.config = config;
  }

  async connect(cols: number, rows: number): Promise<void> {
    if (this.destroyed) return;

    this.cols = cols;
    this.rows = rows;

    const serverUrl = getCurrentServerUrl();
    if (!serverUrl) {
      this.config.onConnectionFailed(
        "No server URL found - please configure a server first",
      );
      return;
    }

    const jwtToken = await getCookie("jwt");
    if (!jwtToken || jwtToken.trim() === "") {
      this.config.onConnectionFailed(
        "Authentication required - please log in again",
      );
      return;
    }

    const wsProtocol = serverUrl.startsWith("https://") ? "wss://" : "ws://";
    const wsHost = serverUrl.replace(/^https?:\/\//, "");
    const cleanHost = wsHost.replace(/\/$/, "");
    this.wsUrl = `${wsProtocol}${cleanHost}/ssh/websocket/?token=${encodeURIComponent(jwtToken)}`;

    this.connectWebSocket();
  }

  destroy(): void {
    this.destroyed = true;
    this.shouldNotReconnect = true;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify({ type: "disconnect" }));
      } catch (_) {}
    }
    this.serverSessionId = null;
    this.clearAllTimers();
    if (this.ws) {
      try {
        this.ws.onopen = null;
        this.ws.onmessage = null;
        this.ws.onclose = null;
        this.ws.onerror = null;
        if (
          this.ws.readyState === WebSocket.OPEN ||
          this.ws.readyState === WebSocket.CONNECTING
        ) {
          this.ws.close(1000, "Component unmounted");
        }
      } catch (_) {}
      this.ws = null;
    }
  }

  sendInput(data: string): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify({ type: "input", data }));
      } catch (e) {}
    }
  }

  sendResize(cols: number, rows: number): void {
    this.cols = cols;
    this.rows = rows;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify({ type: "resize", data: { cols, rows } }));
      } catch (e) {}
    }
  }

  sendTotpResponse(code: string, isPassword: boolean): void {
    const responseType = isPassword ? "password_response" : "totp_response";
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify({ type: responseType, data: { code } }));
      } catch (e) {}
    }
  }

  sendHostKeyResponse(action: "accept" | "reject"): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(
          JSON.stringify({
            type: "host_key_verification_response",
            data: { action },
          }),
        );
      } catch (e) {}
    }
  }

  sendReconnectWithCredentials(
    credentials: { password?: string; sshKey?: string; keyPassword?: string },
    cols: number,
    rows: number,
  ): void {
    this.cols = cols;
    this.rows = rows;
    const updatedHostConfig = {
      ...this.config.hostConfig,
      password: credentials.password,
      key: credentials.sshKey,
      keyPassword: credentials.keyPassword,
      authType: (credentials.password ? "password" : "key") as
        | "password"
        | "key",
    };

    const messageData = {
      password: credentials.password,
      sshKey: credentials.sshKey,
      keyPassword: credentials.keyPassword,
      hostConfig: updatedHostConfig,
      cols,
      rows,
    };

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(
          JSON.stringify({
            type: "reconnect_with_credentials",
            data: messageData,
          }),
        );
      } catch (e) {}
    }
  }

  notifyBackgrounded(): void {
    this.isAppInBackground = true;
    this.backgroundTime = Date.now();
    this.reconnectAttempts = 0;
    this.stopPingInterval();
    this.clearReconnectTimeout();
    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
      this.connectionTimeout = null;
    }
  }

  notifyForegrounded(): void {
    const wasInBackground = this.isAppInBackground;
    this.isAppInBackground = false;

    if (!wasInBackground) return;
    if (this.destroyed) return;

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.startPingInterval();
      return;
    }

    this.isReconnectFromBackground = true;
    this.reconnectAttempts = 1;

    if (this.ws) {
      try {
        this.ws.onclose = null;
        this.ws.onerror = null;
        this.ws.onopen = null;
        this.ws.onmessage = null;
        this.ws.close();
      } catch (_) {}
      this.ws = null;
    }
    this.stopPingInterval();

    this.connectWebSocket();
  }

  private connectWebSocket(): void {
    if (this.destroyed) return;

    if (!this.wsUrl) {
      this.notifyFailureOnce(
        "No WebSocket URL available - server not configured",
      );
      return;
    }

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return;
    }

    if (this.ws) {
      try {
        this.ws.onopen = null;
        this.ws.onclose = null;
        this.ws.onerror = null;
        this.ws.onmessage = null;
        if (
          this.ws.readyState === WebSocket.CONNECTING ||
          this.ws.readyState === WebSocket.OPEN
        ) {
          this.ws.close();
        }
      } catch (_) {}
    }

    this.config.onStateChange("connecting", {
      retryCount: this.reconnectAttempts,
    });

    const ws = new WebSocket(this.wsUrl);
    this.ws = ws;

    this.connectionTimeout = setTimeout(() => {
      if (ws.readyState === WebSocket.CONNECTING) {
        try {
          ws.onclose = null;
          ws.close();
        } catch (_) {}
        if (
          !this.shouldNotReconnect &&
          this.reconnectAttempts < this.maxReconnectAttempts
        ) {
          this.scheduleReconnect();
        } else {
          this.notifyFailureOnce("Connection timeout - server not responding");
        }
      }
    }, 10000);

    ws.onopen = () => {
      if (this.connectionTimeout) {
        clearTimeout(this.connectionTimeout);
        this.connectionTimeout = null;
      }
      this.clearReconnectTimeout();

      this.hasNotifiedFailure = false;
      this.reconnectAttempts = 0;

      this.currentConnectionFromBackground = this.isReconnectFromBackground;
      this.isReconnectFromBackground = false;

      if (this.serverSessionId) {
        this.pendingReattach = true;
        ws.send(
          JSON.stringify({
            type: "attachSession",
            data: {
              sessionId: this.serverSessionId,
              cols: this.cols,
              rows: this.rows,
            },
          }),
        );
      } else {
        ws.send(
          JSON.stringify({
            type: "connectToHost",
            data: {
              cols: this.cols,
              rows: this.rows,
              hostConfig: this.config.hostConfig,
            },
          }),
        );
      }

      this.startPingInterval();
    };

    ws.onmessage = (event: MessageEvent) => {
      if (this.destroyed) return;
      try {
        const msg = JSON.parse(event.data as string);

        if (msg.type === "data") {
          this.config.onData(msg.data as string);
          this.config.onStateChange("dataReceived", {
            hostName: this.config.hostConfig.name,
          });
        } else if (msg.type === "totp_required") {
          this.config.onTotpRequired(
            (msg.prompt as string) || "Verification code:",
            false,
          );
        } else if (msg.type === "password_required") {
          this.config.onTotpRequired(
            (msg.prompt as string) || "Password:",
            true,
          );
        } else if (
          msg.type === "keyboard_interactive_available" ||
          msg.type === "auth_method_not_available"
        ) {
          this.config.onAuthDialogNeeded("no_keyboard");
        } else if (msg.type === "host_key_verification_required") {
          if (this.connectionTimeout) {
            clearTimeout(this.connectionTimeout);
            this.connectionTimeout = null;
          }
          if (this.config.onHostKeyVerificationRequired) {
            this.config.onHostKeyVerificationRequired(
              "new",
              msg.data as HostKeyData,
            );
          }
        } else if (msg.type === "host_key_changed") {
          if (this.connectionTimeout) {
            clearTimeout(this.connectionTimeout);
            this.connectionTimeout = null;
          }
          if (this.config.onHostKeyVerificationRequired) {
            this.config.onHostKeyVerificationRequired(
              "changed",
              msg.data as HostKeyData,
            );
          }
        } else if (msg.type === "error") {
          const message = (msg.message as string) || "Unknown error";
          if (this.isUnrecoverableError(message)) {
            this.shouldNotReconnect = true;
            this.notifyFailureOnce("Authentication failed: " + message);
            try {
              ws.close(1000);
            } catch (_) {}
            return;
          }
        } else if (msg.type === "connected") {
          const isReattach = this.pendingReattach;
          this.pendingReattach = false;
          this.config.onStateChange("connected", {
            hostName: this.config.hostConfig.name,
            fromBackground: this.currentConnectionFromBackground,
            isReattach,
          });
          if (!this.currentConnectionFromBackground && !isReattach) {
            this.config.onPostConnectionSetup();
          }
        } else if (msg.type === "disconnected") {
          this.serverSessionId = null;
          this.config.onDisconnected(this.config.hostConfig.name);
        } else if (msg.type === "pong") {
        } else if (msg.type === "resized") {
        } else if (msg.type === "sessionCreated") {
          this.serverSessionId = msg.sessionId as string;
        } else if (msg.type === "sessionAttached") {
          this.serverSessionId = msg.sessionId as string;
        } else if (msg.type === "sessionExpired") {
          this.serverSessionId = null;
          this.pendingReattach = false;
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(
              JSON.stringify({
                type: "connectToHost",
                data: {
                  cols: this.cols,
                  rows: this.rows,
                  hostConfig: this.config.hostConfig,
                },
              }),
            );
          }
        } else if (msg.type === "sessionTakenOver") {
          this.serverSessionId = null;
          this.shouldNotReconnect = true;
          this.config.onDisconnected(this.config.hostConfig.name);
        }
      } catch (_) {
        this.config.onData(event.data as string);
      }
    };

    ws.onclose = (event: CloseEvent) => {
      if (this.connectionTimeout) {
        clearTimeout(this.connectionTimeout);
        this.connectionTimeout = null;
      }
      this.stopPingInterval();

      if (this.isAppInBackground) {
        return;
      }

      if (this.destroyed) return;

      if (this.shouldNotReconnect) {
        this.notifyFailureOnce("Connection closed");
        return;
      }

      if (event.code === 1000 || event.code === 1001) {
        this.notifyFailureOnce("Connection closed");
        return;
      }

      this.scheduleReconnect();
    };

    ws.onerror = () => {
      if (this.connectionTimeout) {
        clearTimeout(this.connectionTimeout);
        this.connectionTimeout = null;
      }
    };
  }

  private scheduleReconnect(): void {
    if (this.shouldNotReconnect || this.destroyed) return;

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return;
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.notifyFailureOnce("Maximum reconnection attempts reached");
      return;
    }

    this.reconnectAttempts += 1;

    const delay = Math.min(
      1000 * Math.pow(2, this.reconnectAttempts - 1),
      5000,
    );

    this.config.onStateChange("connecting", {
      retryCount: this.reconnectAttempts,
    });

    this.clearReconnectTimeout();

    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null;
      if (this.destroyed) return;
      if (this.ws && this.ws.readyState === WebSocket.OPEN) return;
      this.connectWebSocket();
    }, delay);
  }

  private startPingInterval(): void {
    this.stopPingInterval();
    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        try {
          this.ws.send(JSON.stringify({ type: "ping" }));
        } catch (_) {}
      }
    }, 25000);
  }

  private stopPingInterval(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private clearReconnectTimeout(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }

  private clearAllTimers(): void {
    this.stopPingInterval();
    this.clearReconnectTimeout();
    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
      this.connectionTimeout = null;
    }
  }

  private notifyFailureOnce(message: string): void {
    if (this.hasNotifiedFailure) return;
    this.hasNotifiedFailure = true;
    this.config.onConnectionFailed(
      `${this.config.hostConfig.name}: ${message}`,
    );
  }

  private isUnrecoverableError(message: string): boolean {
    if (!message) return false;
    const m = message.toLowerCase();
    return (
      m.includes("password") ||
      m.includes("authentication") ||
      m.includes("permission denied") ||
      m.includes("invalid") ||
      m.includes("incorrect") ||
      m.includes("denied")
    );
  }
}
