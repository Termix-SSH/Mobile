import type {
  HostEditorSectionDef,
  HostToggleDef,
} from "@/core/features/types";
import {
  applyFormDefaults,
  canJumpThrough,
  folderUnder,
  formError,
  formFromHost,
  parentChoices,
  payloadFromForm,
  sortSections,
  visibleSections,
} from "@/screens/hosts/editor/model";
import { addTags } from "@/screens/hosts/editor/TagsField";
import { moveItem } from "@/screens/hosts/editor/JumpHostsField";
import type { SSHHost } from "@/types";

const toggles: HostToggleDef[] = [
  {
    key: "enableTerminal",
    label: "Terminal",
    group: "feature",
    order: 10,
    defaultOn: true,
  },
  { key: "enableDocker", label: "Docker", group: "feature", order: 40 },
  { key: "enableRdp", label: "RDP", group: "protocol", order: 10 },
];

const host = (over: Partial<SSHHost> = {}): SSHHost =>
  ({
    id: 5,
    name: "web",
    ip: "10.0.0.5",
    port: 2222,
    username: "deploy",
    folder: "Prod",
    tags: ["a"],
    pin: true,
    authType: "password",
    password: "pw",
    sudoPassword: "sudo",
    enableTerminal: true,
    enableTunnel: false,
    enableFileManager: true,
    enableDocker: true,
    defaultPath: "/srv",
    tunnelConnections: [],
    jumpHosts: [{ hostId: 2 }],
    color: "#22c55e",
    icon: "server",
    notes: "n",
    macAddress: "aa:bb:cc:dd:ee:ff",
    createdAt: "",
    updatedAt: "",
    ...over,
  }) as SSHHost;

const section = (
  id: string,
  group: HostEditorSectionDef["group"],
  order: number,
  toggle?: string,
): HostEditorSectionDef => ({
  id,
  label: id,
  group,
  order,
  toggle,
  editor: {
    read: () => ({ v: id }),
    write: (value, payload) => {
      (payload as unknown as Record<string, unknown>)[`wrote_${id}`] = value.v;
    },
    component: () => null,
  },
});

test("a new form takes switch defaults", () => {
  const form = formFromHost(null, toggles);
  expect(form.toggles).toEqual({
    enableTerminal: true,
    enableDocker: false,
    enableRdp: false,
  });
  expect(form.port).toBe("22");
});

test("a host fills the form and comes back as the same payload", () => {
  const form = formFromHost(host(), toggles);
  expect(form).toMatchObject({
    name: "web",
    port: "2222",
    tags: ["a"],
    jumpHosts: [2],
    color: "#22c55e",
    icon: "server",
    toggles: { enableTerminal: true, enableDocker: true, enableRdp: false },
  });
  const payload = payloadFromForm({
    form: { ...form, tags: ["a", "b"] },
    host: host(),
    toggles,
    sections: [section("terminal", "ssh", 10)],
    sectionValues: { terminal: { v: "x" } },
    filledDefaults: {},
    savedSudo: "sudo",
  });
  expect(payload).toMatchObject({
    name: "web",
    ip: "10.0.0.5",
    port: 2222,
    tags: ["a", "b"],
    password: "pw",
    jumpHosts: [{ hostId: 2 }],
    enableDocker: true,
    enableRdp: false,
    color: "#22c55e",
    defaultPath: "/srv",
    macAddress: "aa:bb:cc:dd:ee:ff",
  });
  // An unchanged sudo password stays out, so a secret the phone can't read is kept.
  expect(payload.sudoPassword).toBeUndefined();
  expect((payload as unknown as Record<string, unknown>).wrote_terminal).toBe(
    "x",
  );
});

test("values still as the defaults filled them are left out on a new host", () => {
  const form = applyFormDefaults(
    formFromHost(null, toggles),
    { username: "ops", port: 2200 },
    {},
  );
  expect(form.username).toBe("ops");
  expect(form.port).toBe("2200");
  const payload = payloadFromForm({
    form: { ...form, ip: "h" },
    host: null,
    toggles,
    sections: [],
    sectionValues: {},
    filledDefaults: { username: "ops", port: 2200 },
    savedSudo: "",
  });
  expect(payload.username).toBe("");
  expect(payload.port).toBe(0);
});

test("a folder change swaps the defaults but keeps typed values", () => {
  const start = applyFormDefaults(
    formFromHost(null, toggles),
    { username: "ops", port: 2200 },
    {},
  );
  const next = applyFormDefaults(
    { ...start, username: "me" },
    { username: "root", port: 22 },
    { username: "ops", port: 2200 },
  );
  expect(next.username).toBe("me");
  expect(next.port).toBe("22");
});

test("sections show by group and switch, in group order", () => {
  const all = [
    section("more", "feature", 1),
    section("rdp", "protocol", 10, "enableRdp"),
    section("terminal", "ssh", 10, "enableTerminal"),
    section("wake", "host", 90),
  ];
  const form = formFromHost(host(), toggles);
  expect(sortSections(visibleSections(all, form)).map((s) => s.id)).toEqual([
    "wake",
    "terminal",
    "more",
  ]);
  expect(
    visibleSections(all, { ...form, enableSsh: false }).map((s) => s.id),
  ).not.toContain("terminal");
});

test("save problems are said plainly", () => {
  const form = formFromHost(null, toggles);
  expect(formError(form, toggles)).toBe("Enter the host's address");
  expect(formError({ ...form, ip: "a b" }, toggles)).toMatch(/spaces/);
  expect(formError({ ...form, ip: "h", port: "70000" }, toggles)).toMatch(
    /Port/,
  );
  expect(formError({ ...form, ip: "h" }, toggles)).toMatch(/username/);
  expect(formError({ ...form, ip: "h", enableSsh: false }, toggles)).toMatch(
    /protocol/,
  );
  expect(
    formError(
      { ...form, ip: "h", enableSsh: false, toggles: { enableRdp: true } },
      toggles,
    ),
  ).toBeNull();
  expect(
    formError({ ...form, ip: "h", authType: "credential" }, toggles),
  ).toMatch(/Pick a credential/);
});

test("jump hosts can't loop back to the host", () => {
  const a = host({ id: 1, jumpHosts: [] });
  const b = host({ id: 2, jumpHosts: [{ hostId: 5 }] });
  const c = host({ id: 3, jumpHosts: [{ hostId: 2 }] });
  const byId = new Map([a, b, c].map((h) => [h.id, h]));
  expect(canJumpThrough(a, 5, byId)).toBe(true);
  expect(canJumpThrough(b, 5, byId)).toBe(false);
  expect(canJumpThrough(c, 5, byId)).toBe(false);
  expect(canJumpThrough(host({ id: 5 }), 5, byId)).toBe(false);
  expect(canJumpThrough(b, undefined, byId)).toBe(true);
});

test("tags split on commas and spaces without repeats", () => {
  expect(addTags(["a"], "b, c a ,d")).toEqual(["a", "b", "c", "d"]);
});

test("moving a jump host stays inside the list", () => {
  expect(moveItem([1, 2, 3], 0, 1)).toEqual([2, 1, 3]);
  expect(moveItem([1, 2, 3], 0, -1)).toEqual([1, 2, 3]);
});

describe("parent hosts", () => {
  const h = (id: number, extra: Partial<SSHHost> = {}) =>
    ({ id, name: `h${id}`, ip: "1.1.1.1", folder: "", ...extra }) as SSHHost;
  const list = [
    h(1, { folder: "Prod" }),
    h(2, { parentHostId: 1 }),
    h(3, { parentHostId: 2 }),
    h(4),
    h(5, { shared: { owner: "x", permissionLevel: "view" } }),
  ];

  test("a host can't go under itself, its sub-hosts or a shared host", () => {
    expect(parentChoices(list, [2]).map((x) => x.id)).toEqual([1, 4]);
    expect(parentChoices(list, []).map((x) => x.id)).toEqual([1, 2, 3, 4]);
  });

  test("a sub-host follows its nearest folder", () => {
    expect(folderUnder(list, 3)).toBe("Prod");
    expect(folderUnder(list, 4)).toBe("");
    expect(folderUnder(list, null)).toBe("");
  });

  test("the form keeps the parent and drops the folder", () => {
    const form = formFromHost(h(9, { parentHostId: 1, folder: "Old" }), []);
    expect(form).toMatchObject({ parentHostId: 1, folder: "" });
    const payload = payloadFromForm({
      form: { ...form, folder: "Typed" },
      host: null,
      toggles: [],
      sections: [],
      sectionValues: {},
      filledDefaults: {},
      savedSudo: "",
    } as any);
    expect(payload).toMatchObject({ parentHostId: 1, folder: "" });
  });
});
