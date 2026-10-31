import {
  SHARE_PREFIX,
  decodeHostShare,
  encodeHostShare,
  sharedFromHost,
} from "@/core/hosts/transfer/share";
import { buildExport } from "@/core/hosts/transfer/termix-json";
import type { SSHHost } from "@/types";

const host: SSHHost = {
  id: 1,
  name: "Küche",
  ip: "10.0.0.1",
  port: 2222,
  username: "root",
  folder: "Home",
  tags: ["a"],
  pin: false,
  authType: "password",
  password: "secret",
  key: "KEY",
  notes: "note",
  enableTerminal: true,
  enableTunnel: false,
  enableFileManager: true,
  defaultPath: "/",
  tunnelConnections: [],
  createdAt: "",
  updatedAt: "",
};

test("a link round trips, unicode included", () => {
  const link = encodeHostShare(host);
  expect(link.startsWith(SHARE_PREFIX)).toBe(true);
  expect(link).toMatch(/^[A-Za-z0-9:/?=_-]+$/);
  expect(decodeHostShare(link)).toMatchObject({
    name: "Küche",
    ip: "10.0.0.1",
    port: 2222,
    username: "root",
    folder: "Home",
    tags: ["a"],
    notes: "note",
  });
});

test("a link never carries secrets unless asked", () => {
  const plain = decodeHostShare(encodeHostShare(host))!;
  expect(plain.password).toBeUndefined();
  expect(JSON.stringify(plain)).not.toContain("KEY");
  const withPassword = decodeHostShare(
    encodeHostShare(host, { password: true }),
  )!;
  expect(withPassword.password).toBe("secret");
});

test("a saved login is shared as a plain password host", () => {
  const shared = sharedFromHost({
    ...host,
    authType: "credential",
    credentialId: 3,
  });
  expect(shared.authType).toBe("password");
  expect(shared.password).toBeUndefined();
});

test("a bare payload without the prefix is accepted", () => {
  const link = encodeHostShare(host);
  expect(decodeHostShare(link.slice(SHARE_PREFIX.length))?.ip).toBe("10.0.0.1");
});

test("the text of a one host Termix file is accepted", () => {
  const json = JSON.stringify(buildExport([host], [], { share: true }));
  expect(decodeHostShare(json)).toMatchObject({ ip: "10.0.0.1", port: 2222 });
  const two = JSON.stringify(buildExport([host, { ...host, id: 2 }], []));
  expect(decodeHostShare(two)).toBeNull();
});

test("other text is not a host", () => {
  expect(decodeHostShare("")).toBeNull();
  expect(decodeHostShare("hello world")).toBeNull();
  expect(decodeHostShare(`${SHARE_PREFIX}@@@`)).toBeNull();
  expect(decodeHostShare("{bad")).toBeNull();
  const noHost = SHARE_PREFIX + "e30";
  expect(decodeHostShare(noHost)).toBeNull();
});
