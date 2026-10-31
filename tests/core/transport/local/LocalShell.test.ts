import { SHELL_CWD_COMMAND } from "@/core/transport/local/shell-cwd";
import type { HostConnectProfile } from "@/core/data/types";
import { LocalShell, Utf8Stream } from "@/core/transport/local/LocalShell";
import { createLocalTransport } from "@/core/transport/local";
import type { ShellOptions } from "@/core/transport/types";
import { SshError, type SshPrompts } from "@/modules/termix-ssh";

const mockConnect = jest.fn();
jest.mock("@/modules/termix-ssh", () => ({
  ...jest.requireActual("@/modules/termix-ssh"),
  connect: (...args: unknown[]) => mockConnect(...args),
}));

const hostKey = {
  host: "box.lan",
  port: 22,
  keyType: "ssh-ed25519",
  blobHex: "abcd",
  sha256: "SHA256:k",
  isCertificate: false,
  caSha256: null,
  principals: [],
};

const flush = () => new Promise((r) => setTimeout(r, 0));
const enc = (s: string) => new TextEncoder().encode(s);

/** A fake engine session that records what the shell does with it. */
function fakeSession() {
  const drops = new Set<(i: { kind: string; reason: string }) => void>();
  const shell = {
    handlers: null as any,
    write: jest.fn(async () => {}),
    resize: jest.fn(async () => {}),
    close: jest.fn(async () => {}),
    release: jest.fn(),
  };
  const s = {
    hostKey,
    isClosed: false,
    shell,
    connectVia: jest.fn(),
    openShell: jest.fn(async (_o: unknown, handlers: unknown) => {
      shell.handlers = handlers;
      return shell;
    }),
    onDisconnect: (l: any) => {
      drops.add(l);
      return () => drops.delete(l);
    },
    drop: (kind = "network") =>
      drops.forEach((l) => l({ kind, reason: "gone" })),
    disconnect: jest.fn(async () => {}),
    ping: jest.fn(async () => {}),
    exec: jest.fn(),
    sftp: { list: jest.fn() },
  };
  return s;
}

function profile(over: Partial<HostConnectProfile["host"]> = {}) {
  return {
    host: {
      id: 7,
      name: "Box",
      ip: "box.lan",
      port: 22,
      username: "root",
      authType: "password",
      password: "saved",
      jumpHosts: [],
      ...over,
    } as any,
    credential: null,
    sshOptions: {},
    socks5: { use: false, chain: [] },
    portKnock: [],
    hostKey: null,
  } as HostConnectProfile;
}

function setup(
  profiles: Record<number, HostConnectProfile> = { 7: profile() },
  extra: Partial<ShellOptions> = {},
) {
  const repo = {
    profile: jest.fn(async (id: number) => profiles[id] ?? null),
    saveHostKey: jest.fn(async () => {}),
    touchHostKey: jest.fn(async () => {}),
  };
  const events = {
    onStateChange: jest.fn(),
    onData: jest.fn(),
    onTotpRequired: jest.fn(),
    onAuthDialogNeeded: jest.fn(),
    onHostKeyVerificationRequired: jest.fn(),
    onPassphraseRequired: jest.fn(),
    onPostConnectionSetup: jest.fn(),
    onDisconnected: jest.fn(),
    onConnectionFailed: jest.fn(),
    onConnectionLog: jest.fn(),
    onBrowserCheckRequired: jest.fn(),
    onBrowserCheckCompleted: jest.fn(),
  };
  const options: ShellOptions = {
    hostConfig: {
      id: 7,
      name: "Box",
      ip: "box.lan",
      port: 22,
      username: "root",
      authType: "password",
    },
    ...events,
    ...extra,
  };
  const shell = new LocalShell(options, () => repo);
  return { shell, repo, events };
}

beforeEach(() => mockConnect.mockReset());

test("connects, trusts a first key, opens a shell and streams text", async () => {
  const s = fakeSession();
  mockConnect.mockImplementation(async (_c: unknown, prompts: SshPrompts) => {
    expect(await prompts.verifyHostKey(hostKey)).toBe(true);
    return s;
  });
  const { shell, repo, events } = setup();
  events.onHostKeyVerificationRequired.mockImplementation(() =>
    shell.sendHostKeyResponse("accept"),
  );

  await shell.connect(100, 30);

  expect(mockConnect.mock.calls[0][0]).toMatchObject({
    host: "box.lan",
    username: "root",
    password: "saved",
  });
  expect(events.onHostKeyVerificationRequired).toHaveBeenCalledWith(
    "new",
    expect.objectContaining({ fingerprint: "SHA256:k" }),
  );
  expect(repo.saveHostKey).toHaveBeenCalledWith(
    7,
    { fingerprint: "abcd", keyType: "ssh-ed25519" },
    false,
  );
  expect(s.openShell).toHaveBeenCalledWith(
    { cols: 100, rows: 30, env: { COLORTERM: "truecolor" } },
    expect.anything(),
  );
  expect(events.onStateChange).toHaveBeenCalledWith("connected", {
    hostName: "Box",
    fromBackground: false,
    isReattach: false,
  });
  expect(events.onPostConnectionSetup).toHaveBeenCalledTimes(1);

  const bytes = enc("héllo");
  s.shell.handlers.onData(bytes.subarray(0, 2));
  s.shell.handlers.onData(bytes.subarray(2));
  expect(events.onData.mock.calls.map((c) => c[0]).join("")).toBe("héllo");
  expect(events.onStateChange).toHaveBeenCalledWith("dataReceived", {
    hostName: "Box",
  });

  shell.sendInput("ls\r");
  expect(s.shell.write).toHaveBeenCalledWith(enc("ls\r"));
  shell.sendResize(120, 40);
  expect(s.shell.resize).toHaveBeenCalledWith(120, 40);

  s.shell.handlers.onExit(0, null);
  expect(events.onDisconnected).toHaveBeenCalledWith("Box");
  expect(s.disconnect).toHaveBeenCalled();
});

test("a piped shell sends output to the view and reports its first data", async () => {
  const s = fakeSession();
  mockConnect.mockResolvedValue(s);
  const { shell, events } = setup(undefined, { pipeId: "tab-1" });
  events.onHostKeyVerificationRequired.mockImplementation(() =>
    shell.sendHostKeyResponse("accept"),
  );

  await shell.connect(80, 24);

  expect(s.openShell).toHaveBeenCalledWith(
    { cols: 80, rows: 24, env: { COLORTERM: "truecolor" }, pipeId: "tab-1" },
    expect.anything(),
  );
  s.shell.handlers.onActive();
  s.shell.handlers.onActive();
  expect(
    events.onStateChange.mock.calls.filter((c) => c[0] === "dataReceived"),
  ).toHaveLength(1);
  expect(events.onData).not.toHaveBeenCalled();
});

test("keyboard-interactive asks codes and says when one was wrong", async () => {
  const s = fakeSession();
  const answers: (string[] | null)[] = [];
  mockConnect.mockImplementation(async (_c: unknown, prompts: SshPrompts) => {
    const round = (prompt: string) =>
      prompts.keyboardInteractive({
        name: "",
        instructions: "",
        prompts: [{ prompt, echo: false }],
        round: 0,
      });
    answers.push(await round("Password: "));
    answers.push(await round("Verification code: "));
    answers.push(await round("Verification code: "));
    return s;
  });
  const { shell, events } = setup();
  events.onTotpRequired.mockImplementation(() =>
    setTimeout(() => shell.sendTotpResponse(" 123456 ")),
  );

  await shell.connect(80, 24);

  expect(answers).toEqual([["saved"], ["123456"], ["123456"]]);
  expect(events.onTotpRequired.mock.calls).toEqual([
    ["Verification code: ", false],
    ["Invalid code, try again:", false],
  ]);
});

test("a host with nothing to offer asks for a login and retries with it", async () => {
  const s = fakeSession();
  mockConnect
    .mockRejectedValueOnce(new SshError("authMethodNotAvailable", "no"))
    .mockResolvedValueOnce(s);
  const { shell, events } = setup({
    7: profile({ authType: "none", password: undefined }),
  });

  await shell.connect(80, 24);
  expect(events.onAuthDialogNeeded).toHaveBeenCalledWith("no_keyboard");
  expect(events.onConnectionFailed).not.toHaveBeenCalled();

  shell.sendReconnectWithCredentials({ password: "typed" }, 90, 30);
  await flush();
  await flush();
  expect(mockConnect.mock.calls[1][0]).toMatchObject({ password: "typed" });
  expect(s.openShell).toHaveBeenCalledWith(
    expect.objectContaining({ cols: 90, rows: 30 }),
    expect.anything(),
  );
});

test("a locked key asks for its passphrase", async () => {
  const s = fakeSession();
  mockConnect
    .mockRejectedValueOnce(new SshError("passphraseRequired", "locked"))
    .mockResolvedValueOnce(s);
  const { shell, events } = setup({
    7: profile({ authType: "key", key: "KEY", password: undefined }),
  });
  await shell.connect(80, 24);
  expect(events.onPassphraseRequired).toHaveBeenCalled();

  shell.sendPassphraseResponse("pp");
  await flush();
  await flush();
  expect(mockConnect.mock.calls[1][0]).toMatchObject({
    privateKey: "KEY",
    passphrase: "pp",
  });
});

test("failed logins and refused keys are reported once with the host name", async () => {
  mockConnect.mockRejectedValue(new SshError("auth", "password refused"));
  const { shell, events } = setup();
  await shell.connect(80, 24);
  expect(events.onConnectionFailed).toHaveBeenCalledWith(
    "Box: Authentication failed: password refused",
    expect.objectContaining({ stage: "auth", origin: "local" }),
  );

  mockConnect.mockRejectedValue(new SshError("hostKeyRejected", "no"));
  const other = setup();
  await other.shell.connect(80, 24);
  expect(other.events.onConnectionFailed).toHaveBeenCalledWith(
    "Box: The host key was not trusted.",
    expect.objectContaining({ stage: "hostKey" }),
  );
});

test("jump hosts connect in order and save their first key quietly", async () => {
  const hop = fakeSession();
  const target = fakeSession();
  hop.connectVia.mockImplementation(async () => target);
  mockConnect.mockImplementation(async (_c: unknown, prompts: SshPrompts) => {
    await prompts.verifyHostKey(hostKey);
    return hop;
  });
  const { shell, repo, events } = setup({
    7: profile({ jumpHosts: [{ hostId: 3 }] }),
    3: profile({ id: 3, ip: "jump.lan", username: "j", password: "jp" }),
  });

  await shell.connect(80, 24);
  expect(mockConnect.mock.calls[0][0]).toMatchObject({
    host: "jump.lan",
    username: "j",
  });
  expect(hop.connectVia.mock.calls[0][0]).toMatchObject({ host: "box.lan" });
  expect(repo.saveHostKey).toHaveBeenCalledWith(3, expect.anything(), false);
  expect(events.onHostKeyVerificationRequired).not.toHaveBeenCalled();
  expect(target.openShell).toHaveBeenCalled();

  shell.destroy();
  expect(target.disconnect).toHaveBeenCalled();
  expect(hop.disconnect).toHaveBeenCalled();
});

test("a missing jump host stops the login", async () => {
  const { shell, events } = setup({
    7: profile({ jumpHosts: [{ hostId: 99 }] }),
  });
  await shell.connect(80, 24);
  expect(mockConnect).not.toHaveBeenCalled();
  expect(events.onConnectionFailed).toHaveBeenCalledWith(
    "Box: A jump host of this host no longer exists.",
    expect.objectContaining({ stage: "unavailable" }),
  );
});

test("a drop is reported once and the shell does not log in again itself", async () => {
  const s = fakeSession();
  mockConnect.mockResolvedValue(s);
  const onDropped = jest.fn();
  const { shell, events } = setup(undefined, { onDropped });
  await shell.connect(80, 24);
  expect(events.onPostConnectionSetup).toHaveBeenCalledTimes(1);

  s.drop();
  s.drop();
  s.shell.handlers.onExit(null, null);
  await flush();
  expect(onDropped).toHaveBeenCalledTimes(1);
  expect(onDropped).toHaveBeenCalledWith({ kind: "network", reason: "gone" });
  expect(s.shell.release).toHaveBeenCalled();
  expect(s.disconnect).toHaveBeenCalled();
  expect(events.onDisconnected).not.toHaveBeenCalled();
  expect(mockConnect).toHaveBeenCalledTimes(1);
});

test("a channel cut with no exit status is a drop; an exit status ends the shell", async () => {
  const cut = fakeSession();
  mockConnect.mockResolvedValue(cut);
  const onDropped = jest.fn();
  const a = setup(undefined, { onDropped });
  await a.shell.connect(80, 24);
  cut.shell.handlers.onExit(null, null);
  expect(onDropped).toHaveBeenCalledWith({
    kind: "ended",
    reason: "The shell channel closed",
  });
  expect(a.events.onDisconnected).not.toHaveBeenCalled();

  const done = fakeSession();
  mockConnect.mockResolvedValue(done);
  const b = setup(undefined, { onDropped: jest.fn() });
  await b.shell.connect(80, 24);
  done.shell.handlers.onExit(0, null);
  expect(b.events.onDisconnected).toHaveBeenCalledWith("Box");
});

test("probe pings the connection and is false once it dropped", async () => {
  const s = fakeSession();
  mockConnect.mockResolvedValue(s);
  const { shell } = setup(undefined, { onDropped: jest.fn() });
  await shell.connect(80, 24);
  await expect(shell.probe(3000)).resolves.toBe(true);
  expect(s.ping).toHaveBeenCalledWith(3);

  s.ping.mockRejectedValueOnce(new Error("timeout"));
  await expect(shell.probe(3000)).resolves.toBe(false);

  s.drop();
  await expect(shell.probe(3000)).resolves.toBe(false);
});

test("closing the tab mid prompt cancels the login quietly", async () => {
  let aborted = false;
  mockConnect.mockImplementation(
    (_c: unknown, prompts: SshPrompts, opts: { signal: AbortSignal }) =>
      new Promise((_r, reject) => {
        opts.signal.addEventListener("abort", () => {
          aborted = true;
          reject(new SshError("cancelled", "Cancelled"));
        });
        prompts.verifyHostKey(hostKey);
      }),
  );
  const { shell, events } = setup();
  const done = shell.connect(80, 24);
  await flush();
  expect(events.onHostKeyVerificationRequired).toHaveBeenCalled();
  shell.destroy();
  await done;
  expect(aborted).toBe(true);
  expect(events.onConnectionFailed).not.toHaveBeenCalled();
});

test("a shorter connect timeout applies when there is a fallback", async () => {
  mockConnect.mockRejectedValue(new SshError("timeout", "timed out"));
  const { events, repo } = setup();
  const shell = new LocalShell(
    {
      ...events,
      hostConfig: { id: 7, name: "Box", ip: "box.lan" } as any,
      connectTimeoutSecs: 8,
    },
    () => repo,
  );
  await shell.connect(80, 24);
  expect(mockConnect.mock.calls[0][0]).toMatchObject({ connectTimeoutSecs: 8 });
  expect(events.onConnectionFailed).toHaveBeenCalledWith(
    "Box: timed out",
    expect.objectContaining({ stage: "network" }),
  );
});

test("UTF-8 split across chunks decodes whole", () => {
  const d = new Utf8Stream();
  const bytes = enc("a€b😀");
  let out = "";
  for (const b of bytes) out += d.decode(new Uint8Array([b]));
  expect(out).toBe("a€b😀");
});

describe("local transport", () => {
  test("is unavailable without the engine", () => {
    const t = createLocalTransport(false);
    expect(t.available).toBe(false);
    expect(t.unavailableReason).toMatch(/no SSH engine/);
    expect(() => t.openShell({} as ShellOptions)).toThrow(/no SSH engine/);
  });

  test("background sessions answer prompts alone and never ask about keys", async () => {
    const s = fakeSession();
    let kbd: string[] | null = null;
    let trusted: boolean | null = null;
    mockConnect.mockImplementation(async (_c: unknown, prompts: SshPrompts) => {
      trusted = await prompts.verifyHostKey(hostKey);
      kbd = await prompts.keyboardInteractive({
        name: "",
        instructions: "",
        prompts: [
          { prompt: "Password: ", echo: false },
          { prompt: "Code: ", echo: true },
        ],
        round: 0,
      });
      return s;
    });
    const p = profile();
    const repo = {
      profile: jest.fn(async () => ({
        ...p,
        hostKey: { fingerprint: "ffff", keyType: "ssh-rsa", changedCount: 0 },
      })),
      saveHostKey: jest.fn(),
      touchHostKey: jest.fn(),
    };
    const t = createLocalTransport(true, () => repo);
    await expect(t.openSession!({ id: 7 } as any)).resolves.toBeDefined();
    // A changed key with nobody to ask is refused.
    expect(trusted).toBe(false);
    expect(kbd).toEqual(["saved", ""]);

    const session = await t.openSession!({ id: 7 } as any);
    s.exec.mockResolvedValue({ exitCode: 0 });
    await session.exec("uptime", { timeoutSecs: 5 });
    expect(s.exec).toHaveBeenCalledWith("uptime", { timeoutSecs: 5 });
    expect(session.sftp).toBe(s.sftp);
    await session.close();
    expect(s.disconnect).toHaveBeenCalled();
  });
});

test("side commands run on the shell's own connection", async () => {
  const s = fakeSession();
  mockConnect.mockResolvedValue(s);
  const { shell, events } = setup();
  events.onHostKeyVerificationRequired.mockImplementation(() =>
    shell.sendHostKeyResponse("accept"),
  );
  await expect(shell.exec("tmux ls")).rejects.toThrow("Not connected");
  await shell.connect(80, 24);
  s.exec.mockResolvedValue({ stdout: enc("main"), exitCode: 0 });
  await expect(shell.exec("tmux ls", 3)).resolves.toEqual({
    stdout: "main",
    exitCode: 0,
  });
  expect(s.exec).toHaveBeenCalledWith("tmux ls", { timeoutSecs: 3 });
});

test("the working directory comes from the shell-cwd command on the same connection", async () => {
  const s = fakeSession();
  mockConnect.mockResolvedValue(s);
  const { shell, events } = setup();
  events.onHostKeyVerificationRequired.mockImplementation(() =>
    shell.sendHostKeyResponse("accept"),
  );
  await expect(shell.getCwd()).resolves.toBeNull();
  await shell.connect(80, 24);
  s.exec.mockResolvedValue({ stdout: enc("/srv/app\n"), exitCode: 0 });
  await expect(shell.getCwd()).resolves.toBe("/srv/app");
  expect(s.exec.mock.calls.at(-1)[0]).toBe(SHELL_CWD_COMMAND);
  s.exec.mockResolvedValue({ stdout: enc("oops"), exitCode: 1 });
  await expect(shell.getCwd()).resolves.toBeNull();
});

describe("tailscale ssh", () => {
  const tsProfile = () => ({ 7: profile({ authType: "tailscale" }) });
  const tsOptions = {
    hostConfig: {
      id: 7,
      name: "Box",
      ip: "box.lan",
      port: 22,
      username: "root",
      authType: "tailscale" as const,
    },
  };

  test("a check banner opens the browser prompt and success closes it", async () => {
    const s = fakeSession();
    mockConnect.mockImplementation(async (_c: unknown, prompts: any) => {
      prompts.onBanner?.(
        "# Tailscale SSH requires an additional check.\nhttps://login.tailscale.com/a/abc123\n",
      );
      return s;
    });
    const { shell, events } = setup(tsProfile(), tsOptions);
    events.onHostKeyVerificationRequired.mockImplementation(() =>
      shell.sendHostKeyResponse("accept"),
    );
    await shell.connect(80, 24);
    expect(events.onBrowserCheckRequired).toHaveBeenCalledWith(
      "https://login.tailscale.com/a/abc123",
      expect.stringContaining("additional check"),
    );
    expect(events.onBrowserCheckCompleted).toHaveBeenCalled();
  });

  test("a banner on a normal host never opens the browser prompt", async () => {
    const s = fakeSession();
    mockConnect.mockImplementation(async (_c: unknown, prompts: any) => {
      prompts.onBanner?.("Welcome, see https://example.com/terms");
      return s;
    });
    const { shell, events } = setup();
    events.onHostKeyVerificationRequired.mockImplementation(() =>
      shell.sendHostKeyResponse("accept"),
    );
    await shell.connect(80, 24);
    expect(events.onBrowserCheckRequired).not.toHaveBeenCalled();
  });

  test("a refused none login is retried as user+password", async () => {
    const s = fakeSession();
    mockConnect
      .mockRejectedValueOnce(new SshError("auth", "denied"))
      .mockResolvedValueOnce(s);
    const { shell, events } = setup(tsProfile(), tsOptions);
    events.onHostKeyVerificationRequired.mockImplementation(() =>
      shell.sendHostKeyResponse("accept"),
    );
    await shell.connect(80, 24);
    expect(mockConnect).toHaveBeenCalledTimes(2);
    expect(mockConnect.mock.calls[0][0]).toMatchObject({ username: "root" });
    expect(mockConnect.mock.calls[1][0]).toMatchObject({
      username: "root+password",
      password: "termix",
    });
  });
});
