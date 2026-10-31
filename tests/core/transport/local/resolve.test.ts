import type { HostConnectProfile } from "@/core/data/types";
import { AppError } from "@/core/errors";
import {
  knocksOf,
  proxiesOf,
  resolveLogin,
  tailscaleRetry,
} from "@/core/transport/local/resolve";
import type { TerminalHostConfig } from "@/core/transport/types";

const typed: TerminalHostConfig = {
  id: 0,
  name: "Quick",
  ip: "10.0.0.2",
  port: 2200,
  username: "me",
  authType: "password",
  password: "pw",
};

function profile(over: Partial<HostConnectProfile> = {}): HostConnectProfile {
  return {
    host: {
      id: 7,
      name: "Box",
      ip: "box.lan",
      port: 22,
      sshPort: 2222,
      username: "root",
      authType: "password",
      password: "saved",
      jumpHosts: [{ hostId: 3 }, { hostId: 4 }],
    } as any,
    credential: null,
    sshOptions: {},
    socks5: { use: false, chain: [] },
    portKnock: [],
    hostKey: null,
    ...over,
  };
}

test("a typed in host logs in with what the screen passed", () => {
  const l = resolveLogin(null, typed);
  expect(l.hostId).toBeNull();
  expect(l.config).toMatchObject({
    host: "10.0.0.2",
    port: 2200,
    username: "me",
    password: "pw",
    tryKeyboard: true,
    allowLegacyAlgorithms: true,
    keepaliveIntervalSecs: 30,
    keepaliveCountMax: 5,
    proxies: [],
    portKnock: [],
  });
});

test("a saved host uses its row, ssh port and jump hosts", () => {
  const l = resolveLogin(profile(), typed);
  expect(l.hostId).toBe(7);
  expect(l.config).toMatchObject({
    host: "box.lan",
    port: 2222,
    username: "root",
    password: "saved",
  });
  expect(l.jumpHostIds).toEqual([3, 4]);
});

test("a linked login fills secrets, certificate and username", () => {
  const p = profile({
    host: {
      ...profile().host,
      authType: "credential",
      credentialId: 9,
      password: undefined,
    } as any,
    credential: {
      id: 9,
      username: "deploy",
      key: "KEY",
      keyPassword: "kp",
      password: "also",
      certPublicKey: "ssh-ed25519-cert-v01@openssh.com AAAA",
    } as any,
  });
  const l = resolveLogin(p, typed);
  expect(l.authType).toBe("key");
  expect(l.config).toMatchObject({
    username: "deploy",
    privateKey: "KEY",
    passphrase: "kp",
    password: "also",
    certificate: "ssh-ed25519-cert-v01@openssh.com AAAA",
  });

  const kept = resolveLogin(
    { ...p, host: { ...p.host, overrideCredentialUsername: true } },
    typed,
  );
  expect(kept.config.username).toBe("root");
});

test("a password login never sends a key", () => {
  const l = resolveLogin(
    profile({ host: { ...profile().host, key: "K" } as any }),
    typed,
  );
  expect(l.config.privateKey).toBeUndefined();
});

test("none asks prompts, but a none jump hop does not", () => {
  const none = profile({
    host: { ...profile().host, authType: "none" } as any,
  });
  expect(resolveLogin(none, typed).config.tryKeyboard).toBe(true);
  expect(resolveLogin(none, typed).config.password).toBeUndefined();
  const hop = resolveLogin(none, typed, { jump: true });
  expect(hop.config.tryKeyboard).toBe(false);
  expect(hop.config.keepaliveCountMax).toBe(3);
});

test("ssh options set keepalive, legacy algorithms and env like core", () => {
  const opts = (sshOptions: Record<string, unknown>) =>
    resolveLogin(profile({ sshOptions }), typed);
  expect(opts({ keepaliveInterval: 0 }).config.keepaliveIntervalSecs).toBe(0);
  expect(opts({ keepaliveInterval: 2 }).config.keepaliveIntervalSecs).toBe(5);
  expect(opts({ keepaliveInterval: 60 }).config.keepaliveIntervalSecs).toBe(60);
  expect(opts({ keepaliveCountMax: 0 }).config.keepaliveCountMax).toBe(0);
  expect(
    opts({ allowLegacyAlgorithms: false }).config.allowLegacyAlgorithms,
  ).toBe(false);
  expect(
    opts({
      environmentVariables: [
        { key: "EDITOR", value: "vim" },
        { key: " ", value: "x" },
      ],
    }).env,
  ).toEqual({ EDITOR: "vim" });
});

test("tailscale skips prompts and has one retry login", () => {
  const ts = resolveLogin(
    profile({ host: { ...profile().host, authType: "tailscale" } as any }),
    typed,
  );
  expect(ts.config.tryKeyboard).toBe(false);
  expect(ts.config.password).toBeUndefined();
  const retry = tailscaleRetry(ts);
  expect(retry.config.username).toBe("root+password");
  expect(retry.config.password).toBe("termix");
});

test("auth types only a server has are refused", () => {
  const agent = profile({
    host: { ...profile().host, authType: "opkssh" } as any,
  });
  expect(() => resolveLogin(agent, typed)).toThrow(AppError);
  expect(() => resolveLogin(agent, typed)).toThrow(/needs a Termix server/);
});

test("a secret reference in a login is refused", () => {
  const p = profile({
    host: { ...profile().host, password: "op://V/I/password" } as any,
  });
  expect(() => resolveLogin(p, typed)).toThrow(/Secret Sources/);
});

test("proxies map every chain type and the single proxy", () => {
  expect(proxiesOf({ use: false, host: "p", chain: [] })).toEqual([]);
  expect(
    proxiesOf({
      use: true,
      host: "p",
      username: "u",
      password: "s",
      chain: [],
    }),
  ).toEqual([
    { kind: "socks5", host: "p", port: 1080, username: "u", password: "s" },
  ]);
  expect(
    proxiesOf({
      use: true,
      chain: [
        { host: "a", port: 1, type: 4 },
        { host: "b", port: 2, type: "socks4" },
        { host: "c", port: 3, type: "http", username: "u" },
        { host: "d", port: 4, type: 5 },
        { port: 5 },
      ],
    }).map((h) => `${h.kind}:${h.host}:${h.port}`),
  ).toEqual(["socks4:a:1", "socks4:b:2", "http:c:3", "socks5:d:4"]);
});

test("port knocks keep valid ports with core's defaults", () => {
  expect(
    knocksOf([
      { port: 7000 },
      { port: 7001, protocol: "UDP", delay: 50 },
      { port: 0 },
      { port: 70000 },
    ]),
  ).toEqual([
    { port: 7000, udp: false, delayMs: 100 },
    { port: 7001, udp: true, delayMs: 50 },
  ]);
});
