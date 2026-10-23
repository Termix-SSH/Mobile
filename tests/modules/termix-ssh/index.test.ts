type Listener = (payload: unknown) => void;

const mockListeners = new Map<string, Set<Listener>>();
const emit = (event: string, payload: unknown) =>
  mockListeners.get(event)?.forEach((l) => l(payload));

const mockNative = {
  engineVersion: jest.fn(() => "russh test"),
  connect: jest.fn((..._args: any[]): Promise<unknown> => Promise.resolve()),
  answerHostKey: jest.fn(),
  answerKeyboardInteractive: jest.fn(),
  isClosed: jest.fn(() => false),
  ping: jest.fn(async () => {}),
  disconnect: jest.fn(async () => {}),
  exec: jest.fn(),
  openShell: jest.fn(async (..._args: any[]) => {}),
  writeShell: jest.fn(async () => {}),
  resizeShell: jest.fn(async () => {}),
  closeShell: jest.fn(async () => {}),
  sftpList: jest.fn(),
  sftpSize: jest.fn(),
  sftpDownload: jest.fn(),
  sftpUpload: jest.fn(),
  sftpRemove: jest.fn(),
  forwardLocal: jest.fn(),
  forwardDynamic: jest.fn(),
  closeForward: jest.fn(),
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

beforeEach(() => {
  mockListeners.clear();
  jest.clearAllMocks();
  mockAvailable = true;
});

describe("termix-ssh", () => {
  it("answers host key and keyboard-interactive prompts during connect", async () => {
    const ssh = load();
    mockNative.connect.mockImplementation(async (id: string) => {
      emit("onHostKey", { sessionId: id, hostKey });
      emit("onKeyboardInteractive", {
        sessionId: id,
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

    const session = await ssh.connect(
      { host: "example.com", port: 22, username: "me" },
      { verifyHostKey, keyboardInteractive, onBanner },
    );

    const id = mockNative.connect.mock.calls[0][0];
    expect(session.id).toBe(id);
    expect(mockNative.connect.mock.calls[0][2]).toBeNull();
    expect(verifyHostKey).toHaveBeenCalledWith(hostKey);
    expect(mockNative.answerHostKey).toHaveBeenCalledWith(id, true);
    expect(mockNative.answerKeyboardInteractive).toHaveBeenCalledWith(id, [
      "123456",
    ]);
    expect(onBanner).toHaveBeenCalledWith("hello");
    // prompt mockListeners are gone after login
    expect(mockListeners.get("onHostKey")?.size ?? 0).toBe(0);
  });

  it("ignores prompts for other logins and rejects when the prompt throws", async () => {
    const ssh = load();
    mockNative.connect.mockImplementation(async (id: string) => {
      emit("onHostKey", { sessionId: "other", hostKey });
      emit("onHostKey", { sessionId: id, hostKey });
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
    expect(mockNative.answerHostKey).toHaveBeenCalledWith(
      expect.any(String),
      false,
    );
  });

  it("maps native error codes to SshError kinds", async () => {
    const ssh = load();
    mockNative.connect.mockRejectedValue(
      Object.assign(new Error("nope"), { code: "SSH_HOST_KEY_REJECTED" }),
    );
    await expect(
      ssh.connect(
        { host: "h", port: 22, username: "u" },
        {
          verifyHostKey: async () => false,
          keyboardInteractive: async () => null,
        },
      ),
    ).rejects.toMatchObject({ name: "SshError", kind: "hostKeyRejected" });

    expect(
      ssh.toSshError({ code: "ERR_SSH_PASSPHRASE_REQUIRED", message: "x" })
        .kind,
    ).toBe("passphraseRequired");
    expect(ssh.toSshError({ code: "SSH_AUTH", message: "x" }).kind).toBe(
      "auth",
    );
    expect(ssh.toSshError(new Error("odd")).kind).toBe("io");
  });

  it("throws unavailable when the native module is missing", async () => {
    mockAvailable = false;
    const ssh = load();
    expect(ssh.isSshEngineAvailable).toBe(false);
    expect(ssh.engineVersion()).toBeNull();
    await expect(
      ssh.connect(
        { host: "h", port: 22, username: "u" },
        {
          verifyHostKey: async () => true,
          keyboardInteractive: async () => null,
        },
      ),
    ).rejects.toMatchObject({ kind: "unavailable" });
  });

  async function session() {
    const ssh = load();
    mockNative.connect.mockResolvedValue({ hostKey, algorithms: null });
    const s = await ssh.connect(
      { host: "h", port: 22, username: "u" },
      {
        verifyHostKey: async () => true,
        keyboardInteractive: async () => null,
      },
    );
    return { ssh, s };
  }

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
    );

    emit("onShellData", {
      shellId: "someone-else",
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

    emit("onShellExit", { shellId, exitCode: 0 });
    expect(onExit).toHaveBeenCalledWith(0);
    emit("onShellData", { shellId, data: "AA==" });
    expect(onData).toHaveBeenCalledTimes(1);
  });

  it("decodes exec output and reports transfer progress", async () => {
    const { ssh, s } = await session();
    mockNative.exec.mockResolvedValue({
      stdout: ssh.toBase64(ssh.utf8Encode("out")),
      stderr: "",
      exitCode: 3,
    });
    const r = await s.exec("cmd");
    expect(ssh.utf8Decode(r.stdout)).toBe("out");
    expect(r.stderr.length).toBe(0);
    expect(r.exitCode).toBe(3);

    mockNative.sftpDownload.mockImplementation(
      async (_s: string, transferId: string) => {
        emit("onTransferProgress", { transferId, done: 5, total: 10 });
        emit("onTransferProgress", { transferId: "other", done: 1, total: 1 });
        return { bytes: 10, millis: 2 };
      },
    );
    const progress = jest.fn();
    expect(await s.download("/a", "file:///b", progress)).toEqual({
      bytes: 10,
      millis: 2,
    });
    expect(progress).toHaveBeenCalledWith(5, 10);
    expect(progress).toHaveBeenCalledTimes(1);
    expect(mockListeners.get("onTransferProgress")?.size ?? 0).toBe(0);
  });

  it("opens forwards and jump hops on the right session", async () => {
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
    f.close();
    expect(mockNative.closeForward).toHaveBeenCalledWith(f.id);

    mockNative.forwardDynamic.mockResolvedValue(1080);
    expect((await s.forwardDynamic(1080)).port).toBe(1080);

    await s.connectVia(
      { host: "inner", port: 22, username: "u" },
      {
        verifyHostKey: async () => true,
        keyboardInteractive: async () => null,
      },
    );
    expect(mockNative.connect.mock.calls[1][2]).toBe(s.id);
  });

  it("tells mockListeners when the session drops", async () => {
    const { s } = await session();
    const onDrop = jest.fn();
    s.onDisconnect(onDrop);
    emit("onDisconnect", { sessionId: "other", reason: "x" });
    emit("onDisconnect", { sessionId: s.id, reason: "keepalive timeout" });
    emit("onDisconnect", { sessionId: s.id, reason: "again" });
    expect(onDrop).toHaveBeenCalledTimes(1);
    expect(onDrop).toHaveBeenCalledWith("keepalive timeout");
  });
});
