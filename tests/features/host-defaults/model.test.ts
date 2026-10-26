import {
  describeRow,
  envText,
  formatValue,
  keyRows,
  parseEnvText,
  parseRowText,
  pluginRows,
  sourceLabel,
} from "@/features/host-defaults/model";
import { emptyIndex } from "@/core/hosts/defaults/resolve";

function index() {
  const i = emptyIndex();
  i.admin.set("core.sshPort", 2200);
  i.user.set("core.username", "me");
  i.user.set("ssh-terminal.theme", "nord");
  i.folders.set("Prod", {
    name: "Prod",
    values: new Map<string, unknown>([["core.sshPort", 2022]]),
  });
  return i;
}

const find = (rows: ReturnType<typeof keyRows>, key: string) =>
  rows.find((row) => row.fullKey === key)!;

test("user rows show own values and what the rest inherit", () => {
  const rows = keyRows(index(), { level: "user" });
  expect(find(rows, "core.username")).toMatchObject({
    own: true,
    value: "me",
  });
  expect(find(rows, "core.sshPort")).toMatchObject({
    own: false,
    value: 2200,
    source: { level: "admin" },
  });
  expect(find(rows, "core.keepaliveInterval").source).toEqual({
    level: "builtin",
  });
});

test("folder rows inherit from the user level, not from themselves", () => {
  const rows = keyRows(index(), { level: "folder", folder: "Prod" });
  expect(find(rows, "core.sshPort")).toMatchObject({ own: true, value: 2022 });
  expect(find(rows, "core.username")).toMatchObject({
    own: false,
    value: "me",
    source: { level: "user" },
  });
});

test("jump hosts are listed for user and folder only", () => {
  const rows = keyRows(index(), { level: "user" });
  expect(find(rows, "core.jumpHosts").kind).toBe("readonly");
});

test("plugin keys of a level are listed by name", () => {
  expect(pluginRows(index(), { level: "user" })).toEqual([
    { fullKey: "ssh-terminal.theme", text: "nord" },
  ]);
  expect(pluginRows(index(), { level: "folder", folder: "Nope" })).toEqual([]);
});

test("values read as short text", () => {
  expect(formatValue(null)).toBe("Not set");
  expect(formatValue(true)).toBe("On");
  expect(formatValue(22)).toBe("22");
  expect(formatValue({ a: 1 })).toBe('{"a":1}');
});

test("rows describe themselves by kind", () => {
  expect(
    describeRow({
      kind: "auth",
      value: { authType: "credential", credentialId: 3 },
    }),
  ).toBe("Credential 3");
  expect(
    describeRow(
      { kind: "auth", value: { authType: "credential", credentialId: 3 } },
      () => "deploy key",
    ),
  ).toBe("deploy key");
  expect(describeRow({ kind: "auth", value: { authType: "none" } })).toBe(
    "None",
  );
  expect(describeRow({ kind: "auth", value: undefined })).toBe("Not set");
  expect(describeRow({ kind: "env", value: [{ key: "A", value: "1" }] })).toBe(
    "1 set",
  );
  expect(describeRow({ kind: "env", value: [] })).toBe("Not set");
  expect(describeRow({ kind: "readonly", value: [] })).toBe("Not set");
  expect(describeRow({ kind: "readonly", value: [{ hostId: 1 }] })).toBe("Set");
  expect(describeRow({ kind: "number", value: 22 })).toBe("22");
});

test("sources read in words", () => {
  expect(sourceLabel(null)).toBe("");
  expect(sourceLabel({ level: "admin" })).toBe("From the server");
  expect(sourceLabel({ level: "user" })).toBe("From your defaults");
  expect(sourceLabel({ level: "folder", folderName: "Prod" })).toBe(
    "From Prod",
  );
  expect(sourceLabel({ level: "builtin" })).toBe("Built in");
});

test("environment text round trips and drops bad lines", () => {
  const list = parseEnvText("A=1\nbad line\n=x\nB=a=b\r\n1C=no");
  expect(list).toEqual([
    { key: "A", value: "1" },
    { key: "B", value: "a=b" },
  ]);
  expect(envText(list)).toBe("A=1\nB=a=b");
});

test("typed text becomes a stored value or is refused", () => {
  expect(parseRowText("number", " 30 ")).toBe(30);
  expect(parseRowText("number", "")).toBeNull();
  expect(parseRowText("number", "-1")).toBeNull();
  expect(parseRowText("text", " root ")).toBe("root");
  expect(parseRowText("text", " ")).toBeNull();
  expect(parseRowText("env", "A=1")).toEqual([{ key: "A", value: "1" }]);
  expect(parseRowText("switch", "x")).toBeNull();
});
