import { localRepositories } from "@/core/data/local";
import { adminDefaults, folders as foldersTable } from "@/core/db/schema";
import { defaultSyncId } from "@/core/hosts/defaults/store";
import { resetStorage } from "../../../helpers/http";
import { testStores } from "../../../helpers/db";

beforeEach(resetStorage);

function setup() {
  const { stores } = testStores();
  const repos = localRepositories("local", stores);
  return { stores, repos, defaults: repos.hostDefaults! };
}

const draft = {
  name: "web",
  ip: "10.0.0.5",
  port: 22,
  username: "",
  authType: "password" as const,
  password: "x",
};

test("sync ids follow core's wire format", () => {
  expect(defaultSyncId({ level: "user" }, "core.sshPort")).toBe(
    "u:core.sshPort",
  );
  expect(
    defaultSyncId({ level: "folder", folderSyncId: "f1" }, "core.sshPort"),
  ).toBe("f:f1:core.sshPort");
});

test("a host made on the phone gets the user defaults", async () => {
  const { repos, defaults } = setup();
  await defaults.set({ level: "user" }, "core.username", "deploy");
  await defaults.set({ level: "user" }, "ssh-terminal.theme", "nord");
  const host = await repos.hosts.create({ ...draft, port: 2200 });
  expect(host.username).toBe("deploy");
  expect(host.port).toBe(2200);
  expect(host.pluginSettings?.["ssh-terminal"]).toMatchObject({
    theme: "nord",
  });
});

test("the index lists user and folder levels", async () => {
  const { stores, defaults } = setup();
  const { db } = await stores.get("local");
  db.insert(foldersTable).values({ syncId: "fold-1", name: "Prod" }).run();
  await defaults.set({ level: "folder", folder: "Prod" }, "core.sshPort", 2022);
  await defaults.set({ level: "user" }, "core.username", "me");
  const index = await defaults.index();
  expect(index.user.get("core.username")).toBe("me");
  expect(index.folders.get("Prod")?.values.get("core.sshPort")).toBe(2022);
});

test("a folder default applies to hosts in that folder", async () => {
  const { stores, repos, defaults } = setup();
  const { db } = await stores.get("local");
  db.insert(foldersTable).values({ syncId: "fold-1", name: "Prod" }).run();
  await defaults.set({ level: "folder", folder: "Prod" }, "core.username", "p");
  const inside = await repos.hosts.create({ ...draft, folder: "Prod" });
  const outside = await repos.hosts.create({ ...draft });
  expect(inside.username).toBe("p");
  expect(outside.username).toBe("");
});

test("changing a default updates hosts that follow it, not their own values", async () => {
  const { repos, defaults } = setup();
  await defaults.set({ level: "user" }, "core.username", "one");
  const follower = await repos.hosts.create({ ...draft });
  const own = await repos.hosts.create({ ...draft, username: "mine" });
  await defaults.set({ level: "user" }, "core.username", "two");
  expect((await repos.hosts.get(follower.id))?.username).toBe("two");
  expect((await repos.hosts.get(own.id))?.username).toBe("mine");
  await defaults.unset({ level: "user" }, "core.username");
  expect((await repos.hosts.get(own.id))?.username).toBe("mine");
});

test("editing a followed value makes it the host's own", async () => {
  const { repos, defaults } = setup();
  await defaults.set({ level: "user" }, "core.username", "one");
  const host = await repos.hosts.create({ ...draft });
  await repos.hosts.update(host.id, { ...draft, username: "custom" });
  await defaults.set({ level: "user" }, "core.username", "two");
  expect((await repos.hosts.get(host.id))?.username).toBe("custom");
});

test("a folder that does not exist is refused", async () => {
  const { defaults } = setup();
  await expect(
    defaults.set({ level: "folder", folder: "Nope" }, "core.username", "x"),
  ).rejects.toThrow("No folder");
});

test("the admin snapshot shows in the index", async () => {
  const { stores, defaults } = setup();
  const { db } = await stores.get("local");
  db.insert(adminDefaults)
    .values({ id: 1, values: JSON.stringify({ "core.sshPort": 2300 }) })
    .run();
  expect((await defaults.index()).admin.get("core.sshPort")).toBe(2300);
});

test("a sub-host follows its parent's folder defaults", async () => {
  const { stores, repos, defaults } = setup();
  const { db } = await stores.get("local");
  db.insert(foldersTable).values({ syncId: "fold-1", name: "Prod" }).run();
  await defaults.set({ level: "folder", folder: "Prod" }, "core.username", "p");
  const parent = await repos.hosts.create({ ...draft, folder: "Prod" });
  const child = await repos.hosts.create({
    ...draft,
    parentHostId: parent.id,
  });
  const grandchild = await repos.hosts.create({
    ...draft,
    parentHostId: child.id,
  });
  expect(child.username).toBe("p");
  expect(grandchild.username).toBe("p");

  await defaults.set({ level: "folder", folder: "Prod" }, "core.username", "q");
  expect((await repos.hosts.get(grandchild.id))?.username).toBe("q");

  // Out from under the parent, it stops following Prod.
  const loose = await repos.hosts.create({ ...draft });
  await repos.hosts.bulkUpdate([loose.id], { parentHostId: parent.id });
  expect((await repos.hosts.get(loose.id))?.username).toBe("q");
});
