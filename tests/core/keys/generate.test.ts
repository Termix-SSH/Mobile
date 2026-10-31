import { generateKeyPair } from "@/core/keys/generate";
import { fromBase64 } from "@/modules/termix-ssh/src/base64";

const mockEngine = { available: true, convertKeyToOpenssh: jest.fn() };
jest.mock("@/modules/termix-ssh", () => {
  const actual = jest.requireActual("@/modules/termix-ssh");
  const mod = {
    ...actual,
    convertKeyToOpenssh: (...a: unknown[]) =>
      mockEngine.convertKeyToOpenssh(...a),
  };
  Object.defineProperty(mod, "isSshEngineAvailable", {
    get: () => mockEngine?.available ?? true,
  });
  return mod;
});

/** The same bytes every run, so the keys can be checked against ssh-keygen. */
function fixedRandom() {
  let n = 1;
  return (len: number) =>
    Uint8Array.from({ length: len }, () => (n = (n * 73 + 41) % 251));
}

function body(privateKey: string): Uint8Array {
  const b64 = privateKey
    .split("\n")
    .filter((l) => l && !l.startsWith("-----"))
    .join("");
  return fromBase64(b64);
}

beforeEach(() => {
  mockEngine.available = true;
  jest.clearAllMocks();
});

// The public lines below are what `ssh-keygen -y` printed for these private keys.
test("ed25519 and ECDSA keys match what ssh-keygen derives", () => {
  const random = fixedRandom();
  const ed = generateKeyPair("ed25519", { random });
  expect(ed.publicKey).toBe(
    "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIJZSij4pXGcYIvnhTpc+WH6hyejKOFfnSmFI6VDPH0RU termix",
  );
  const ec = generateKeyPair("ecdsa", { random });
  expect(ec.publicKey).toBe(
    "ecdsa-sha2-nistp256 AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYAAAAIbmlzdHAyNTYAAABBBD7YRjWxaHG54rpaT7lE8JKzy2kmJeIlxxeRLJ6xWkjHTI0sp/UAFbreKfxQh4MzoBWNfddt/8SNZ+pA4QZQTzA= termix",
  );
});

test("the private key is an unencrypted openssh-key-v1 file", () => {
  const { privateKey } = generateKeyPair("ed25519", { random: fixedRandom() });
  expect(privateKey.startsWith("-----BEGIN OPENSSH PRIVATE KEY-----\n")).toBe(
    true,
  );
  expect(
    privateKey.trimEnd().endsWith("-----END OPENSSH PRIVATE KEY-----"),
  ).toBe(true);
  const bytes = body(privateKey);
  expect(new TextDecoder().decode(bytes.slice(0, 14))).toBe("openssh-key-v1");
  expect(new TextDecoder().decode(bytes)).toContain("none");
  for (const line of privateKey.split("\n")) {
    expect(line.length).toBeLessThanOrEqual(70);
  }
});

test("a passphrase locks the key through the engine", () => {
  mockEngine.convertKeyToOpenssh.mockReturnValue("LOCKED");
  const key = generateKeyPair("ed25519", {
    random: fixedRandom(),
    passphrase: "pp",
  });
  expect(key.privateKey).toBe("LOCKED");
  expect(mockEngine.convertKeyToOpenssh).toHaveBeenCalledWith(
    expect.stringContaining("OPENSSH PRIVATE KEY"),
    undefined,
    "pp",
  );
  mockEngine.available = false;
  expect(() =>
    generateKeyPair("ecdsa", { random: fixedRandom(), passphrase: "pp" }),
  ).toThrow(/passphrase/);
});
