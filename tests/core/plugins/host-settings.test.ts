import {
  humanize,
  lookupString,
  parseHostSettings,
} from "@/core/plugins/host-settings";

test("host settings keep known fields and drop broken ones", () => {
  const parsed = parseHostSettings({
    enableKey: "enableDatabases",
    enableDefault: false,
    editorGroup: "ssh",
    fields: [
      { key: "showPanel", type: "boolean", labelKey: "a.b", default: true },
      {
        key: "mode",
        type: "select",
        options: [{ value: "x", labelKey: "o" }, { bad: 1 }],
      },
      { key: "weird", type: "nope" },
      { type: "string" },
    ],
  });
  expect(parsed).toEqual({
    enableKey: "enableDatabases",
    enableDefault: false,
    editorGroup: "ssh",
    fields: [
      { key: "showPanel", type: "boolean", labelKey: "a.b", default: true },
      { key: "mode", type: "select", options: [{ value: "x", labelKey: "o" }] },
    ],
  });
  expect(parseHostSettings({ fields: [] })).toBeUndefined();
  expect(parseHostSettings(null)).toBeUndefined();
  expect(
    parseHostSettings({ fields: [{ key: "a", type: "string" }] })?.editorGroup,
  ).toBe("top");
});

test("labels fall back to the key in plain words", () => {
  expect(humanize("showPanel")).toBe("Show panel");
  expect(humanize("max_retries")).toBe("Max retries");
});

test("strings are found by dotted key, nested or flat", () => {
  const strings = {
    settings: { host: { showPanel: { label: "Show the panel" } } },
    "flat.key": "Flat",
  };
  expect(lookupString(strings, "settings.host.showPanel.label")).toBe(
    "Show the panel",
  );
  expect(lookupString(strings, "flat.key")).toBe("Flat");
  expect(lookupString(strings, "missing.key")).toBeUndefined();
  expect(lookupString(undefined, "x")).toBeUndefined();
});
