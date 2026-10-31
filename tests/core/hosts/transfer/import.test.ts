import { localRepositories } from "@/core/data/local";
import {
  hostKey,
  importHosts,
  importSummary,
  rowToDraft,
  rowsFromSshConfig,
} from "@/core/hosts/transfer/import";
import {
  parseImportFile,
  normalizeRow,
  type ImportRow,
} from "@/core/hosts/transfer/termix-json";
import { resetStorage } from "../../../helpers/http";
import { testStores } from "../../../helpers/db";

beforeEach(resetStorage);

function setup() {
  const { stores } = testStores();
  return localRepositories("local", stores);
}

const file = (hosts: unknown[], credentials: unknown[] = []) =>
  parseImportFile(JSON.stringify({ hosts, credentials }));

const row = (over: Record<string, unknown> = {}) => ({
  name: "web",
  ip: "10.0.0.1",
  port: 22,
  username: "root",
  authType: "password",
  password: "pw",
  ...over,
});

test("hosts are created and a repeat is skipped", async () => {
  const repos = setup();
  const first = await importHosts(repos, file([row()]));
  expect(first).toMatchObject({ created: 1, skipped: 0, failed: 0 });
  const second = await importHosts(repos, file([row()]));
  expect(second).toMatchObject({ created: 0, skipped: 1 });
  expect(await repos.hosts.list()).toHaveLength(1);
  expect(importSummary(second)).toBe(
    "0 created, 0 updated, 1 skipped, 0 failed",
  );
});

test("overwrite updates the host that matches", async () => {
  const repos = setup();
  await importHosts(repos, file([row()]));
  const result = await importHosts(
    repos,
    file([row({ name: "renamed", password: "new" })]),
    { overwrite: true },
  );
  expect(result).toMatchObject({ created: 0, updated: 1 });
  const [saved] = await repos.hosts.list();
  expect(saved).toMatchObject({ name: "renamed", password: "new" });
});

test("jump hosts are linked to the new ids", async () => {
  const repos = setup();
  await importHosts(
    repos,
    file([
      row({ exportId: 5, ip: "10.0.0.9", jumpHosts: [{ hostId: 4 }] }),
      row({ exportId: 4, ip: "10.0.0.8", name: "bastion" }),
    ]),
  );
  const hosts = await repos.hosts.list();
  const bastion = hosts.find((h) => h.name === "bastion")!;
  const inner = hosts.find((h) => h.ip === "10.0.0.9")!;
  expect(inner.jumpHosts).toEqual([{ hostId: bastion.id }]);
});

test("a skipped host still counts as a jump host", async () => {
  const repos = setup();
  await importHosts(repos, file([row({ ip: "10.0.0.8", name: "bastion" })]));
  await importHosts(
    repos,
    file([
      row({ exportId: 1, ip: "10.0.0.8", name: "bastion" }),
      row({ exportId: 2, ip: "10.0.0.9", jumpHosts: [{ hostId: 1 }] }),
    ]),
  );
  const hosts = await repos.hosts.list();
  const bastion = hosts.find((h) => h.name === "bastion")!;
  expect(hosts.find((h) => h.ip === "10.0.0.9")!.jumpHosts).toEqual([
    { hostId: bastion.id },
  ]);
});

test("a share file makes placeholder logins and links hosts to them", async () => {
  const repos = setup();
  const result = await importHosts(
    repos,
    file(
      [
        row({
          authType: "credential",
          password: undefined,
          credentialAlias: "deploy",
          username: "",
        }),
      ],
      [{ alias: "deploy", name: "Deploy", authType: "key", username: "dep" }],
    ),
  );
  expect(result.created).toBe(1);
  const [login] = await repos.credentials.list();
  expect(login).toMatchObject({ name: "Deploy", username: "dep" });
  const [saved] = await repos.hosts.list();
  expect(saved.credentialId).toBe(login.id);
});

test("an existing login with the same name is reused", async () => {
  const repos = setup();
  const made = await repos.credentials.create({
    name: "Deploy",
    authType: "password",
    username: "d",
    password: "x",
    tags: [],
  });
  await importHosts(
    repos,
    file(
      [
        row({
          authType: "credential",
          password: undefined,
          credentialAlias: "d1",
          username: "",
        }),
      ],
      [{ alias: "d1", name: "deploy", authType: "key" }],
    ),
  );
  expect(await repos.credentials.list()).toHaveLength(1);
  expect((await repos.hosts.list())[0].credentialId).toBe(made.id);
});

test("a login that cannot be found falls back to the secret in the row", async () => {
  const repos = setup();
  const result = await importHosts(
    repos,
    file([
      row({
        authType: "credential",
        credentialAlias: "ghost",
        password: "pw",
        username: "root",
      }),
    ]),
  );
  expect(result.created).toBe(1);
  expect((await repos.hosts.list())[0].authType).toBe("password");
});

test("a missing login with no fallback fails that host only", async () => {
  const repos = setup();
  const result = await importHosts(
    repos,
    file([
      row({
        authType: "credential",
        credentialAlias: "ghost",
        password: undefined,
        username: "",
        ip: "10.9.9.9",
      }),
      row({ ip: "10.0.0.2" }),
    ]),
  );
  expect(result).toMatchObject({ created: 1, failed: 1 });
  expect(result.errors[0]).toContain("ghost");
});

test("rows the file check refused count as failed", async () => {
  const repos = setup();
  const result = await importHosts(repos, file([row(), row({ ip: "" })]));
  expect(result).toMatchObject({ created: 1, failed: 1 });
});

test("a repository error fails the host and keeps going", async () => {
  const repos = setup();
  const original = repos.hosts.create.bind(repos.hosts);
  let calls = 0;
  repos.hosts.create = async (draft) => {
    if (++calls === 1) throw new Error("disk full");
    return original(draft);
  };
  const result = await importHosts(
    repos,
    file([row(), row({ ip: "10.0.0.3" })]),
  );
  expect(result).toMatchObject({ created: 1, failed: 1 });
  expect(result.errors[0]).toContain("disk full");
});

test("an ssh config imports with its jump host linked", async () => {
  const repos = setup();
  const result = await importHosts(
    repos,
    rowsFromSshConfig(
      "Host jump\n HostName 1.1.1.1\n User j\nHost in\n HostName 2.2.2.2\n User i\n ProxyJump jump\n",
    ),
  );
  expect(result.created).toBe(2);
  const hosts = await repos.hosts.list();
  const jump = hosts.find((h) => h.name === "jump")!;
  expect(hosts.find((h) => h.name === "in")!.jumpHosts).toEqual([
    { hostId: jump.id },
  ]);
});

test("a host key is address, port and user", () => {
  expect(hostKey({ ip: "a", port: 1, username: "u" })).toBe("a:1:u");
});

test("a remote desktop row fills the protocol fields", () => {
  const rdp = normalizeRow(
    {
      ip: "pc",
      port: 3390,
      connectionType: "rdp",
      protocolAuth: {
        rdp: { username: "admin", password: "p", fields: { domain: "CORP" } },
      },
    },
    1,
  ) as ImportRow;
  expect(rowToDraft(rdp, undefined, [])).toMatchObject({
    enableSsh: false,
    enableRdp: true,
    rdpPort: 3390,
    rdpUser: "admin",
    rdpPassword: "p",
    rdpDomain: "CORP",
  });
  const vnc = normalizeRow({ ip: "pc", port: 5900, connectionType: "vnc" }, 1);
  expect(rowToDraft(vnc as ImportRow, undefined, [])).toMatchObject({
    enableVnc: true,
    vncPort: 5900,
  });
  const telnet = normalizeRow(
    { ip: "pc", port: 23, connectionType: "telnet" },
    1,
  );
  expect(rowToDraft(telnet as ImportRow, undefined, [])).toMatchObject({
    enableTelnet: true,
    telnetPort: 23,
  });
});

test("plugin settings in a row set the host switches", () => {
  const r = normalizeRow(
    {
      ...row(),
      statusCheckEnabled: false,
      pluginSettings: {
        "ssh-terminal": { enableTerminal: false },
        "file-manager": { enableFileManager: false, defaultPath: "/srv" },
        docker: { enableDocker: true },
        "wake-on-lan": { macAddress: "aa:bb" },
      },
    },
    1,
  ) as ImportRow;
  expect(rowToDraft(r, undefined, [])).toMatchObject({
    enableTerminal: false,
    enableFileManager: false,
    enableDocker: true,
    macAddress: "aa:bb",
    statsConfig: expect.stringContaining("false"),
  });
});
