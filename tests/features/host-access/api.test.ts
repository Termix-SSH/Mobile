import type { AccountClient } from "@/core/api/AccountClient";
import {
  getHostAccess,
  getShareTargets,
  levelLabel,
  revokeHostAccess,
  shareHost,
  targetName,
  updateHostAccess,
  type AccessRecord,
} from "@/features/host-access/api";

function client(routes: Record<string, unknown>) {
  const calls: { method: string; url: string; body?: unknown }[] = [];
  const reply = (method: string) =>
    jest.fn(async (url: string, body?: unknown) => {
      calls.push({ method, url, body });
      if (url in routes) {
        const value = routes[url];
        if (value instanceof Error) throw value;
        return { data: value };
      }
      return { data: {} };
    });
  const auth = {
    get: reply("get"),
    post: reply("post"),
    patch: reply("patch"),
    delete: reply("delete"),
  };
  return { c: { http: { auth } } as unknown as AccountClient, calls };
}

const record = (over: Partial<AccessRecord>): AccessRecord => ({
  id: 1,
  targetType: "user",
  userId: "u1",
  roleId: null,
  username: "alice",
  roleName: null,
  roleDisplayName: null,
  grantedBy: "me",
  grantedByUsername: "me",
  permissionLevel: "connect",
  expiresAt: null,
  createdAt: "",
  ...over,
});

test("reads the access list of the server's host id", async () => {
  const { c } = client({
    "/rbac/host/7/access": { accessList: [record({})], isOwner: true },
  });
  const res = await getHostAccess(c, 7);
  expect(res.isOwner).toBe(true);
  expect(res.accessList).toHaveLength(1);
});

test("shares with users and roles, with an end only when one is picked", async () => {
  const { c, calls } = client({});
  await shareHost(
    c,
    7,
    [
      { type: "user", id: "u2" },
      { type: "role", id: 3 },
    ],
    "edit",
  );
  await shareHost(c, 7, [{ type: "user", id: "u2" }], "view", 24);
  expect(calls[0]).toEqual({
    method: "post",
    url: "/rbac/host/7/share",
    body: {
      targets: [
        { type: "user", id: "u2" },
        { type: "role", id: 3 },
      ],
      permissionLevel: "edit",
    },
  });
  expect(calls[1].body).toMatchObject({ durationHours: 24 });
});

test("changes and removes one grant", async () => {
  const { c, calls } = client({});
  await updateHostAccess(c, 7, 4, "manage");
  await revokeHostAccess(c, 7, 4);
  expect(calls).toEqual([
    {
      method: "patch",
      url: "/rbac/host/7/access/4",
      body: { permissionLevel: "manage" },
    },
    { method: "delete", url: "/rbac/host/7/access/4", body: undefined },
  ]);
});

test("share targets leave out yourself and system roles", async () => {
  const { c } = client({
    "/users/list": {
      users: [
        { id: "me", username: "me" },
        { id: "u2", username: "bob" },
      ],
    },
    "/rbac/roles": {
      roles: [
        { id: 1, name: "admin", isSystem: true },
        { id: 2, name: "ops", displayName: "Ops team" },
      ],
    },
  });
  expect(await getShareTargets(c, "me")).toEqual({
    users: [{ id: "u2", username: "bob" }],
    roles: [{ id: 2, name: "Ops team" }],
  });
});

test("share targets still load when one list is refused", async () => {
  const { c } = client({
    "/users/list": new Error("403"),
    "/rbac/roles": { roles: [{ id: 2, name: "ops" }] },
  });
  expect(await getShareTargets(c)).toEqual({
    users: [],
    roles: [{ id: 2, name: "ops" }],
  });
});

test("names a grant by user or role", () => {
  expect(targetName(record({}))).toBe("alice");
  expect(
    targetName(
      record({
        targetType: "role",
        username: null,
        roleId: 2,
        roleName: "ops",
        roleDisplayName: "Ops team",
      }),
    ),
  ).toBe("Ops team");
  expect(levelLabel("manage")).toBe("Manage");
});
