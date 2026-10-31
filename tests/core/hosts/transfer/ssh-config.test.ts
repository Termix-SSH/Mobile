import { parseHop, parseSshConfig } from "@/core/hosts/transfer/ssh-config";
import { rowsFromSshConfig } from "@/core/hosts/transfer/import";

const CONFIG = `
# my hosts
Host *
  ServerAliveInterval 30

Host web db
  HostName 10.0.0.5
  User deploy
  Port 2222
  IdentityFile ~/.ssh/id_ed25519

Host jump
  HostName=jump.example.com

Host inner
  HostName 10.1.1.1
  ProxyJump jump,other@far.example.com:2200

Host bare

Match host foo
  User nobody
`;

test("each name on a Host line makes a host, wildcards are skipped", () => {
  const hosts = parseSshConfig(CONFIG);
  expect(hosts.map((h) => h.name)).toEqual([
    "web",
    "db",
    "jump",
    "inner",
    "bare",
  ]);
  expect(hosts[0]).toMatchObject({
    hostname: "10.0.0.5",
    user: "deploy",
    port: 2222,
    identityFile: "~/.ssh/id_ed25519",
  });
});

test("a host with no HostName connects to its own name", () => {
  const bare = parseSshConfig(CONFIG).find((h) => h.name === "bare")!;
  expect(bare.hostname).toBe("bare");
});

test("key=value, CRLF and quotes are read", () => {
  const hosts = parseSshConfig(
    'Host a\r\n  HostName = "h.example.com"\r\n  Port 70000\r\n  User "me"\r\n',
  );
  expect(hosts[0]).toMatchObject({ hostname: "h.example.com", user: "me" });
  expect(hosts[0].port).toBeUndefined();
});

test("the first value of an option wins, like ssh", () => {
  const hosts = parseSshConfig("Host a\n User one\n User two\n");
  expect(hosts[0].user).toBe("one");
});

test("proxy jump splits into hops and none turns it off", () => {
  const hosts = parseSshConfig(CONFIG);
  expect(hosts.find((h) => h.name === "inner")!.proxyJump).toEqual([
    "jump",
    "other@far.example.com:2200",
  ]);
  expect(parseSshConfig("Host a\n ProxyJump none\n")[0].proxyJump).toEqual([]);
});

test("a hop splits into user, host and port", () => {
  expect(parseHop("u@h:22")).toEqual({ user: "u", host: "h", port: 22 });
  expect(parseHop("[::1]:2200")).toEqual({
    user: undefined,
    host: "::1",
    port: 2200,
  });
  expect(parseHop("plain")).toEqual({ user: undefined, host: "plain" });
});

test("an SSH config becomes import rows with jumps by id", () => {
  const file = rowsFromSshConfig(CONFIG);
  const inner = file.rows.find((r) => r.name === "inner")!;
  const jump = file.rows.find((r) => r.name === "jump")!;
  expect(inner.jumpHosts).toEqual([jump.exportId]);
  expect(file.errors.join()).toContain("far.example.com");
  const web = file.rows.find((r) => r.name === "web")!;
  expect(web).toMatchObject({
    ip: "10.0.0.5",
    port: 2222,
    username: "deploy",
    authType: "none",
  });
  expect(web.notes).toContain("id_ed25519");
});

test("a config with no hosts is refused", () => {
  expect(() => rowsFromSshConfig("# nothing\nHost *\n User x\n")).toThrow(
    "No valid Host",
  );
});
