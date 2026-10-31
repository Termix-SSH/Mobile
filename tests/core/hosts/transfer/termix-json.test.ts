import {
  buildExport,
  isValidPort,
  normalizeRow,
  orderByJumps,
  parseImportFile,
  scrubSecrets,
  withJumpHosts,
  type ImportRow,
} from "@/core/hosts/transfer/termix-json";
import type { Credential, SSHHost } from "@/types";

const host = (over: Partial<SSHHost>): SSHHost => ({
  id: 1,
  name: "web",
  ip: "10.0.0.1",
  port: 22,
  username: "root",
  folder: "",
  tags: [],
  pin: false,
  authType: "password",
  password: "pw",
  enableTerminal: true,
  enableTunnel: false,
  enableFileManager: true,
  defaultPath: "/",
  tunnelConnections: [],
  createdAt: "",
  updatedAt: "",
  ...over,
});

const login = (over: Partial<Credential>): Credential => ({
  id: 7,
  name: "deploy key",
  tags: [],
  authType: "key",
  username: "deploy",
  key: "KEYDATA",
  keyPassword: "kp",
  keyType: "ed25519",
  usageCount: 0,
  createdAt: "",
  updatedAt: "",
  ...over,
});

const raw = (over: Record<string, unknown> = {}) => ({
  ip: "10.0.0.1",
  port: 22,
  username: "root",
  authType: "password",
  password: "pw",
  ...over,
});

test("ports must be whole numbers from 1 to 65535", () => {
  expect(isValidPort(22)).toBe(true);
  expect(isValidPort("2222")).toBe(true);
  expect(isValidPort(0)).toBe(false);
  expect(isValidPort(70000)).toBe(false);
  expect(isValidPort(1.5)).toBe(false);
});

test("a good row is read with defaults filled in", () => {
  const row = normalizeRow(raw({ tags: "a, b", exportId: 4 }), 1) as ImportRow;
  expect(row).toMatchObject({
    exportId: 4,
    connectionType: "ssh",
    tags: ["a", "b"],
    pin: false,
    jumpHosts: [],
  });
});

test.each([
  [raw({ ip: "" }), "Missing required fields"],
  [raw({ port: 0 }), "Missing required fields"],
  [raw({ authType: "magic" }), "Invalid authType"],
  [raw({ username: "" }), "Username required"],
  [
    raw({ authType: "credential", username: "", password: undefined }),
    "credentialAlias required",
  ],
  ["nope", "not a host"],
])("a bad row is refused: %#", (input, why) => {
  expect(normalizeRow(input, 3)).toEqual(expect.stringContaining(why));
});

test("a share file row may leave the password out", () => {
  const row = normalizeRow(raw({ password: "" }), 1);
  expect(typeof row).toBe("object");
  const key = normalizeRow(raw({ authType: "key", key: undefined }), 1);
  expect(typeof key).toBe("object");
});

test("a credential host needs no username in the file", () => {
  const row = normalizeRow(
    raw({ authType: "credential", username: "", credentialAlias: "k" }),
    1,
  );
  expect(typeof row).toBe("object");
});

test("other protocols do not need a login in the file", () => {
  const row = normalizeRow(
    { ip: "h", port: 3389, connectionType: "rdp", username: "" },
    1,
  ) as ImportRow;
  expect(row.connectionType).toBe("rdp");
});

test("old status check settings are read from statsConfig", () => {
  const off = normalizeRow(
    raw({ statsConfig: { disableTcpPing: true } }),
    1,
  ) as ImportRow;
  expect(off.statusCheckEnabled).toBe(false);
  const every = normalizeRow(
    raw({ statusCheckInterval: 60, statusCheckEnabled: true }),
    1,
  ) as ImportRow;
  expect(every).toMatchObject({
    statusCheckEnabled: true,
    statusCheckInterval: 60,
  });
  const tooFast = normalizeRow(raw({ statusCheckInterval: 1 }), 1) as ImportRow;
  expect(tooFast.statusCheckInterval).toBeUndefined();
});

test("a file can be a list or an object with credentials", () => {
  const list = parseImportFile(JSON.stringify([raw()]));
  expect(list.rows).toHaveLength(1);
  const object = parseImportFile(
    JSON.stringify({
      hosts: [raw(), raw({ ip: "" })],
      credentials: [{ alias: "k", authType: "key" }, { nope: 1 }],
    }),
  );
  expect(object.rows).toHaveLength(1);
  expect(object.errors).toHaveLength(1);
  expect(object.credentials).toEqual([
    expect.objectContaining({ alias: "k", name: "k", authType: "key" }),
  ]);
});

test("a file that is not usable says why", () => {
  expect(() => parseImportFile("{")).toThrow("not a valid JSON");
  expect(() => parseImportFile("[]")).toThrow("must not be empty");
  expect(() => parseImportFile('{"hosts":3}')).toThrow("must not be empty");
});

test("duplicate exported ids are refused", () => {
  const file = parseImportFile(
    JSON.stringify([raw({ exportId: 1 }), raw({ exportId: 1, ip: "b" })]),
  );
  expect(file.rows).toHaveLength(1);
  expect(file.errors[0]).toContain("duplicate");
});

test("jump hosts are ordered first, and missing ones fail the row", () => {
  const rows = [
    normalizeRow(raw({ exportId: 2, ip: "b", jumpHosts: [{ hostId: 1 }] }), 1),
    normalizeRow(raw({ exportId: 1, ip: "a" }), 2),
    normalizeRow(raw({ exportId: 3, ip: "c", jumpHosts: [{ hostId: 9 }] }), 3),
  ] as ImportRow[];
  const { ordered, errors } = orderByJumps(rows);
  expect(ordered.map((r) => r.ip)).toEqual(["a", "b"]);
  expect(errors[0]).toContain("jump host 9");
});

test("a jump cycle is refused", () => {
  const rows = [
    normalizeRow(raw({ exportId: 1, ip: "a", jumpHosts: [{ hostId: 2 }] }), 1),
    normalizeRow(raw({ exportId: 2, ip: "b", jumpHosts: [{ hostId: 1 }] }), 2),
  ] as ImportRow[];
  const { ordered, errors } = orderByJumps(rows);
  expect(ordered).toEqual([]);
  expect(errors.join()).toContain("cycle");
});

test("secrets are dropped from plugin settings", () => {
  expect(
    scrubSecrets({
      a: {
        endpointPassword: "x",
        tunnelKey: "y",
        port: 1,
        list: [{ token: "t", n: 2 }],
      },
    }),
  ).toEqual({ a: { port: 1, list: [{ n: 2 }] } });
});

test("an export adds the jump hosts that were not picked", () => {
  const a = host({ id: 1 });
  const b = host({ id: 2, jumpHosts: [{ hostId: 1 }] });
  const c = host({ id: 3, jumpHosts: [{ hostId: 2 }] });
  const picked = withJumpHosts([c], [a, b, c]);
  expect(picked.map((h) => h.id).sort()).toEqual([1, 2, 3]);
});

test("a full export carries secrets and a login's key", () => {
  const out = buildExport(
    [
      host({ id: 1 }),
      host({
        id: 2,
        authType: "credential",
        credentialId: 7,
        username: "ignored",
        jumpHosts: [{ hostId: 1 }],
      }),
    ],
    [login({})],
  );
  expect(out.version).toBeUndefined();
  expect(out.hosts[0]).toMatchObject({ password: "pw", authType: "password" });
  expect(out.hosts[1]).toMatchObject({
    authType: "key",
    key: "KEYDATA",
    username: "deploy",
    jumpHosts: [{ hostId: 1 }],
  });
});

test("a share export has no secrets and lists logins by name", () => {
  const out = buildExport(
    [
      host({ id: 1, sudoPassword: "s" }),
      host({ id: 2, authType: "credential", credentialId: 7 }),
      host({ id: 3, authType: "credential", credentialId: 7 }),
    ],
    [login({})],
    { share: true },
  );
  expect(out.version).toBe("1");
  const [first, second] = out.hosts;
  expect(first).toMatchObject({ password: null, sudoPassword: null });
  expect(second).toMatchObject({
    authType: "credential",
    credentialAlias: "deploy key",
    credentialId: null,
  });
  expect(out.credentials).toHaveLength(1);
  expect(JSON.stringify(out)).not.toContain("KEYDATA");
});

test("an export reads back through the importer", () => {
  const out = buildExport([host({ id: 1, tags: ["x"] })], []);
  const file = parseImportFile(JSON.stringify(out));
  expect(file.errors).toEqual([]);
  expect(file.rows[0]).toMatchObject({ ip: "10.0.0.1", tags: ["x"] });
});

test("other protocols export without ssh fields", () => {
  const out = buildExport(
    [host({ id: 1, connectionType: "rdp", port: 3389 })],
    [],
  );
  expect(out.hosts[0]).not.toHaveProperty("authType");
});

test("color and icon go out in an export and come back in", () => {
  const out = buildExport(
    [host({ color: "#3b82f6", icon: "server-cog" })],
    [],
    {
      share: true,
    },
  );
  const row = out.hosts[0] as Record<string, unknown>;
  expect(row).toMatchObject({ color: "#3b82f6", icon: "server-cog" });
  const back = normalizeRow(row, 0) as ImportRow;
  expect(back).toMatchObject({ color: "#3b82f6", icon: "server-cog" });
});
