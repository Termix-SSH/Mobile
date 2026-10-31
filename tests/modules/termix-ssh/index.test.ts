type Listener = (payload: unknown) => void;

const mockListeners = new Map<string, Set<Listener>>();
const emit = (event: string, payload: unknown) =>
  mockListeners.get(event)?.forEach((l) => l(payload));

const fn = () => jest.fn((..._args: any[]): any => Promise.resolve());

const mockNative = {
  engineVersion: jest.fn(() => "russh test"),
  connect: fn(),
  reconnect: fn(),
  cancel: jest.fn(),
  answerHostKey: jest.fn(),
  answerKeyboardInteractive: jest.fn(),
  isClosed: jest.fn(() => false),
  ping: fn(),
  disconnect: fn(),
  exec: fn(),
  execStream: fn(),
  execWrite: fn(),
  execEof: fn(),
  execSignal: fn(),
  execClose: fn(),
  openShell: fn(),
  openTelnet: fn(),
  displayProtocols: jest.fn(() => ["vnc", "rdp"]),
  openDisplay: fn(),
  displayPointer: jest.fn(),
  displayKeySym: jest.fn(),
  displayUnicode: jest.fn(),
  displayClipboard: jest.fn(),
  displayResize: jest.fn(),
  displayRefresh: jest.fn(),
  closeDisplay: jest.fn(),
  writeShell: fn(),
  resizeShell: fn(),
  signalShell: fn(),
  closeShell: fn(),
  sftpList: fn(),
  sftpStat: fn(),
  sftpLstat: fn(),
  sftpSize: fn(),
  sftpRealpath: fn(),
  sftpReadLink: fn(),
  sftpSymlink: fn(),
  sftpMkdir: fn(),
  sftpRmdir: fn(),
  sftpRename: fn(),
  sftpChmod: fn(),
  sftpRemove: fn(),
  sftpRemoveRecursive: fn(),
  sftpReadFile: fn(),
  sftpWriteFile: fn(),
  sftpDownload: fn(),
  sftpUpload: fn(),
  forwardLocal: fn(),
  forwardDynamic: fn(),
  forwardRemote: fn(),
  closeForward: fn(),
  inspectKey: jest.fn(),
  convertKeyToOpenssh: jest.fn(),
  inspectCertificate: jest.fn(),
  addListener: jest.fn((event: string, l: Listener) => {
    if (!mockListeners.has(event)) mockListeners.set(event, new Set());
    mockListeners.get(event)!.add(l);
    return { remove: () => mockListeners.get(event)!.delete(l) };
  }),
};

let mockAvailable = true;
jest.mock("expo-modules-core", () => ({
  ...jest.requireActual("expo-modules-core"),
  requireOptionalNativeModule: () => (mockAvailable ? mockNative : null),
}));

const hostKey = {
  host: "example.com",
  port: 22,
  keyType: "ssh-ed25519",
  blobHex: "00",
  sha256: "SHA256:abc",
  isCertificate: false,
  caSha256: null,
  principals: [],
};

function load() {
  let mod!: typeof import("@/modules/termix-ssh");
  jest.isolateModules(() => {
    mod = require("@/modules/termix-ssh");
  });
  return mod;
}

const flush = () => new Promise((r) => setTimeout(r, 0));
const prompts = {
  verifyHostKey: async () => true,
  keyboardInteractive: async () => null,
};

beforeEach(() => {
  mockListeners.clear();
  jest.clearAllMocks();
  mockAvailable = true;
});

async function session() {
  const ssh = load();
  mockNative.connect.mockResolvedValue({ hostKey, algorithms: null });
  const s = await ssh.connect({ host: "h", port: 22, username: "u" }, prompts);
  return { ssh, s };
}

describe("termix-ssh login", () => {
  it("answers prompts by request id during connect", async () => {
    const ssh = load();
    mockNative.connect.mockImplementation(async (id: string) => {
      emit("onHostKey", { sessionId: id, requestId: "hk1", hostKey });
      emit("onKeyboardInteractive", {
        sessionId: id,
        requestId: "kb2",
        request: {
          name: "",
          instructions: "",
          prompts: [{ prompt: "Verification code: ", echo: false }],
          round: 1,
        },
      });
      emit("onBanner", { sessionId: id, banner: "hello" });
      await flush();
      return { hostKey, algorithms: null };
    });
    const verifyHostKey = jest.fn(async () => true);
    const keyboardInteractive = jest.fn(async () => ["123456"]);
    const onBanner = jest.fn();

    const s = await ssh.connect(
      { host: "example.com", port: 22, username: "me" },
      { verifyHostKey, keyboardInteractive, onBanner },
    );

    expect(s.id).toBe(mockNative.connect.mock.calls[0][0]);
    expect(mockNative.connect.mock.calls[0][2]).toBeNull();
    expect(verifyHostKey).toHaveBeenCalledWith(hostKey);
    expect(mockNative.answerHostKey).toHaveBeenCalledWith("hk1", true);
    expect(mockNative.answerKeyboardInteractive).toHaveBeenCalledWith("kb2", [
      "123456",
    ]);
    expect(onBanner).toHaveBeenCalledWith("hello");
    expect(mockListeners.get("onHostKey")?.size ?? 0).toBe(0);
  });

  it("ignores prompts for other logins and refuses when the prompt throws", async () => {
    const ssh = load();
    mockNative.connect.mockImplementation(async (id: string) => {
      emit("onHostKey", { sessionId: "other", requestId: "x", hostKey });
      emit("onHostKey", { sessionId: id, requestId: "mine", hostKey });
      await flush();
      return { hostKey, algorithms: null };
    });
    const verifyHostKey = jest.fn(async () => {
      throw new Error("ui gone");
    });
    await ssh.connect(
      { host: "h", port: 22, username: "u" },
      { verifyHostKey, keyboardInteractive: async () => null },
    );
    expect(verifyHostKey).toHaveBeenCalledTimes(1);
    expect(mockNative.answerHostKey).toHaveBeenCalledWith("mine", false);
  });

  it("cancels a login through the abort signal", async () => {
    const ssh = load();
    let reject!: (e: unknown) => void;
    mockNative.connect.mockImplementation(
      () => new Promise((_r, rej) => (reject = rej)),
    );
    mockNative.cancel.mockImplementation(() =>
      reject({ code: "SSH_CANCELLED", message: "Cancelled" }),
    );
    const ac = new AbortController();
    const p = ssh.connect({ host: "h", port: 22, username: "u" }, prompts, {
      signal: ac.signal,
    });
    ac.abort();
    await expect(p).rejects.toMatchObject({ kind: "cancelled" });
    expect(mockNative.cancel).toHaveBeenCalledWith(
      mockNative.connect.mock.calls[0][0],
    );
  });

  it("refuses to start when the signal already fired", async () => {
    const ssh = load();
    const ac = new AbortController();
    ac.abort();
    await expect(
      ssh.connect({ host: "h", port: 22, username: "u" }, prompts, {
        signal: ac.signal,
      }),
    ).rejects.toMatchObject({ kind: "cancelled" });
    expect(mockNative.connect).not.toHaveBeenCalled();
  });

  it("maps native error codes to SshError kinds", async () => {
    const ssh = load();
    mockNative.connect.mockRejectedValue(
      Object.assign(new Error("nope"), { code: "SSH_HOST_KEY_REJECTED" }),
    );
    await expect(
      ssh.connect({ host: "h", port: 22, username: "u" }, prompts),
    ).rejects.toMatchObject({ name: "SshError", kind: "hostKeyRejected" });

    const kind = (code: string) => ssh.toSshError({ code, message: "x" }).kind;
    expect(kind("ERR_SSH_PASSPHRASE_REQUIRED")).toBe("passphraseRequired");
    expect(kind("SSH_AUTH_METHOD_NOT_AVAILABLE")).toBe(
      "authMethodNotAvailable",
    );
    expect(kind("SSH_TIMEOUT")).toBe("timeout");
    expect(kind("SSH_AUTH")).toBe("auth");
    expect(ssh.toSshError(new Error("odd")).kind).toBe("io");
  });

  it("throws unavailable when the native module is missing", async () => {
    mockAvailable = false;
    const ssh = load();
    expect(ssh.isSshEngineAvailable).toBe(false);
    expect(ssh.engineVersion()).toBeNull();
    await expect(
      ssh.connect({ host: "h", port: 22, username: "u" }, prompts),
    ).rejects.toMatchObject({ kind: "unavailable" });
    expect(() => ssh.inspectKey("k")).toThrow(
      expect.objectContaining({ kind: "unavailable" }),
    );
  });

  it("reconnects in place and keeps telling listeners about drops", async () => {
    const { s } = await session();
    const onDrop = jest.fn();
    s.onDisconnect(onDrop);
    emit("onDisconnect", { sessionId: "other", kind: "server", reason: "x" });
    emit("onDisconnect", {
      sessionId: s.id,
      kind: "keepalive",
      reason: "Keepalive timeout",
    });
    expect(onDrop).toHaveBeenCalledWith({
      kind: "keepalive",
      reason: "Keepalive timeout",
    });

    const fresh = { ...hostKey, sha256: "SHA256:new" };
    mockNative.reconnect.mockImplementation(async (id: string) => {
      emit("onHostKey", { sessionId: id, requestId: "r", hostKey: fresh });
      await flush();
      return { hostKey: fresh, algorithms: null };
    });
    const verifyHostKey = jest.fn(async () => true);
    await s.reconnect({ ...prompts, verifyHostKey });
    expect(mockNative.reconnect).toHaveBeenCalledWith(s.id);
    expect(verifyHostKey).toHaveBeenCalledWith(fresh);
    expect(s.hostKey.sha256).toBe("SHA256:new");

    emit("onDisconnect", { sessionId: s.id, kind: "network", reason: "y" });
    expect(onDrop).toHaveBeenCalledTimes(2);

    await s.disconnect();
    emit("onDisconnect", { sessionId: s.id, kind: "local", reason: "z" });
    expect(onDrop).toHaveBeenCalledTimes(2);
  });

  it("opens jump hops on the parent session", async () => {
    const { s } = await session();
    await s.connectVia({ host: "inner", port: 22, username: "u" }, prompts);
    expect(mockNative.connect.mock.calls[1][2]).toBe(s.id);
  });
});

describe("termix-ssh channels", () => {
  it("streams shell data as bytes and encodes writes as base64", async () => {
    const { ssh, s } = await session();
    const onData = jest.fn();
    const onExit = jest.fn();
    const shell = await s.openShell({ cols: 80, rows: 24 }, { onData, onExit });
    const shellId = mockNative.openShell.mock.calls[0][1];
    expect(mockNative.openShell).toHaveBeenCalledWith(
      s.id,
      shellId,
      "xterm-256color",
      80,
      24,
      {},
      null,
    );

    emit("onShellData", {
      shellId: "x",
      data: ssh.toBase64(new Uint8Array([1])),
    });
    emit("onShellData", {
      shellId,
      data: ssh.toBase64(ssh.utf8Encode("héllo")),
    });
    expect(onData).toHaveBeenCalledTimes(1);
    expect(ssh.utf8Decode(onData.mock.calls[0][0])).toBe("héllo");

    await shell.write("ls\n");
    expect(mockNative.writeShell).toHaveBeenCalledWith(
      shellId,
      ssh.toBase64(ssh.utf8Encode("ls\n")),
    );
    await shell.resize(100, 30);
    expect(mockNative.resizeShell).toHaveBeenCalledWith(shellId, 100, 30);
    await shell.signal("INT");
    expect(mockNative.signalShell).toHaveBeenCalledWith(shellId, "INT");

    emit("onShellExit", { shellId, exitCode: null, exitSignal: "HUP" });
    expect(onExit).toHaveBeenCalledWith(null, "HUP");
    emit("onShellData", { shellId, data: "AA==" });
    expect(onData).toHaveBeenCalledTimes(1);
  });

  it("two shells share one native listener and each gets only its data", async () => {
    const { ssh, s } = await session();
    const a = jest.fn();
    const b = jest.fn();
    const before = mockListeners.get("onShellData")?.size ?? 0;
    const one = await s.openShell({ cols: 80, rows: 24 }, { onData: a });
    const two = await s.openShell({ cols: 80, rows: 24 }, { onData: b });
    expect(mockListeners.get("onShellData")!.size).toBe(before + 1);
    const idTwo = mockNative.openShell.mock.calls.at(-1)![1];
    emit("onShellData", {
      shellId: idTwo,
      data: ssh.toBase64(new Uint8Array([7])),
    });
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
    one.release();
    two.release();
    expect(mockListeners.get("onShellData")!.size).toBe(before);
  });

  it("passes the pipe id and reports when piped output starts", async () => {
    const { s } = await session();
    const onActive = jest.fn();
    await s.openShell(
      { cols: 80, rows: 24, pipeId: "tab-1" },
      { onData: jest.fn(), onActive },
    );
    const call = mockNative.openShell.mock.calls.at(-1)!;
    expect(call[6]).toBe("tab-1");
    emit("onShellActive", { shellId: "other" });
    emit("onShellActive", { shellId: call[1] });
    expect(onActive).toHaveBeenCalledTimes(1);
  });

  it("runs exec with limits and cancel", async () => {
    const { ssh, s } = await session();
    mockNative.exec.mockResolvedValue({
      stdout: ssh.toBase64(ssh.utf8Encode("out")),
      stderr: "",
      exitCode: 3,
      exitSignal: null,
      truncated: true,
    });
    const r = await s.exec("cmd", { timeoutSecs: 5, maxBytes: 10 });
    expect(mockNative.exec).toHaveBeenCalledWith(
      s.id,
      expect.stringMatching(/^op-/),
      "cmd",
      5,
      10,
    );
    expect(ssh.utf8Decode(r.stdout)).toBe("out");
    expect(r).toMatchObject({ exitCode: 3, exitSignal: null, truncated: true });

    await s.exec("cmd");
    expect(mockNative.exec.mock.calls[1].slice(3)).toEqual([
      0,
      16 * 1024 * 1024,
    ]);

    const ac = new AbortController();
    mockNative.exec.mockImplementation(async () => {
      ac.abort();
      throw { code: "SSH_CANCELLED", message: "Cancelled" };
    });
    await expect(s.exec("sleep", { signal: ac.signal })).rejects.toMatchObject({
      kind: "cancelled",
    });
    expect(mockNative.cancel).toHaveBeenCalledWith(
      mockNative.exec.mock.calls[2][1],
    );
  });

  it("streams exec output by stream", async () => {
    const { ssh, s } = await session();
    const onStdout = jest.fn();
    const onStderr = jest.fn();
    const onExit = jest.fn();
    const e = await s.execStream(
      "tail -f log",
      { onStdout, onStderr, onExit },
      { cols: 80, rows: 24 },
    );
    expect(mockNative.execStream).toHaveBeenCalledWith(
      s.id,
      e.id,
      "tail -f log",
      { term: "xterm-256color", cols: 80, rows: 24 },
    );
    emit("onExecData", {
      execId: e.id,
      stream: "stdout",
      data: ssh.toBase64(ssh.utf8Encode("a")),
    });
    emit("onExecData", {
      execId: e.id,
      stream: "stderr",
      data: ssh.toBase64(ssh.utf8Encode("b")),
    });
    expect(ssh.utf8Decode(onStdout.mock.calls[0][0])).toBe("a");
    expect(ssh.utf8Decode(onStderr.mock.calls[0][0])).toBe("b");

    await e.write("x");
    await e.eof();
    await e.signal("TERM");
    expect(mockNative.execWrite).toHaveBeenCalledWith(
      e.id,
      ssh.toBase64(ssh.utf8Encode("x")),
    );
    expect(mockNative.execEof).toHaveBeenCalledWith(e.id);
    expect(mockNative.execSignal).toHaveBeenCalledWith(e.id, "TERM");

    emit("onExecExit", { execId: e.id, exitCode: 0, exitSignal: null });
    expect(onExit).toHaveBeenCalledWith(0, null);
    expect(mockListeners.get("onExecData")?.size ?? 0).toBe(0);
  });

  it("frees exec listeners when it fails to start", async () => {
    const { s } = await session();
    mockNative.execStream.mockRejectedValueOnce({
      code: "SSH_CHANNEL",
      message: "no",
    });
    await expect(
      s.execStream("x", { onStdout: jest.fn() }),
    ).rejects.toMatchObject({
      kind: "channel",
    });
    expect(mockListeners.get("onExecData")?.size ?? 0).toBe(0);
  });

  it("opens local, dynamic and remote forwards", async () => {
    const { s } = await session();
    mockNative.forwardLocal.mockResolvedValue(40000);
    const f = await s.forwardLocal(0, "db", 5432);
    expect(f.port).toBe(40000);
    expect(mockNative.forwardLocal).toHaveBeenCalledWith(
      s.id,
      f.id,
      "127.0.0.1",
      0,
      "db",
      5432,
    );
    await f.close();
    expect(mockNative.closeForward).toHaveBeenCalledWith(f.id);

    mockNative.forwardDynamic.mockResolvedValue(1080);
    expect((await s.forwardDynamic(1080)).port).toBe(1080);

    mockNative.forwardRemote.mockResolvedValue(39001);
    const r = await s.forwardRemote(0, "127.0.0.1", 3000);
    expect(r.port).toBe(39001);
    expect(mockNative.forwardRemote).toHaveBeenCalledWith(
      s.id,
      r.id,
      "127.0.0.1",
      0,
      "127.0.0.1",
      3000,
    );
  });

  it("pings with a timeout", async () => {
    const { s } = await session();
    await s.ping();
    await s.ping(3);
    expect(mockNative.ping.mock.calls).toEqual([
      [s.id, 10],
      [s.id, 3],
    ]);
  });
});

describe("termix-ssh sftp", () => {
  it("passes every file call to the session", async () => {
    const { ssh, s } = await session();
    const f = s.sftp;
    await f.list("/a");
    await f.stat("/a");
    await f.lstat("/l");
    await f.size("/a");
    await f.realpath(".");
    await f.readLink("/l");
    await f.symlink("/l", "/t");
    await f.mkdir("/d", 0o750);
    await f.mkdir("/e");
    await f.rmdir("/d");
    await f.rename("/a", "/b");
    await f.chmod("/b", 0o644);
    await f.remove("/b");
    expect(mockNative.sftpList).toHaveBeenCalledWith(s.id, "/a");
    expect(mockNative.sftpStat).toHaveBeenCalledWith(s.id, "/a");
    expect(mockNative.sftpLstat).toHaveBeenCalledWith(s.id, "/l");
    expect(mockNative.sftpRealpath).toHaveBeenCalledWith(s.id, ".");
    expect(mockNative.sftpSymlink).toHaveBeenCalledWith(s.id, "/l", "/t");
    expect(mockNative.sftpMkdir.mock.calls).toEqual([
      [s.id, "/d", 0o750],
      [s.id, "/e", null],
    ]);
    expect(mockNative.sftpRename).toHaveBeenCalledWith(s.id, "/a", "/b");
    expect(mockNative.sftpChmod).toHaveBeenCalledWith(s.id, "/b", 0o644);

    mockNative.sftpReadFile.mockResolvedValue(
      ssh.toBase64(ssh.utf8Encode("hi")),
    );
    expect(ssh.utf8Decode(await f.readFile("/c", 10))).toBe("hi");
    expect(mockNative.sftpReadFile).toHaveBeenCalledWith(s.id, "/c", 10);
    await f.writeFile("/c", "yo", 0o600);
    expect(mockNative.sftpWriteFile).toHaveBeenCalledWith(
      s.id,
      "/c",
      ssh.toBase64(ssh.utf8Encode("yo")),
      0o600,
    );
  });

  it("reports progress for its own op only and resumes from an offset", async () => {
    const { s } = await session();
    mockNative.sftpDownload.mockImplementation(
      async (_s: string, opId: string) => {
        emit("onProgress", { opId, done: 5, total: 10 });
        emit("onProgress", { opId: "other", done: 1, total: 1 });
        return { bytes: 5, millis: 2 };
      },
    );
    const onProgress = jest.fn();
    expect(
      await s.sftp.download("/a", "file:///b", { offset: 5, onProgress }),
    ).toEqual({
      bytes: 5,
      millis: 2,
    });
    expect(mockNative.sftpDownload.mock.calls[0][4]).toBe(5);
    expect(onProgress).toHaveBeenCalledTimes(1);
    expect(onProgress).toHaveBeenCalledWith(5, 10);
    expect(mockListeners.get("onProgress")?.size ?? 0).toBe(0);

    mockNative.sftpUpload.mockResolvedValue({ bytes: 1, millis: 1 });
    await s.sftp.upload("file:///b", "/a");
    expect(mockNative.sftpUpload.mock.calls[0].slice(2)).toEqual([
      "file:///b",
      "/a",
      0,
    ]);
  });

  it("cancels transfers and recursive deletes", async () => {
    const { s } = await session();
    const ac = new AbortController();
    mockNative.sftpUpload.mockImplementation(async () => {
      ac.abort();
      throw { code: "SSH_CANCELLED", message: "Cancelled" };
    });
    await expect(
      s.sftp.upload("/l", "/r", { signal: ac.signal }),
    ).rejects.toMatchObject({
      kind: "cancelled",
    });
    expect(mockNative.cancel).toHaveBeenCalledWith(
      mockNative.sftpUpload.mock.calls[0][1],
    );

    mockNative.sftpRemoveRecursive.mockImplementation(
      async (_s: string, opId: string) => {
        emit("onProgress", { opId, done: 3, total: 0 });
        return 3;
      },
    );
    const onProgress = jest.fn();
    expect(await s.sftp.removeRecursive("/tree", { onProgress })).toBe(3);
    expect(onProgress).toHaveBeenCalledWith(3, 0);
  });
});

describe("termix-ssh keys", () => {
  it("reads keys and certificates and maps errors", () => {
    const ssh = load();
    const info = { keyType: "ssh-ed25519", format: "ppk" };
    mockNative.inspectKey.mockReturnValue(info);
    expect(ssh.inspectKey("k", "")).toBe(info);
    expect(mockNative.inspectKey).toHaveBeenCalledWith("k", null);

    mockNative.convertKeyToOpenssh.mockReturnValue("open");
    expect(ssh.convertKeyToOpenssh("k", "a", "b")).toBe("open");
    expect(mockNative.convertKeyToOpenssh).toHaveBeenCalledWith("k", "a", "b");

    mockNative.inspectCertificate.mockImplementation(() => {
      throw { code: "SSH_INVALID_KEY", message: "bad" };
    });
    expect(() => ssh.inspectCertificate("c")).toThrow(
      expect.objectContaining({ kind: "invalidKey" }),
    );
  });
});

describe("termix-ssh telnet and displays", () => {
  it("opens telnet like a shell, through an SSH host when asked", async () => {
    const { ssh, s } = await session();
    const onExit = jest.fn();
    const shell = await ssh.connectTelnet(
      {
        dial: { host: "box", port: 23 },
        cols: 80,
        rows: 24,
        username: "me",
        via: s,
        pipeId: "p1",
      },
      { onData: jest.fn(), onExit },
    );
    expect(mockNative.openTelnet).toHaveBeenCalledWith(
      shell.id,
      { host: "box", port: 23 },
      "xterm-256color",
      80,
      24,
      { username: "me", password: undefined },
      s.id,
      "p1",
    );
    await shell.resize(100, 30);
    expect(mockNative.resizeShell).toHaveBeenCalledWith(shell.id, 100, 30);
    emit("onShellExit", { shellId: shell.id, exitCode: 0, exitSignal: null });
    expect(onExit).toHaveBeenCalledWith(0, null);
  });

  it("drops listeners when telnet fails to open", async () => {
    const ssh = load();
    mockNative.openTelnet.mockRejectedValueOnce({
      code: "SSH_TIMEOUT",
      message: "Timed out",
    });
    await expect(
      ssh.connectTelnet(
        { dial: { host: "box", port: 23 }, cols: 80, rows: 24 },
        { onData: jest.fn() },
      ),
    ).rejects.toMatchObject({ kind: "timeout" });
    expect(mockListeners.get("onShellExit")?.size ?? 0).toBe(0);
  });

  it("sends display input and hears size, clipboard and close", async () => {
    const ssh = load();
    expect(ssh.displayProtocols()).toEqual(["vnc", "rdp"]);
    const onResize = jest.fn();
    const onClipboard = jest.fn();
    const onClosed = jest.fn();
    const config = {
      protocol: "vnc" as const,
      host: "mac",
      port: 5900,
      width: 1280,
      height: 720,
    };
    const d = await ssh.openDisplay(config, {
      onResize,
      onClipboard,
      onClosed,
    });
    expect(mockNative.openDisplay).toHaveBeenCalledWith(
      d.frameId,
      config,
      null,
    );

    d.pointer(10.4, 20.6, 1);
    expect(mockNative.displayPointer).toHaveBeenCalledWith(
      d.frameId,
      10,
      21,
      1,
    );
    d.type("hé");
    expect(mockNative.displayUnicode.mock.calls).toEqual([
      [d.frameId, 0x68, true],
      [d.frameId, 0x68, false],
      [d.frameId, 0xe9, true],
      [d.frameId, 0xe9, false],
    ]);
    d.resize(800, 600, 200);
    expect(mockNative.displayResize).toHaveBeenCalledWith(
      d.frameId,
      800,
      600,
      200,
    );

    emit("onDisplayResize", { displayId: "other", width: 1, height: 1 });
    emit("onDisplayResize", {
      displayId: d.frameId,
      width: 1920,
      height: 1080,
    });
    emit("onDisplayClipboard", { displayId: d.frameId, text: "hi" });
    expect(onResize).toHaveBeenCalledWith(1920, 1080);
    expect(onClipboard).toHaveBeenCalledWith("hi");
    emit("onDisplayClosed", { displayId: d.frameId, reason: "bye" });
    expect(onClosed).toHaveBeenCalledWith("bye");
    expect(mockListeners.get("onDisplayResize")?.size).toBe(0);
  });

  it("reports a refused display login as auth", async () => {
    const ssh = load();
    mockNative.openDisplay.mockRejectedValueOnce({
      code: "SSH_AUTH",
      message: "The RDP server refused the login",
    });
    await expect(
      ssh.openDisplay(
        { protocol: "rdp", host: "pc", port: 3389, width: 1, height: 1 },
        {},
      ),
    ).rejects.toMatchObject({ kind: "auth" });
  });

  it("lists no protocols without the engine", () => {
    mockAvailable = false;
    expect(load().displayProtocols()).toEqual([]);
  });
});

describe("rdp certificate errors", () => {
  test("new and changed certificates are read from the engine's message", async () => {
    const ssh = require("@/modules/termix-ssh");
    expect(
      ssh.rdpCertProblem(new Error("Could not connect: RDP_CERT_NEW AA:0B")),
    ).toEqual({
      kind: "new",
      fingerprint: "AA:0B",
    });
    expect(ssh.rdpCertProblem({ message: "RDP_CERT_CHANGED FF:00" })).toEqual({
      kind: "changed",
      fingerprint: "FF:00",
    });
    expect(ssh.rdpCertProblem(new Error("RDP TLS: reset"))).toBeNull();
  });
});
