import { SshError } from "@/modules/termix-ssh";
import {
  importMessage,
  importPrivateKey,
  keyStatus,
  keyStatusText,
} from "@/utils/keyImport";

const mockEngine = {
  available: true,
  inspectKey: jest.fn(),
  convertKeyToOpenssh: jest.fn(),
};
jest.mock("@/modules/termix-ssh", () => {
  const actual = jest.requireActual("@/modules/termix-ssh");
  const mod = {
    ...actual,
    inspectKey: (...a: unknown[]) => mockEngine.inspectKey(...a),
    convertKeyToOpenssh: (...a: unknown[]) =>
      mockEngine.convertKeyToOpenssh(...a),
  };
  // A getter so each test can switch the engine on and off.
  Object.defineProperty(mod, "isSshEngineAvailable", {
    get: () => mockEngine.available,
  });
  return mod;
});

beforeEach(() => {
  mockEngine.available = true;
  jest.clearAllMocks();
});

test("PuTTY keys become OpenSSH with the same passphrase", () => {
  mockEngine.inspectKey.mockReturnValue({
    format: "ppk",
    publicOpenssh: "ssh-ed25519 AAA",
  });
  mockEngine.convertKeyToOpenssh.mockReturnValue("OPENSSH");
  const r = importPrivateKey("  PuTTY-User-Key-File-3: x \n", "pp");
  expect(mockEngine.inspectKey).toHaveBeenCalledWith(
    "PuTTY-User-Key-File-3: x",
    "pp",
  );
  expect(mockEngine.convertKeyToOpenssh).toHaveBeenCalledWith(
    "PuTTY-User-Key-File-3: x",
    "pp",
    "pp",
  );
  expect(r).toEqual({
    key: "OPENSSH",
    publicKey: "ssh-ed25519 AAA",
    converted: true,
    locked: false,
  });
  expect(importMessage("id.ppk", r)).toBe(
    "Loaded id.ppk and changed it to OpenSSH format",
  );
});

test("OpenSSH keys stay as they are and get their public key", () => {
  mockEngine.inspectKey.mockReturnValue({
    format: "openssh",
    publicOpenssh: "ssh-rsa B",
  });
  const r = importPrivateKey("KEY");
  expect(r).toEqual({
    key: "KEY",
    publicKey: "ssh-rsa B",
    converted: false,
    locked: false,
  });
  expect(mockEngine.convertKeyToOpenssh).not.toHaveBeenCalled();
  expect(importMessage("id", r)).toBe("Loaded id");
});

test("a locked key is kept and flagged", () => {
  mockEngine.inspectKey.mockImplementation(() => {
    throw new SshError("passphraseRequired", "locked");
  });
  const r = importPrivateKey("KEY");
  expect(r).toEqual({ key: "KEY", converted: false, locked: true });
  expect(importMessage("id", r)).toBe(
    "Loaded id. It needs its passphrase to connect",
  );

  mockEngine.inspectKey.mockImplementation(() => {
    throw new SshError("invalidKey", "bad");
  });
  expect(importPrivateKey("KEY").locked).toBe(false);
});

test("without the engine the key text is kept as is", () => {
  mockEngine.available = false;
  expect(importPrivateKey(" KEY ")).toEqual({
    key: "KEY",
    converted: false,
    locked: false,
  });
  expect(mockEngine.inspectKey).not.toHaveBeenCalled();
  mockEngine.available = true;
});

test("key status says what is wrong with a key or its passphrase", () => {
  expect(keyStatus("  ")).toEqual({ kind: "empty" });
  mockEngine.inspectKey.mockReturnValueOnce({
    keyType: "ssh-ed25519",
    bits: 256,
    sha256: "SHA256:x",
  });
  const ok = keyStatus("KEY", "pp");
  expect(ok).toEqual({
    kind: "ok",
    keyType: "ssh-ed25519",
    bits: 256,
    fingerprint: "SHA256:x",
  });
  expect(keyStatusText(ok)).toBe("ssh-ed25519 256 bit | SHA256:x");
  mockEngine.inspectKey.mockImplementationOnce(() => {
    throw new SshError("passphraseRequired", "locked");
  });
  expect(keyStatus("KEY").kind).toBe("needsPassphrase");
  mockEngine.inspectKey.mockImplementationOnce(() => {
    throw new SshError("badPassphrase", "bad");
  });
  expect(keyStatus("KEY", "x").kind).toBe("wrongPassphrase");
  mockEngine.inspectKey.mockImplementationOnce(() => {
    throw new SshError("invalidKey", "bad");
  });
  expect(keyStatusText(keyStatus("junk"))).toMatch(/private key/);
  mockEngine.available = false;
  expect(keyStatus("KEY").kind).toBe("unchecked");
});
