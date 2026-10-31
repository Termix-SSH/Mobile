import type { ServerPlugin } from "@/core/api/compat/server-features";
import {
  changedPluginFields,
  fieldValue,
  planPluginFields,
  pluginFieldError,
  readPluginFields,
} from "@/features/plugin-host-fields/fields";
import type { SSHHost } from "@/types";

const plugin = (over: Partial<ServerPlugin>): ServerPlugin => ({
  id: "databases",
  name: "Databases",
  active: true,
  hostSettings: {
    enableKey: "enableDatabases",
    editorGroup: "ssh",
    fields: [
      { key: "showPanel", type: "boolean", default: true },
      { key: "limit", type: "number", min: 1, max: 100 },
      { key: "secretBlob", type: "json" },
      { key: "internal", type: "string", hidden: true },
    ],
  },
  ...over,
});

test("plans skip off, covered and empty plugins", () => {
  const plans = planPluginFields(
    [
      plugin({}),
      plugin({ id: "off", active: false }),
      plugin({ id: "ssh-terminal" }),
      { id: "bare", active: true },
    ],
    new Set(["ssh-terminal"]),
    new Set(),
  );
  expect(plans.map((p) => p.plugin.id)).toEqual(["databases"]);
  expect(plans[0].fields.map((f) => f.key)).toEqual(["showPanel", "limit"]);
  expect(plans[0].webOnly).toBe(true);
  expect(plans[0].enableKey).toBe("enableDatabases");
});

test("a switch the app already has shows the section instead", () => {
  const [plan] = planPluginFields(
    [plugin({})],
    new Set(),
    new Set(["enableDatabases"]),
  );
  expect(plan.enableKey).toBeUndefined();
  expect(plan.toggle).toBe("enableDatabases");
});

test("values come from the host, else the defaults, and only changes go out", () => {
  const [plan] = planPluginFields([plugin({})], new Set(), new Set());
  const host = {
    pluginSettings: { databases: { limit: 5 } },
  } as unknown as SSHHost;
  const before = readPluginFields(plan, host);
  expect(before).toEqual({ enableDatabases: false, showPanel: true, limit: 5 });
  expect(changedPluginFields(plan, before, { ...before })).toEqual({});
  expect(
    changedPluginFields(plan, before, {
      ...before,
      enableDatabases: true,
      limit: "7",
    }),
  ).toEqual({ enableDatabases: true, limit: 7 });
});

test("numbers are checked against their range", () => {
  const [plan] = planPluginFields([plugin({})], new Set(), new Set());
  const label = () => "Limit";
  expect(pluginFieldError(plan, { limit: "0" }, label)).toMatch(/at least 1/);
  expect(pluginFieldError(plan, { limit: "x" }, label)).toMatch(/number/);
  expect(pluginFieldError(plan, { limit: "" }, label)).toBeNull();
  expect(fieldValue({ key: "n", type: "number" }, "")).toBeNull();
  expect(fieldValue({ key: "s", type: "string" }, undefined)).toBe("");
});
