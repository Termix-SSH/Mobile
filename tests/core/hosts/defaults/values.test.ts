import {
  CORE_KEYS,
  coreKeyInfo,
  defaultValuesEqual,
  joinKey,
  normalizeAuthDefault,
  normalizeEnvironment,
  normalizeSocks5Default,
  parseOverrides,
  pluginKeyInfo,
  splitKey,
  stableStringify,
  toBoolean,
  toNumber,
  toObject,
  toText,
} from "@/core/hosts/defaults/values";

const key = (name: string) => CORE_KEYS.find((k) => k.key === name)!;

test("toBoolean reads the spellings the server stores", () => {
  expect(toBoolean("true", false)).toBe(true);
  expect(toBoolean(1, false)).toBe(true);
  expect(toBoolean("0", true)).toBe(false);
  expect(toBoolean(undefined, true)).toBe(true);
});

test("toNumber and toText give a fallback for empty values", () => {
  expect(toNumber("", 5)).toBe(5);
  expect(toNumber("22", null)).toBe(22);
  expect(toNumber("x", 7)).toBe(7);
  expect(toText("  ")).toBeNull();
  expect(toText("root")).toBe("root");
});

test("toObject parses a JSON string and refuses arrays", () => {
  expect(toObject('{"a":1}')).toEqual({ a: 1 });
  expect(toObject("[1]")).toBeNull();
  expect(toObject("nope")).toBeNull();
  expect(toObject(null)).toBeNull();
});

test("sshPort falls back to 22 for a bad port", () => {
  expect(key("sshPort").normalize("2222")).toBe(2222);
  expect(key("sshPort").normalize(70000)).toBe(22);
  expect(key("sshPort").normalize("abc")).toBe(22);
});

test("auth keeps the credential only for the credential type", () => {
  expect(
    normalizeAuthDefault({ authType: "password", credentialId: 3 }),
  ).toEqual({
    authType: "password",
    credentialId: null,
    overrideCredentialUsername: false,
    agentSocketPath: null,
    agentIdentity: null,
  });
  expect(
    normalizeAuthDefault({
      authType: "credential",
      credentialId: "4",
      overrideCredentialUsername: "true",
    }),
  ).toMatchObject({ credentialId: 4, overrideCredentialUsername: true });
  expect(normalizeAuthDefault({})).toBeNull();
});

test("socks5 drops proxy passwords and turns off cleanly", () => {
  expect(normalizeSocks5Default({ useSocks5: false, socks5Host: "x" })).toEqual(
    {
      useSocks5: false,
      socks5Host: null,
      socks5Port: null,
      socks5Username: null,
      socks5ProxyChain: null,
    },
  );
  const chain = normalizeSocks5Default({
    useSocks5: true,
    socks5ProxyChain: [{ host: "a", port: 1, password: "secret" }],
  });
  expect(chain.socks5ProxyChain).toEqual([{ host: "a", port: 1 }]);
  expect(
    normalizeSocks5Default({ useSocks5: true, socks5Host: "p" }).socks5Port,
  ).toBe(1080);
});

test("jump hosts and port knocks are normalized to one shape", () => {
  expect(key("jumpHosts").normalize('[{"hostId":"3"},{"x":1}]')).toEqual([
    { hostId: 3 },
  ]);
  expect(key("portKnockSequence").normalize([{ port: "7000" }])).toEqual([
    { port: 7000, protocol: "tcp", delay: 0 },
  ]);
  expect(normalizeEnvironment([{ key: "A", value: 1 }])).toEqual([
    { key: "A", value: "1" },
  ]);
});

test("status check interval is a positive whole number or null", () => {
  expect(key("statusCheckInterval").normalize("30.4")).toBe(30);
  expect(key("statusCheckInterval").normalize(0)).toBeNull();
  expect(key("statusCheckEnabled").normalize(undefined)).toBe(true);
});

test("keys split and join on the first dot", () => {
  expect(splitKey("core.sshPort")).toEqual(["core", "sshPort"]);
  expect(splitKey("ssh-terminal.font.size")).toEqual([
    "ssh-terminal",
    "font.size",
  ]);
  expect(splitKey("plain")).toEqual(["core", "plain"]);
  expect(joinKey("a", "b")).toBe("a.b");
});

test("core keys list every key with its levels", () => {
  const info = coreKeyInfo();
  expect(info).toHaveLength(CORE_KEYS.length);
  expect(info.find((i) => i.key === "jumpHosts")!.levels).not.toContain(
    "admin",
  );
  expect(info[0].fullKey).toBe("core.username");
});

test("a plugin key keeps its value and has no built in", () => {
  const info = pluginKeyInfo("ssh-terminal", "theme");
  expect(info.builtin).toBeUndefined();
  expect(info.normalize("dracula")).toBe("dracula");
  expect(info.normalize(undefined)).toBeNull();
});

test("equal values stringify the same whatever the key order", () => {
  expect(stableStringify({ b: 1, a: [2, { d: 1, c: 2 }] })).toBe(
    stableStringify({ a: [2, { c: 2, d: 1 }], b: 1 }),
  );
  expect(stableStringify(undefined)).toBe("undefined");
  expect(defaultValuesEqual({ a: 1 }, { a: 2 })).toBe(false);
});

test("overrides parse from text, sorted and without duplicates", () => {
  expect(parseOverrides('{"core":["b","a","a"],"x":"no"}')).toEqual({
    core: ["a", "b"],
  });
  expect(parseOverrides(null)).toBeNull();
  expect(parseOverrides("[]")).toBeNull();
});
