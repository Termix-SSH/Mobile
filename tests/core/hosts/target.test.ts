import { parseTarget, targetName } from "@/core/hosts/target";

test("a bare host parses", () => {
  expect(parseTarget("example.com")).toEqual({
    user: undefined,
    host: "example.com",
    port: undefined,
  });
});

test("user, host and port split apart", () => {
  expect(parseTarget("root@10.0.0.5:2222")).toEqual({
    user: "root",
    host: "10.0.0.5",
    port: 2222,
  });
  expect(parseTarget("deploy@web-1")).toMatchObject({
    user: "deploy",
    host: "web-1",
  });
  expect(parseTarget("host:22")).toMatchObject({ host: "host", port: 22 });
});

test("an ssh prefix and trailing slash are ignored", () => {
  expect(parseTarget("ssh://me@box:2200/")).toEqual({
    user: "me",
    host: "box",
    port: 2200,
  });
});

test("ipv6 works with and without brackets", () => {
  expect(parseTarget("[::1]:2222")).toMatchObject({ host: "::1", port: 2222 });
  expect(parseTarget("me@[fe80::1]")).toMatchObject({
    user: "me",
    host: "fe80::1",
  });
  expect(parseTarget("fe80::1")).toMatchObject({
    host: "fe80::1",
    port: undefined,
  });
});

test("a user with an at sign in the name keeps everything before the last at", () => {
  expect(parseTarget("a@b@host")).toMatchObject({ user: "a@b", host: "host" });
});

test("bad input gives null", () => {
  expect(parseTarget("")).toBeNull();
  expect(parseTarget("two words")).toBeNull();
  expect(parseTarget("@host")).toBeNull();
  expect(parseTarget("user@")).toBeNull();
  expect(parseTarget("host:99999")).toBeNull();
  expect(parseTarget("-bad-")).toBeNull();
});

test("a saved quick connect is named after the target", () => {
  expect(targetName({ user: "root", host: "box" })).toBe("root@box");
  expect(targetName({ host: "box" })).toBe("box");
});
