import { SshError } from "@/modules/termix-ssh";
import { answerKbd, testConfig, testOnDevice } from "@/core/transport/test";

const mockEngine = { available: true, connect: jest.fn() };
jest.mock("@/modules/termix-ssh", () => {
  const actual = jest.requireActual("@/modules/termix-ssh");
  const mod = {
    ...actual,
    connect: (...a: unknown[]) => mockEngine.connect(...a),
  };
  Object.defineProperty(mod, "isSshEngineAvailable", {
    get: () => mockEngine?.available ?? true,
  });
  return mod;
});

const hostKey = {
  host: "box",
  port: 22,
  keyType: "ssh-ed25519",
  blobHex: "abcd",
  sha256: "SHA256:k",
  isCertificate: false,
  caSha256: null,
  principals: [],
};

function session() {
  return {
    hostKey,
    connectVia: jest.fn(),
    disconnect: jest.fn(async () => {}),
  };
}

const target = {
  ip: " box ",
  port: 22,
  username: "root",
  authType: "password",
  password: "pw",
};

beforeEach(() => {
  mockEngine.available = true;
  jest.clearAllMocks();
});

test("the login only carries the secret its type uses", () => {
  expect(testConfig(target)).toMatchObject({
    host: "box",
    password: "pw",
    privateKey: undefined,
  });
  const key = testConfig({
    ...target,
    authType: "key",
    key: "K",
    keyPassword: "P",
    certificate: "C",
  });
  expect(key).toMatchObject({
    privateKey: "K",
    passphrase: "P",
    certificate: "C",
  });
  expect(testConfig({ ...target, authType: "none" }).password).toBeUndefined();
});

test("password prompts get the password, other prompts give up", () => {
  const req = (prompt: string) => ({
    name: "",
    instructions: "",
    round: 0,
    prompts: [{ prompt, echo: false }],
  });
  expect(answerKbd(req("Password:"), "pw")).toEqual(["pw"]);
  expect(answerKbd(req("Verification code:"), "pw")).toBeNull();
  expect(answerKbd(req("Password:"), undefined)).toBeNull();
});

test("a good login says who it logged in as and closes", async () => {
  const s = session();
  mockEngine.connect.mockImplementation(async (_config, prompts) => {
    expect(await prompts.verifyHostKey(hostKey)).toBe(true);
    return s;
  });
  const ask = jest.fn(async () => true);
  const result = await testOnDevice(undefined, target, { askHostKey: ask });
  expect(result).toEqual({
    ok: true,
    message: "Logged in as root on box",
    fingerprint: "SHA256:k",
  });
  expect(ask).toHaveBeenCalledWith(
    "new",
    expect.objectContaining({ ip: "box" }),
  );
  expect(s.disconnect).toHaveBeenCalled();
});

test("a refused login comes back as an auth failure", async () => {
  mockEngine.connect.mockRejectedValue(new SshError("auth", "denied"));
  const result = await testOnDevice(undefined, target, {
    askHostKey: async () => true,
  });
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.failure.stage).toBe("auth");
});

test("server only sign ins and a missing engine are not tried", async () => {
  const vault = await testOnDevice(
    undefined,
    { ...target, authType: "vault" },
    { askHostKey: async () => true },
  );
  expect(vault.ok).toBe(false);
  if (!vault.ok) expect(vault.failure.stage).toBe("unavailable");
  mockEngine.available = false;
  const none = await testOnDevice(undefined, target, {
    askHostKey: async () => true,
  });
  expect(none.ok).toBe(false);
  expect(mockEngine.connect).not.toHaveBeenCalled();
});
