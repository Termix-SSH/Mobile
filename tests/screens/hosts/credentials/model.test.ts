import {
  baseKeyType,
  checkCertificate,
  describeCertificate,
} from "@/screens/hosts/credentials/cert";
import {
  credentialError,
  credentialPayload,
  EMPTY_CREDENTIAL,
  formFromCredential,
  parseTestAddress,
} from "@/screens/hosts/credentials/model";
import type { Credential } from "@/types";

const mockEngine = { available: true, inspectCertificate: jest.fn() };
jest.mock("@/modules/termix-ssh", () => {
  const actual = jest.requireActual("@/modules/termix-ssh");
  const mod = {
    ...actual,
    inspectCertificate: (...a: unknown[]) =>
      mockEngine.inspectCertificate(...a),
  };
  Object.defineProperty(mod, "isSshEngineAvailable", {
    get: () => mockEngine?.available ?? true,
  });
  return mod;
});

const info = {
  keyType: "ssh-ed25519-cert-v01@openssh.com",
  keyId: "luke",
  serial: 7,
  principals: ["root", "deploy"],
  validAfter: 1_700_000_000,
  validBefore: 1_900_000_000,
  caSha256: "SHA256:ca",
  isHost: false,
};

beforeEach(() => {
  mockEngine.available = true;
  jest.clearAllMocks();
});

test("the private key is never put back in the form", () => {
  const form = formFromCredential({
    id: 1,
    name: "k",
    tags: ["a"],
    authType: "key",
    username: "root",
    key: "SECRET",
    publicKey: "ssh-ed25519 AAA",
    keyPassword: "pp",
    certPublicKey: "CERT",
    usageCount: 0,
    createdAt: "",
    updatedAt: "",
  } as Credential);
  expect(form.key).toBe("");
  expect(form).toMatchObject({
    publicKey: "ssh-ed25519 AAA",
    keyPassword: "pp",
    certPublicKey: "CERT",
  });
});

test("a key login needs a key unless one is saved", () => {
  const form = { ...EMPTY_CREDENTIAL, name: "k", authType: "key" as const };
  expect(credentialError({ ...form, name: " " }, false, false)).toMatch(/name/);
  expect(credentialError(form, false, false)).toMatch(/private key/);
  expect(credentialError(form, true, true)).toBeNull();
});

test("blank secrets are left out so saved ones stay", () => {
  const payload = credentialPayload({
    ...EMPTY_CREDENTIAL,
    name: " k ",
    authType: "key",
    username: "root",
    certPublicKey: "",
  });
  expect(payload).toEqual({
    name: "k",
    description: undefined,
    folder: undefined,
    tags: [],
    authType: "key",
    username: "root",
    certPublicKey: "",
  });
  expect(
    credentialPayload({ ...EMPTY_CREDENTIAL, name: "p", password: "" })
      .password,
  ).toBeUndefined();
});

test("test addresses take a port, brackets for IPv6", () => {
  expect(parseTestAddress("box")).toEqual({ ip: "box", port: 22 });
  expect(parseTestAddress("box:2222")).toEqual({ ip: "box", port: 2222 });
  expect(parseTestAddress("[fe80::1]:2200")).toEqual({
    ip: "fe80::1",
    port: 2200,
  });
  expect(parseTestAddress("fe80::1")).toEqual({ ip: "fe80::1", port: 22 });
  expect(parseTestAddress("box:0")).toBeNull();
  expect(parseTestAddress("a b")).toBeNull();
  expect(parseTestAddress("")).toBeNull();
});

test("a certificate says who it is for and when it is good", () => {
  const { lines, problems } = describeCertificate(
    info,
    "ssh-ed25519",
    1_800_000_000,
  );
  expect(lines[0]).toBe("ID luke | serial 7");
  expect(lines[1]).toBe("For root, deploy");
  expect(lines[2]).toMatch(/^Valid 2023-11-14 to 2030-03-17$/);
  expect(problems).toEqual([]);
});

test("expired, host and mismatched certificates are flagged", () => {
  const { problems } = describeCertificate(
    { ...info, isHost: true },
    "ecdsa-sha2-nistp256",
    2_000_000_000,
  );
  expect(problems).toEqual([
    "This is a host certificate, not a user one.",
    "This certificate has expired.",
    "It is for a ssh-ed25519 key, but this key is ecdsa-sha2-nistp256.",
  ]);
  expect(baseKeyType("ssh-rsa-cert-v01@openssh.com")).toBe("ssh-rsa");
});

test("certificate checks use the engine when it is there", () => {
  mockEngine.inspectCertificate.mockReturnValueOnce(info);
  expect(checkCertificate("CERT", null).kind).toBe("ok");
  mockEngine.inspectCertificate.mockImplementationOnce(() => {
    throw new Error("bad");
  });
  expect(checkCertificate("junk", null).kind).toBe("invalid");
  expect(checkCertificate("  ", null).kind).toBe("empty");
  mockEngine.available = false;
  expect(checkCertificate("CERT", null).kind).toBe("unchecked");
});
