import { buildTerminalWebSocketUrl } from "@/core/api/compat/api-compat";
import { RelayShell } from "@/core/transport/relay/RelayShell";

class FakeSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 3;
  static all: FakeSocket[] = [];
  readyState = 0;
  sent: any[] = [];
  onclose?: (e: { code: number }) => void;
  onmessage?: (e: { data: string }) => void;
  constructor(
    public url: string,
    public protocols?: string[],
  ) {
    FakeSocket.all.push(this);
  }
  close() {
    this.readyState = FakeSocket.CLOSED;
  }
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
}

const realWebSocket = global.WebSocket;
beforeEach(() => {
  FakeSocket.all = [];
  (global as any).WebSocket = FakeSocket;
  jest.useFakeTimers();
});
afterEach(() => {
  jest.useRealTimers();
  (global as any).WebSocket = realWebSocket;
});

function fakeClient(
  serverUrl = "https://termix.example/base/",
  token: string | null = "header.payload.signature",
  generation: "legacy" | "plugin" = "legacy",
) {
  return {
    serverUrl,
    token: () => token,
    terminalWebSocketUrl: (jwt: string) =>
      buildTerminalWebSocketUrl(serverUrl, jwt, generation),
    openSocket: (url: string, protocols: string[]) =>
      new (global as any).WebSocket(url, protocols),
  };
}

function manager(client = fakeClient(), callbacks: Record<string, any> = {}) {
  const errors: string[] = [];
  const m = new RelayShell({
    client,
    hostConfig: { id: 1, name: "host" } as any,
    onStateChange: () => {},
    onData: () => {},
    onConnectionFailed: (message: string) => errors.push(message),
    ...callbacks,
  } as any);
  return { m, errors };
}

function expectAuthenticated(
  socket: FakeSocket,
  token = "header.payload.signature",
  generation: "legacy" | "plugin" = "legacy",
) {
  expect(Array.from(socket.protocols ?? [])).toEqual([`termix.jwt.${token}`]);
  const url = new URL(socket.url);
  if (generation === "plugin") {
    // 2.9 only reads the subprotocol, so the token stays out of the URL.
    expect(url.searchParams.get("token")).toBeNull();
    expect(url.pathname).toBe("/base/plugin-ws/ssh-terminal/terminal");
    return;
  }
  // Older servers only accept the URL token.
  expect(url.searchParams.get("token")).toBe(token);
  expect(url.pathname).toBe("/base/ssh/websocket/");
}

test("sends the auth subprotocol on the first connect", async () => {
  const { m } = manager();
  await m.connect(80, 24);
  expect(FakeSocket.all).toHaveLength(1);
  expectAuthenticated(FakeSocket.all[0]);
  m.destroy();
  expect(jest.getTimerCount()).toBe(0);
});

/** Opens the socket and lets the server say the shell is up. */
function openAndConnect(socket: FakeSocket) {
  socket.readyState = FakeSocket.OPEN;
  (socket as any).onopen?.();
  socket.onmessage?.({ data: JSON.stringify({ type: "connected" }) });
}

test("a socket that drops after connecting is reported once, no reconnect of its own", async () => {
  const onDropped = jest.fn();
  const { m, errors } = manager(fakeClient(), { onDropped });
  await m.connect(80, 24);
  const socket = FakeSocket.all[0];
  openAndConnect(socket);
  socket.onclose?.({ code: 1006 });
  socket.onclose?.({ code: 1006 });
  jest.advanceTimersByTime(30000);
  expect(onDropped).toHaveBeenCalledTimes(1);
  expect(onDropped).toHaveBeenCalledWith({
    kind: "network",
    reason: "The socket closed (1006)",
  });
  expect(FakeSocket.all).toHaveLength(1);
  expect(errors).toEqual([]);
  m.destroy();
  expect(jest.getTimerCount()).toBe(0);
});

test("a server going away is a drop too; a close before the shell is a failed connect", async () => {
  const onDropped = jest.fn();
  const { m } = manager(fakeClient(), { onDropped });
  await m.connect(80, 24);
  openAndConnect(FakeSocket.all[0]);
  FakeSocket.all[0].onclose?.({ code: 1001 });
  expect(onDropped).toHaveBeenCalledWith({
    kind: "server",
    reason: "The server closed the connection",
  });
  m.destroy();

  const failures: any[] = [];
  const early = manager(fakeClient(), {
    onDropped,
    onConnectionFailed: (_m: string, f: unknown) => failures.push(f),
  });
  await early.m.connect(80, 24);
  FakeSocket.all[1].onclose?.({ code: 1006 });
  expect(failures).toEqual([
    expect.objectContaining({ stage: "session", origin: "relay" }),
  ]);
  expect(onDropped).toHaveBeenCalledTimes(1);
  early.m.destroy();
});

test("a resume attaches to the server session it had, with the auth subprotocol", async () => {
  const states: any[] = [];
  const setup = jest.fn();
  const { m } = manager(fakeClient(), {
    initialSessionId: "s1",
    tabInstanceId: "tab",
    resume: true,
    onStateChange: (state: string, data: unknown) => states.push([state, data]),
    onPostConnectionSetup: setup,
  });
  await m.connect(80, 24);
  const socket = FakeSocket.all[0];
  expectAuthenticated(socket);
  openAndConnect(socket);
  expect(socket.sent[0]).toEqual({
    type: "attachSession",
    data: { sessionId: "s1", cols: 80, rows: 24, tabInstanceId: "tab" },
  });
  expect(states.at(-1)).toEqual([
    "connected",
    { hostName: "host", fromBackground: false, isReattach: true },
  ]);
  expect(setup).not.toHaveBeenCalled();
  m.destroy();
});

test("a reattach clears before the replay and counts the replay as data", async () => {
  const states: string[] = [];
  const data: string[] = [];
  const { m } = manager(fakeClient(), {
    initialSessionId: "s1",
    resume: true,
    onData: (d: string) => data.push(d),
    onStateChange: (state: string) => states.push(state),
  });
  await m.connect(80, 24);
  const socket = FakeSocket.all[0];
  socket.readyState = FakeSocket.OPEN;
  (socket as any).onopen?.();
  // The server sends the saved screen before it says connected.
  socket.onmessage?.({ data: JSON.stringify({ type: "data", data: "$ ls" }) });
  socket.onmessage?.({ data: JSON.stringify({ type: "connected" }) });
  expect(data[0]).toContain("[2J");
  expect(data.at(-1)).toBe("$ ls");
  expect(states.slice(-2)).toEqual(["connected", "dataReceived"]);
  m.destroy();
});

test("a session taken over by another device fails with no retry and keeps its id", async () => {
  const failures: any[] = [];
  const ids: unknown[] = [];
  const onDropped = jest.fn();
  const { m } = manager(fakeClient(), {
    initialSessionId: "s1",
    onDropped,
    onSessionIdChange: (id: unknown) => ids.push(id),
    onConnectionFailed: (_m: string, f: unknown) => failures.push(f),
  });
  await m.connect(80, 24);
  const socket = FakeSocket.all[0];
  openAndConnect(socket);
  socket.onmessage?.({ data: JSON.stringify({ type: "sessionTakenOver" }) });
  socket.onclose?.({ code: 1000 });
  expect(failures).toEqual([
    expect.objectContaining({
      stage: "session",
      noRetry: true,
      message: "This session was opened on another device",
    }),
  ]);
  expect(ids).toEqual([]);
  expect(onDropped).not.toHaveBeenCalled();
  m.destroy();
});

test("probe waits for the server to answer the ping", async () => {
  const { m } = manager(fakeClient(), { onDropped: jest.fn() });
  await m.connect(80, 24);
  const socket = FakeSocket.all[0];
  openAndConnect(socket);

  const ok = m.probe(3000);
  expect(socket.sent.at(-1)).toEqual({ type: "ping" });
  socket.onmessage?.({ data: JSON.stringify({ type: "pong" }) });
  await expect(ok).resolves.toBe(true);

  const silent = m.probe(3000);
  jest.advanceTimersByTime(3000);
  await expect(silent).resolves.toBe(false);

  socket.readyState = FakeSocket.CLOSED;
  await expect(m.probe(3000)).resolves.toBe(false);
  m.destroy();
});

test("getCwd asks the server and waits for its cwd answer", async () => {
  const { m } = manager(fakeClient(), { onDropped: jest.fn() });
  await expect(m.getCwd()).resolves.toBeNull();
  await m.connect(80, 24);
  const socket = FakeSocket.all[0];
  openAndConnect(socket);

  const cwd = m.getCwd();
  expect(socket.sent.at(-1)).toEqual({ type: "get_cwd" });
  socket.onmessage?.({
    data: JSON.stringify({ type: "cwd", path: "/var/log" }),
  });
  await expect(cwd).resolves.toBe("/var/log");

  const silent = m.getCwd(4000);
  jest.advanceTimersByTime(4000);
  await expect(silent).resolves.toBeNull();
  m.destroy();
});

test("coming back with a closed socket is a drop; low power pings less often", async () => {
  const onDropped = jest.fn();
  const { m } = manager(fakeClient(), { onDropped });
  await m.connect(80, 24);
  const socket = FakeSocket.all[0];
  openAndConnect(socket);
  const pings = () => socket.sent.filter((x) => x.type === "ping").length;

  m.setLowPower(true);
  jest.advanceTimersByTime(25000);
  expect(pings()).toBe(0);
  jest.advanceTimersByTime(35000);
  expect(pings()).toBe(1);

  m.notifyBackgrounded();
  socket.readyState = FakeSocket.CLOSED;
  m.notifyForegrounded();
  expect(onDropped).toHaveBeenCalledWith({
    kind: "network",
    reason: "The socket closed while the app was away",
  });
  m.destroy();
});

test("2.9 servers get the plugin terminal socket", async () => {
  const { m } = manager(
    fakeClient(
      "https://termix.example/base/",
      "header.payload.signature",
      "plugin",
    ),
  );
  await m.connect(80, 24);
  expectAuthenticated(FakeSocket.all[0], "header.payload.signature", "plugin");
  m.destroy();
});

test("a saved /ssh suffix does not double the socket path", async () => {
  const { m } = manager(fakeClient("https://termix.example/ssh"));
  await m.connect(80, 24);
  expect(new URL(FakeSocket.all[0].url).pathname).toBe("/ssh/websocket/");
  m.destroy();
});

test("browser SSH checks open and complete without writing terminal data", async () => {
  const required: { url: string; message: string }[] = [];
  const data: string[] = [];
  let completed = 0;
  const { m, errors } = manager(fakeClient(), {
    onBrowserCheckRequired: (url: string, message: string) =>
      required.push({ url, message }),
    onBrowserCheckCompleted: () => completed++,
    onData: (value: string) => data.push(value),
  });
  await m.connect(80, 24);
  const socket = FakeSocket.all[0];
  expect(jest.getTimerCount()).toBe(1);
  socket.onmessage?.({
    data: JSON.stringify({
      type: "tailscale_check_required",
      url: "https://login.tailscale.com/a/check",
      message: "Complete your SSH check to continue.",
    }),
  });
  expect(required).toEqual([
    {
      url: "https://login.tailscale.com/a/check",
      message: "Complete your SSH check to continue.",
    },
  ]);
  // Browser checks clear the connection timeout.
  expect(jest.getTimerCount()).toBe(0);
  socket.onmessage?.({
    data: JSON.stringify({ type: "tailscale_check_completed" }),
  });
  expect(completed).toBe(1);
  expect(data).toEqual([]);
  expect(errors).toEqual([]);
  m.destroy();
});

test("Warpgate authentication still requires its explicit continuation", async () => {
  const required: { url: string; securityKey: string }[] = [];
  const checks: string[] = [];
  const { m } = manager(fakeClient(), {
    onWarpgateAuthRequired: (url: string, securityKey: string) =>
      required.push({ url, securityKey }),
    onBrowserCheckRequired: (url: string) => checks.push(url),
  });
  await m.connect(80, 24);
  const socket = FakeSocket.all[0];
  socket.readyState = 1;
  socket.onmessage?.({
    data: JSON.stringify({
      type: "warpgate_auth_required",
      url: "https://warpgate.example/auth",
      securityKey: "123456",
    }),
  });
  expect(required).toEqual([
    { url: "https://warpgate.example/auth", securityKey: "123456" },
  ]);
  expect(checks).toEqual([]);
  expect(socket.sent).toEqual([]);
  m.sendWarpgateContinue();
  expect(socket.sent).toEqual([{ type: "warpgate_auth_continue", data: {} }]);
  m.destroy();
});

test.each([null, "", "   "])(
  "missing or blank credentials do not open sockets: %p",
  async (token) => {
    const { m, errors } = manager(
      fakeClient("https://termix.example/base/", token),
    );
    await m.connect(80, 24);
    expect(FakeSocket.all).toHaveLength(0);
    expect(errors).toHaveLength(1);
    m.destroy();
  },
);

test("failures say which step failed, using the server's last error", async () => {
  const failures: any[] = [];
  const { m } = manager(fakeClient(), {
    onConnectionFailed: (_m: string, f: unknown) => failures.push(f),
  });
  await m.connect(80, 24);
  const socket = FakeSocket.all[0];
  socket.readyState = FakeSocket.OPEN;
  (socket as any).onopen?.();
  socket.onmessage?.({
    data: JSON.stringify({
      type: "error",
      message: "connect ECONNREFUSED 10.0.0.5:22",
    }),
  });
  socket.onclose?.({ code: 1000 });
  expect(failures).toEqual([
    expect.objectContaining({
      stage: "network",
      message: "connect ECONNREFUSED 10.0.0.5:22",
      origin: "relay",
    }),
  ]);
  m.destroy();

  const signedOut: any[] = [];
  const out = manager(fakeClient("https://termix.example/", null), {
    onConnectionFailed: (_m: string, f: unknown) => signedOut.push(f),
  });
  await out.m.connect(80, 24);
  expect(signedOut[0]).toMatchObject({ stage: "server", origin: "relay" });
});

test("the host config can be swapped for the server's before connecting", async () => {
  const { m } = manager(fakeClient(), {
    prepareHostConfig: async (config: any) => ({ ...config, id: 77 }),
  });
  await m.connect(80, 24);
  const socket = FakeSocket.all[0];
  socket.readyState = FakeSocket.OPEN;
  (socket as any).onopen?.();
  expect(socket.sent[0]).toMatchObject({
    type: "connectToHost",
    data: { hostConfig: { id: 77, name: "host" } },
  });
});

test("tmux session lists reach the tab and a pick goes back", async () => {
  const picked: unknown[] = [];
  const logs: unknown[] = [];
  const { m } = manager(fakeClient(), {
    onTmuxSessions: (s: unknown) => picked.push(s),
    onConnectionLog: (e: unknown) => logs.push(e),
  });
  await m.connect(80, 24);
  const socket = FakeSocket.all[0];
  socket.readyState = FakeSocket.OPEN;
  socket.onmessage?.({
    data: JSON.stringify({
      type: "tmux_sessions_available",
      sessions: [
        { name: "main", attachedClients: 1, lastActivity: 5, created: 1 },
        { bad: true },
      ],
    }),
  });
  expect(picked).toEqual([
    [{ name: "main", windows: undefined, attachedClients: 1, lastActivity: 5 }],
  ]);
  m.attachTmux("main");
  expect(socket.sent.at(-1)).toEqual({
    type: "tmux_attach",
    data: { sessionName: "main" },
  });
  socket.onmessage?.({ data: JSON.stringify({ type: "tmux_unavailable" }) });
  expect(logs).toHaveLength(1);
  m.destroy();
});

function say(socket: FakeSocket, msg: object) {
  socket.onmessage?.({ data: JSON.stringify(msg) });
}

function opened() {
  const socket = FakeSocket.all[0];
  socket.readyState = FakeSocket.OPEN;
  (socket as any).onopen?.();
  socket.sent.length = 0;
  return socket;
}

test.each([
  ["opkssh", "opkssh_status", "OPKSSH"],
  ["vault", "vault_auth_url", "Vault"],
  ["stepca", "stepca_status", "Step CA"],
])(
  "%s browser sign in: start, show the page, finish",
  async (id, urlEvent, title) => {
    const onBrowserCheckRequired = jest.fn();
    const onBrowserCheckCompleted = jest.fn();
    const { m, errors } = manager(fakeClient(), {
      onBrowserCheckRequired,
      onBrowserCheckCompleted,
    });
    await m.connect(100, 30);
    const socket = opened();

    say(socket, { type: `${id}_auth_required`, hostId: 1 });
    expect(socket.sent).toEqual([
      { type: `${id}_start_auth`, data: { hostId: 1 } },
    ]);

    say(socket, { type: urlEvent, stage: "chooser", url: "https://s/x" });
    expect(onBrowserCheckRequired).toHaveBeenCalledWith(
      "https://s/x",
      expect.stringContaining(title),
      `${title} sign in`,
    );

    say(socket, { type: `${id}_completed`, expiresAt: 1 });
    expect(onBrowserCheckCompleted).toHaveBeenCalled();
    expect(socket.sent[1]).toMatchObject({
      type: `${id}_auth_completed`,
      data: { hostId: 1, cols: 100, rows: 30 },
    });
    expect(errors).toEqual([]);
    m.destroy();
  },
);

test.each([
  ["opkssh_error", { error: "Denied" }, "host: Denied"],
  ["vault_config_error", {}, "host: Vault is not set up on the server"],
  ["stepca_timeout", {}, "host: Step CA sign in timed out"],
])("%s ends the connect with a message", async (type, extra, message) => {
  const { m, errors } = manager();
  await m.connect(80, 24);
  const socket = opened();
  say(socket, { type, ...extra });
  expect(errors).toEqual([message]);
  m.destroy();
});

test("closing during a sign in cancels it on the server", async () => {
  const { m } = manager();
  await m.connect(80, 24);
  const socket = opened();
  say(socket, { type: "opkssh_auth_required" });
  socket.sent.length = 0;
  m.destroy();
  expect(socket.sent[0]).toEqual({
    type: "opkssh_cancel",
    data: { hostId: 1 },
  });
});

test("a warpgate round with a url still goes to the warpgate prompt", async () => {
  const onWarpgateAuthRequired = jest.fn();
  const { m } = manager(fakeClient(), { onWarpgateAuthRequired });
  await m.connect(80, 24);
  const socket = opened();
  say(socket, {
    type: "warpgate_auth_required",
    url: "https://w",
    securityKey: "k",
  });
  expect(onWarpgateAuthRequired).toHaveBeenCalledWith("https://w", "k");
  m.destroy();
});

test("every control message goes out with its own type while open", async () => {
  const { m } = manager();
  await m.connect(80, 24);
  const socket = FakeSocket.all[0];
  // Nothing is sent before the socket opens.
  m.sendInput("early");
  openAndConnect(socket);
  const before = socket.sent.length;
  m.sendInput("ls\r");
  m.attachTmux("main");
  m.sendResize(120, 40);
  m.sendTotpResponse("123456", false);
  m.sendTotpResponse("hunter2", true);
  m.sendHostKeyResponse("accept");
  expect(socket.sent.slice(before)).toEqual([
    { type: "input", data: "ls\r" },
    { type: "tmux_attach", data: { sessionName: "main" } },
    { type: "resize", data: { cols: 120, rows: 40 } },
    { type: "totp_response", data: { code: "123456" } },
    { type: "password_response", data: { code: "hunter2" } },
    { type: "host_key_verification_response", data: { action: "accept" } },
  ]);
  expect(socket.sent.some((s) => s.data === "early")).toBe(false);
  m.destroy();
  expect(socket.sent.at(-1)).toEqual({ type: "disconnect" });
});

test("new credentials go over the open socket, or open a new one", async () => {
  const { m } = manager();
  await m.connect(80, 24);
  const socket = FakeSocket.all[0];
  openAndConnect(socket);
  m.sendReconnectWithCredentials({ password: "pw" }, 100, 30);
  expect(socket.sent.at(-1)).toMatchObject({
    type: "reconnect_with_credentials",
    data: { password: "pw", cols: 100, hostConfig: { authType: "password" } },
  });
  socket.readyState = FakeSocket.CLOSED;
  m.sendReconnectWithCredentials({ sshKey: "KEY" }, 100, 30);
  expect(FakeSocket.all).toHaveLength(2);
  m.destroy();
});
