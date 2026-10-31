import {
  emptyIndex,
  folderChainPaths,
  isOwnValue,
  levelsForHost,
  resolveKey,
  withoutSelfJump,
} from "@/core/hosts/defaults/resolve";
import { coreKeyInfo } from "@/core/hosts/defaults/values";

const info = (name: string) =>
  coreKeyInfo().find((entry) => entry.key === name)!;

function index() {
  const i = emptyIndex();
  i.admin.set("core.sshPort", 2200);
  i.admin.set("core.username", "admin-user");
  i.user.set("core.username", "me");
  i.folders.set("Prod", {
    name: "Prod",
    values: new Map([["core.username", "prod"]]),
  });
  i.folders.set("Prod / Web", {
    name: "Prod / Web",
    values: new Map([["core.username", "web"]]),
  });
  return i;
}

test("a folder path expands to every parent", () => {
  expect(folderChainPaths("A / B / C")).toEqual(["A", "A / B", "A / B / C"]);
  expect(folderChainPaths("")).toEqual([]);
  expect(folderChainPaths(null)).toEqual([]);
});

test("levels for a host list known folders root first", () => {
  const levels = levelsForHost(index(), "Prod / Web / Eu");
  expect(levels.folders.map((f) => f.name)).toEqual(["Prod", "Prod / Web"]);
});

test("the deepest folder wins, then user, then admin, then the built in", () => {
  const i = index();
  expect(
    resolveKey(info("username"), levelsForHost(i, "Prod / Web"))?.value,
  ).toBe("web");
  expect(resolveKey(info("username"), levelsForHost(i, null))).toEqual({
    value: "me",
    source: { level: "user" },
  });
  expect(resolveKey(info("sshPort"), levelsForHost(i, null))?.source).toEqual({
    level: "admin",
  });
  expect(resolveKey(info("keepaliveInterval"), levelsForHost(i, null))).toEqual(
    { value: 60, source: { level: "builtin" } },
  );
});

test("a key with no built in resolves to nothing when no level sets it", () => {
  expect(
    resolveKey(info("auth"), levelsForHost(emptyIndex(), null)),
  ).toBeUndefined();
});

test("jump hosts skip the admin level", () => {
  const i = emptyIndex();
  i.admin.set("core.jumpHosts", [{ hostId: 1 }]);
  expect(resolveKey(info("jumpHosts"), levelsForHost(i, null))?.source).toEqual(
    { level: "builtin" },
  );
});

test("a host value is its own when it differs from what resolves", () => {
  const resolved = { value: 2200, source: { level: "admin" as const } };
  expect(isOwnValue(info("sshPort"), 22, resolved)).toBe(true);
  expect(isOwnValue(info("sshPort"), "2200", resolved)).toBe(false);
  expect(isOwnValue(info("username"), "root", undefined)).toBe(true);
  expect(isOwnValue(info("username"), "", undefined)).toBe(false);
});

test("a host never jumps through itself", () => {
  expect(withoutSelfJump([{ hostId: 1 }, { hostId: 2 }], 1)).toEqual([
    { hostId: 2 },
  ]);
  expect(withoutSelfJump("x", 1)).toBe("x");
});
