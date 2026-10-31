import {
  HostConnection,
  reduceConnection,
  type ConnectionStatus,
  type HostConnectionOptions,
} from "@/core/transport/connection";
import type {
  ShellChannel,
  ShellOptions,
  Transport,
} from "@/core/transport/types";

const flush = () => new Promise((r) => setTimeout(r, 0));

/** A transport whose shells the test drives by hand. */
function fakeTransport(kind: Transport["kind"]) {
  const shells: {
    options: ShellOptions;
    channel: jest.Mocked<ShellChannel>;
  }[] = [];
  const transport: Transport = {
    kind,
    provides: ["shell"],
    available: true,
    openShell: (options) => {
      const channel = {
        connect: jest.fn(async () => {}),
        sendInput: jest.fn(),
        sendResize: jest.fn(),
        sendTotpResponse: jest.fn(),
        sendHostKeyResponse: jest.fn(),
        sendPassphraseResponse: jest.fn(),
        sendReconnectWithCredentials: jest.fn(),
        sendWarpgateContinue: jest.fn(),
        notifyBackgrounded: jest.fn(),
        notifyForegrounded: jest.fn(),
        destroy: jest.fn(),
      } as unknown as jest.Mocked<ShellChannel>;
      shells.push({ options, channel });
      return channel;
    },
  };
  return { transport, shells, last: () => shells[shells.length - 1] };
}

function setup(
  attempts: Transport[],
  over: Partial<HostConnectionOptions> = {},
) {
  const opts = {
    host: { id: 1, name: "Box", ip: "box.lan" } as any,
    plan: jest.fn(async () => ({ attempts })),
    onData: jest.fn(),
    onConnected: jest.fn(),
    onPostConnectionSetup: jest.fn(),
    onDisconnected: jest.fn(),
    onSessionIdChange: jest.fn(),
    onOriginResolved: jest.fn(),
    ...over,
  };
  const conn = new HostConnection(opts);
  return { conn, opts };
}

describe("reduceConnection", () => {
  const connecting: ConnectionStatus = {
    status: "connecting",
    origin: "local",
    attempt: 0,
    retry: 0,
  };

  test("moves through connect, prompt, answer and data", () => {
    let s = reduceConnection(
      { status: "idle" },
      {
        type: "start",
        origin: "local",
        attempt: 0,
      },
    );
    expect(s).toEqual(connecting);
    s = reduceConnection(s, {
      type: "prompt",
      prompt: { kind: "passphrase" },
    });
    expect(s).toEqual({
      status: "prompt",
      origin: "local",
      prompt: { kind: "passphrase" },
    });
    s = reduceConnection(s, { type: "answered" });
    expect(s.status).toBe("connecting");
    s = reduceConnection(s, { type: "connected" });
    expect(s).toEqual({ status: "connected", origin: "local", hasData: false });
    s = reduceConnection(s, { type: "data" });
    expect(s).toEqual({ status: "connected", origin: "local", hasData: true });
  });

  test("returns the same object when nothing changes", () => {
    const data: ConnectionStatus = {
      status: "connected",
      origin: "relay",
      hasData: true,
    };
    expect(reduceConnection(data, { type: "data" })).toBe(data);
    expect(reduceConnection(connecting, { type: "connecting", retry: 0 })).toBe(
      connecting,
    );
    expect(reduceConnection({ status: "idle" }, { type: "answered" })).toEqual({
      status: "idle",
    });
  });

  test("a failure is final until a reset", () => {
    const failed = reduceConnection(connecting, {
      type: "failed",
      failure: { stage: "auth", message: "no", hint: "h" },
    });
    expect(failed.status).toBe("failed");
    expect(
      reduceConnection(failed, {
        type: "prompt",
        prompt: { kind: "passphrase" },
      }),
    ).toBe(failed);
    expect(reduceConnection(failed, { type: "reset" })).toEqual({
      status: "idle",
    });
  });

  test("reconnect tries keep their count", () => {
    const connected: ConnectionStatus = {
      status: "connected",
      origin: "relay",
      hasData: true,
    };
    expect(
      reduceConnection(connected, { type: "connecting", retry: 2 }),
    ).toEqual({ status: "connecting", origin: "relay", attempt: 0, retry: 2 });
  });
});

describe("HostConnection", () => {
  test("connects through the first way and reports it", async () => {
    const local = fakeTransport("local");
    const { conn, opts } = setup([local.transport]);
    const changes = jest.fn();
    conn.subscribe(changes);
    await conn.connect(100, 30);
    const { options, channel } = local.last();
    expect(channel.connect).toHaveBeenCalledWith(100, 30);
    expect(opts.onOriginResolved).toHaveBeenCalledWith("local");
    expect(conn.state).toMatchObject({ status: "connecting", origin: "local" });
    // No fallback after it, so no short timeout.
    expect(options.connectTimeoutSecs).toBeUndefined();

    options.onStateChange("connected", { fromBackground: false });
    options.onStateChange("dataReceived");
    options.onData("hi");
    options.onPostConnectionSetup();
    expect(conn.state).toEqual({
      status: "connected",
      origin: "local",
      hasData: true,
    });
    expect(opts.onData).toHaveBeenCalledWith("hi");
    expect(opts.onConnected).toHaveBeenCalledWith({
      fromBackground: false,
      isReattach: false,
      resumed: false,
    });
    expect(opts.onPostConnectionSetup).toHaveBeenCalledWith({ resumed: false });
    expect(changes).toHaveBeenCalled();
    expect(conn.getSnapshot().log.map((e) => e.message)).toEqual([
      "Connecting to Box from this phone",
      "Connected",
    ]);
  });

  test("falls back to the server when the phone can't reach the host", async () => {
    const local = fakeTransport("local");
    const relay = fakeTransport("relay");
    const { conn, opts } = setup([local.transport, relay.transport]);
    await conn.connect(80, 24);
    expect(local.last().options.connectTimeoutSecs).toBe(8);

    local.last().options.onConnectionFailed("Box: timed out", {
      stage: "network",
      message: "timed out",
      hint: "h",
    });
    expect(local.last().channel.destroy).toHaveBeenCalled();
    expect(relay.shells).toHaveLength(1);
    expect(relay.last().channel.connect).toHaveBeenCalledWith(80, 24);
    expect(relay.last().options.connectTimeoutSecs).toBeUndefined();
    expect((opts.onOriginResolved as jest.Mock).mock.calls).toEqual([
      ["local"],
      ["relay"],
    ]);
    expect(conn.state).toMatchObject({ status: "connecting", origin: "relay" });
    expect(conn.getSnapshot().log.map((e) => e.message)).toContain(
      "Could not reach the host from this phone, trying through the server",
    );

    // Late events from the dropped shell are ignored.
    local.last().options.onStateChange("connected");
    expect(conn.state.status).toBe("connecting");
  });

  test("no fallback after a login was refused or the user was asked", async () => {
    const local = fakeTransport("local");
    const relay = fakeTransport("relay");
    const { conn } = setup([local.transport, relay.transport]);
    await conn.connect(80, 24);
    local.last().options.onConnectionFailed("Box: no", {
      stage: "auth",
      message: "no",
      hint: "Check the login",
    });
    expect(relay.shells).toHaveLength(0);
    expect(conn.state).toEqual({
      status: "failed",
      failure: {
        stage: "auth",
        message: "no",
        hint: "Check the login",
        origin: "local",
      },
      fix: undefined,
    });

    const again = setup([local.transport, relay.transport]);
    await again.conn.connect(80, 24);
    local.last().options.onTotpRequired("Code:", false);
    local.last().options.onConnectionFailed("Box: timed out", {
      stage: "network",
      message: "timed out",
      hint: "h",
    });
    expect(relay.shells).toHaveLength(0);
    expect(again.conn.state.status).toBe("failed");
  });

  test("prompts wait for an answer and pass it on", async () => {
    const t = fakeTransport("relay");
    const { conn } = setup([t.transport]);
    await conn.connect(80, 24);
    const { options, channel } = t.last();

    options.onTotpRequired("Password:", true);
    expect(conn.state).toMatchObject({
      status: "prompt",
      prompt: { kind: "totp", isPassword: true },
    });
    conn.answerTotp("pw");
    expect(channel.sendTotpResponse).toHaveBeenCalledWith("pw", true);
    expect(conn.state.status).toBe("connecting");

    options.onAuthDialogNeeded("no_keyboard");
    conn.answerAuth({ password: "x" });
    expect(channel.sendReconnectWithCredentials).toHaveBeenCalledWith(
      { password: "x" },
      80,
      24,
    );

    options.onPassphraseRequired!();
    conn.answerPassphrase("pp");
    expect(channel.sendPassphraseResponse).toHaveBeenCalledWith("pp");

    options.onWarpgateAuthRequired!("https://wg", "key");
    expect(conn.state).toMatchObject({
      prompt: { kind: "warpgate", url: "https://wg", securityKey: "key" },
    });
    conn.continueBrowserSignIn();
    expect(channel.sendWarpgateContinue).toHaveBeenCalled();

    options.onBrowserCheckRequired!("https://ts", "visit");
    expect(conn.state).toMatchObject({ prompt: { kind: "browserCheck" } });
    options.onBrowserCheckCompleted!();
    expect(conn.state.status).toBe("connecting");

    options.onHostKeyVerificationRequired!("new", { fingerprint: "f" } as any);
    conn.answerHostKey(true);
    expect(channel.sendHostKeyResponse).toHaveBeenCalledWith("accept");
    expect(conn.state.status).toBe("connecting");
  });

  test("refusing a host key or closing a prompt ends in a clear failure", async () => {
    const t = fakeTransport("local");
    const { conn } = setup([t.transport]);
    await conn.connect(80, 24);
    t.last().options.onHostKeyVerificationRequired!("changed", {} as any);
    conn.answerHostKey(false);
    expect(t.last().channel.sendHostKeyResponse).toHaveBeenCalledWith("reject");
    expect(conn.state).toMatchObject({
      status: "failed",
      failure: { stage: "hostKey", origin: "local" },
    });

    const other = setup([t.transport]);
    await other.conn.connect(80, 24);
    t.last().options.onPassphraseRequired!();
    other.conn.cancel();
    expect(other.conn.state).toMatchObject({
      status: "failed",
      failure: { stage: "cancelled" },
    });
    expect(t.last().channel.destroy).toHaveBeenCalled();
  });

  test("a blocked plan fails right away with its fix, no spinner", async () => {
    const { conn } = setup([], {
      plan: async () => ({
        attempts: [],
        blocked: { reason: "Sync the server first", fix: "server" },
      }),
    });
    await conn.connect(80, 24);
    expect(conn.state).toEqual({
      status: "failed",
      failure: expect.objectContaining({
        stage: "unavailable",
        message: "Sync the server first",
      }),
      fix: "server",
    });
  });

  test("a shell that throws on open is reported, not left spinning", async () => {
    const broken: Transport = {
      kind: "local",
      provides: ["shell"],
      available: true,
      openShell: () => {
        throw new Error("no engine");
      },
    };
    const { conn } = setup([broken]);
    await conn.connect(80, 24);
    expect(conn.state).toMatchObject({
      status: "failed",
      failure: { stage: "unavailable", message: "no engine", origin: "local" },
    });
  });

  test("relay failures without details get mapped from the message", async () => {
    const t = fakeTransport("relay");
    const { conn } = setup([t.transport]);
    await conn.connect(80, 24);
    t.last().options.onConnectionFailed(
      "Maximum reconnection attempts reached",
    );
    expect(conn.state).toMatchObject({
      status: "failed",
      failure: { stage: "server", origin: "relay" },
    });
  });

  test("retry plans again and starts fresh", async () => {
    const local = fakeTransport("local");
    const relay = fakeTransport("relay");
    let attempts = [local.transport];
    const { conn, opts } = setup([], {
      plan: jest.fn(async () => ({ attempts })),
    });
    await conn.connect(80, 24);
    local.last().options.onConnectionFailed("x", {
      stage: "network",
      message: "x",
      hint: "h",
    });
    expect(conn.state.status).toBe("failed");

    attempts = [relay.transport];
    await conn.retry();
    expect(opts.plan).toHaveBeenCalledTimes(2);
    // The log is kept across a retry, for bug reports.
    const messages = conn.getSnapshot().log.map((e) => e.message);
    expect(messages[0]).toBe("Connecting to Box from this phone");
    expect(messages.at(-1)).toBe("Connecting to Box through the server");
    expect(relay.last().channel.connect).toHaveBeenCalledWith(80, 24);
    expect(conn.state).toMatchObject({ status: "connecting", origin: "relay" });
  });

  test("passes input, size, app state and the session id through", async () => {
    const t = fakeTransport("relay");
    const { conn, opts } = setup([t.transport], {
      initialSessionId: "s1",
      tabInstanceId: "tab",
      pipeId: "pipe",
      protocol: "telnet",
    });
    await conn.connect(80, 24);
    const { options, channel } = t.last();
    expect(options.initialSessionId).toBe("s1");
    expect(options.tabInstanceId).toBe("tab");
    expect(options.pipeId).toBe("pipe");
    expect(options.protocol).toBe("telnet");

    // Typed before the shell is up: kept, then sent once it is.
    conn.sendInput("ls\r");
    expect(channel.sendInput).not.toHaveBeenCalled();
    expect(conn.getSnapshot().pending).toBe(3);
    options.onStateChange("connected");
    expect(channel.sendInput).toHaveBeenCalledWith("ls\r");
    expect(conn.getSnapshot().pending).toBe(0);
    conn.resize(120, 40);
    conn.notifyBackgrounded();
    conn.notifyForegrounded();
    expect(channel.sendResize).toHaveBeenCalledWith(120, 40);
    expect(channel.notifyBackgrounded).toHaveBeenCalled();
    expect(channel.notifyForegrounded).toHaveBeenCalled();

    // A second ready from the view only resizes.
    await conn.connect(100, 50);
    expect(t.shells).toHaveLength(1);
    expect(channel.sendResize).toHaveBeenLastCalledWith(100, 50);

    options.onSessionIdChange!("s2");
    expect(opts.onSessionIdChange).toHaveBeenCalledWith("s2");
  });

  test("a closed shell ends the connection; destroy drops it", async () => {
    const t = fakeTransport("relay");
    const { conn, opts } = setup([t.transport]);
    await conn.connect(80, 24);
    t.last().options.onDisconnected("Box");
    expect(conn.state).toEqual({ status: "closed" });
    expect(opts.onDisconnected).toHaveBeenCalledWith("Box");

    const other = setup([t.transport]);
    await other.conn.connect(80, 24);
    other.conn.destroy();
    expect(t.last().channel.destroy).toHaveBeenCalled();
    t.last().options.onStateChange("connected");
    expect(other.conn.state.status).toBe("connecting");
    await flush();
  });
});

describe("reduceConnection reconnect states", () => {
  const connected: ConnectionStatus = {
    status: "connected",
    origin: "local",
    hasData: true,
  };

  test("reconnecting keeps the origin and a running try drops the countdown", () => {
    const waiting = reduceConnection(connected, {
      type: "reconnecting",
      attempt: 2,
      nextAt: 5000,
      reason: "gone",
    });
    expect(waiting).toEqual({
      status: "reconnecting",
      origin: "local",
      attempt: 2,
      nextAt: 5000,
      reason: "gone",
    });
    expect(
      reduceConnection(waiting, {
        type: "reconnecting",
        attempt: 2,
        nextAt: 5000,
        reason: "gone",
      }),
    ).toBe(waiting);
    // The new shell saying it is connecting keeps the reconnect status.
    const trying = reduceConnection(waiting, { type: "connecting", retry: 0 });
    expect(trying).toMatchObject({ status: "reconnecting", nextAt: null });
    expect(reduceConnection(trying, { type: "connecting", retry: 0 })).toBe(
      trying,
    );
  });

  test("offline keeps the origin; nothing to go offline from without one", () => {
    expect(
      reduceConnection(connected, { type: "offline", reason: "gone" }),
    ).toEqual({ status: "offline", origin: "local", reason: "gone" });
    const idle: ConnectionStatus = { status: "idle" };
    expect(reduceConnection(idle, { type: "offline", reason: "x" })).toBe(idle);
    expect(
      reduceConnection(idle, {
        type: "reconnecting",
        attempt: 1,
        nextAt: null,
        reason: "x",
      }),
    ).toBe(idle);
  });
});

describe("HostConnection reconnect", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  async function connected(
    kind: Transport["kind"] = "local",
    over: Partial<HostConnectionOptions> = {},
  ) {
    const t = fakeTransport(kind);
    const { conn, opts } = setup([t.transport], over);
    await conn.connect(80, 24);
    t.last().options.onStateChange("connected");
    return { t, conn, opts };
  }

  const drop = (t: ReturnType<typeof fakeTransport>, reason = "gone") =>
    t.last().options.onDropped!({ kind: "network", reason });

  test("a drop reconnects right away, then backs off, and only one try runs", async () => {
    const { t, conn } = await connected();
    drop(t);
    expect(t.shells).toHaveLength(2);
    expect(t.shells[0].channel.destroy).toHaveBeenCalled();
    expect(t.last().options.resume).toBe(true);
    expect(conn.state).toMatchObject({
      status: "reconnecting",
      attempt: 1,
      nextAt: null,
      reason: "gone",
    });

    t.last().options.onConnectionFailed("x", {
      stage: "network",
      message: "timed out",
      hint: "h",
    });
    expect(conn.state).toMatchObject({ status: "reconnecting", attempt: 2 });
    expect((conn.state as any).nextAt).not.toBeNull();
    expect(t.shells).toHaveLength(2);

    // Reconnect now starts the try; pressing it again does not start a second one.
    conn.reconnectNow();
    conn.reconnectNow();
    expect(t.shells).toHaveLength(3);
    jest.advanceTimersByTime(60000);
    expect(t.shells).toHaveLength(3);
  });

  test("gives up after the last try with the reason", async () => {
    const { t, conn } = await connected();
    drop(t, "reset by peer");
    for (let i = 0; i < 12; i++) {
      t.last().options.onConnectionFailed("x", {
        stage: "network",
        message: "reset by peer",
        hint: "h",
      });
      jest.advanceTimersByTime(120000);
    }
    expect(conn.state).toMatchObject({
      status: "failed",
      failure: { stage: "session", message: "reset by peer" },
    });
    // Ten tries after the drop, plus the first shell.
    expect(t.shells).toHaveLength(11);
  });

  test("a refused login while reconnecting fails at once", async () => {
    const { t, conn } = await connected();
    drop(t);
    t.last().options.onConnectionFailed("x", {
      stage: "auth",
      message: "no",
      hint: "h",
    });
    expect(conn.state).toMatchObject({
      status: "failed",
      failure: { stage: "auth" },
    });
  });

  test("a session another device took over is not retried", async () => {
    const { t, conn } = await connected("relay");
    t.last().options.onConnectionFailed("taken", {
      stage: "session",
      message: "taken",
      hint: "h",
      noRetry: true,
    });
    expect(conn.state.status).toBe("failed");
    jest.advanceTimersByTime(60000);
    expect(t.shells).toHaveLength(1);
  });

  test("offline waits without using tries and goes again when the network is back", async () => {
    const { t, conn } = await connected();
    conn.notifyNetworkChanged({
      connected: false,
      type: "none",
      vpn: false,
      changed: true,
    });
    drop(t);
    expect(conn.state).toMatchObject({ status: "offline", reason: "gone" });
    jest.advanceTimersByTime(600000);
    expect(t.shells).toHaveLength(1);

    conn.notifyNetworkChanged({
      connected: true,
      type: "mobile data",
      vpn: false,
      changed: true,
    });
    expect(t.shells).toHaveLength(2);
    expect(conn.state).toMatchObject({ status: "reconnecting", attempt: 1 });
    expect(conn.getSnapshot().log.map((e) => e.message)).toEqual(
      expect.arrayContaining([
        "Network lost",
        "Offline, waiting for the network",
        "Network: mobile data",
      ]),
    );
  });

  test("a network change or coming back probes a live shell and reconnects when it is dead", async () => {
    const { t, conn } = await connected();
    const probe = jest.fn(async () => true);
    (t.last().channel as any).probe = probe;
    conn.notifyNetworkChanged({
      connected: true,
      type: "Wi-Fi",
      vpn: false,
      changed: false,
    });
    expect(probe).not.toHaveBeenCalled();
    conn.notifyNetworkChanged({
      connected: true,
      type: "mobile data",
      vpn: false,
      changed: true,
    });
    expect(probe).toHaveBeenCalledWith(3000);
    await Promise.resolve();
    expect(t.shells).toHaveLength(1);

    probe.mockResolvedValueOnce(false);
    conn.notifyForegrounded();
    await Promise.resolve();
    await Promise.resolve();
    expect(t.shells).toHaveLength(2);
    expect(conn.state.status).toBe("reconnecting");
  });

  test("coming back while waiting tries now", async () => {
    const { t, conn } = await connected();
    drop(t);
    t.last().options.onConnectionFailed("x", {
      stage: "network",
      message: "x",
      hint: "h",
    });
    expect(t.shells).toHaveLength(2);
    conn.notifyBackgrounded();
    conn.notifyForegrounded();
    expect(t.shells).toHaveLength(3);
  });

  test("input typed while reconnecting goes to the same session on its own", async () => {
    const { t, conn, opts } = await connected("relay");
    drop(t);
    conn.sendInput("ls");
    conn.sendInput("\r");
    expect(conn.getSnapshot()).toMatchObject({
      pending: 3,
      pendingHeld: false,
    });
    t.last().options.onStateChange("connected", { isReattach: true });
    expect(t.last().channel.sendInput).toHaveBeenCalledWith("ls\r");
    expect(conn.getSnapshot().pending).toBe(0);
    expect(opts.onConnected).toHaveBeenLastCalledWith({
      fromBackground: false,
      isReattach: true,
      resumed: true,
    });
  });

  test("input for a new shell waits for send or discard and keeps its order", async () => {
    const { t, conn, opts } = await connected();
    drop(t);
    conn.sendInput("rm x");
    t.last().options.onStateChange("connected");
    t.last().options.onPostConnectionSetup();
    expect(opts.onPostConnectionSetup).toHaveBeenLastCalledWith({
      resumed: true,
    });
    const channel = t.last().channel;
    expect(channel.sendInput).not.toHaveBeenCalled();
    expect(conn.getSnapshot()).toMatchObject({ pending: 4, pendingHeld: true });

    conn.sendInput("!");
    expect(channel.sendInput).not.toHaveBeenCalled();
    // Startup lines skip the queue.
    conn.sendNow("echo hi\r");
    expect(channel.sendInput).toHaveBeenCalledWith("echo hi\r");

    conn.discardInput();
    expect(conn.getSnapshot()).toMatchObject({
      pending: 0,
      pendingHeld: false,
    });
    conn.sendInput("ok");
    expect(channel.sendInput).toHaveBeenLastCalledWith("ok");

    drop(t);
    conn.sendInput("again");
    t.last().options.onStateChange("connected");
    conn.flushInput();
    expect(t.last().channel.sendInput).toHaveBeenCalledWith("again");
  });

  test("the queue holds at most 64 KB, dropping the oldest part", async () => {
    const { t, conn } = await connected();
    drop(t);
    conn.sendInput("a".repeat(64 * 1024));
    conn.sendInput("bc");
    expect(conn.getSnapshot().pending).toBe(64 * 1024);
    expect(
      conn.getSnapshot().log.some((e) => e.message.includes("over 64 KB")),
    ).toBe(true);
    conn.discardInput();
    // Nothing is kept for a failed or closed connection.
    t.last().options.onConnectionFailed("x", {
      stage: "auth",
      message: "no",
      hint: "h",
    });
    conn.sendInput("x");
    expect(conn.getSnapshot().pending).toBe(0);
  });

  test("a restored tab's first connect is a resume and retries", async () => {
    const t = fakeTransport("relay");
    const { conn, opts } = setup([t.transport], {
      restored: true,
      initialSessionId: "s1",
    });
    await conn.connect(80, 24);
    expect(t.last().options.resume).toBe(true);
    expect(t.last().options.initialSessionId).toBe("s1");
    t.last().options.onConnectionFailed("Connection closed (1006)");
    expect(conn.state).toMatchObject({ status: "reconnecting", attempt: 1 });
    expect(t.shells).toHaveLength(2);
    t.last().options.onStateChange("connected", { isReattach: true });
    expect(opts.onConnected).toHaveBeenCalledWith({
      fromBackground: false,
      isReattach: true,
      resumed: true,
    });
  });

  test("low power waits longer and reaches the shell", async () => {
    const { t, conn } = await connected();
    const setLowPower = jest.fn();
    (t.last().channel as any).setLowPower = setLowPower;
    conn.setLowPower(true);
    expect(setLowPower).toHaveBeenCalledWith(true);
    drop(t);
    expect(t.last().channel.setLowPower).toBeUndefined();
    t.last().options.onConnectionFailed("x", {
      stage: "network",
      message: "x",
      hint: "h",
    });
    const s = conn.state as any;
    // Normal wait for try 2 is about a second; low power doubles it.
    expect(s.nextAt - Date.now()).toBeGreaterThanOrEqual(1600);
  });

  test("a Tailscale host that can't be reached says to check Tailscale", async () => {
    const t = fakeTransport("local");
    const { conn } = setup([t.transport], {
      host: { id: 1, name: "Box", ip: "100.78.68.100" } as any,
    });
    await conn.connect(80, 24);
    t.last().options.onConnectionFailed("x", {
      stage: "network",
      message: "timed out",
      hint: "h",
    });
    expect(conn.state).toMatchObject({
      failure: { hint: expect.stringContaining("Tailscale") },
    });

    const vpn = fakeTransport("local");
    const other = setup([vpn.transport], {
      host: { id: 1, name: "Box", ip: "100.78.68.100" } as any,
    });
    other.conn.notifyNetworkChanged({
      connected: true,
      type: "VPN",
      vpn: true,
      changed: false,
    });
    await other.conn.connect(80, 24);
    vpn.last().options.onConnectionFailed("x", {
      stage: "network",
      message: "timed out",
      hint: "h",
    });
    expect(other.conn.state).toMatchObject({ failure: { hint: "h" } });
  });

  test("the log keeps the last 500 lines", async () => {
    const { conn } = await connected();
    for (let i = 0; i < 600; i++) {
      conn.log({ level: "info", message: `line ${i}` });
    }
    const log = conn.getSnapshot().log;
    expect(log).toHaveLength(500);
    expect(log.at(-1)?.message).toBe("line 599");
  });
});
