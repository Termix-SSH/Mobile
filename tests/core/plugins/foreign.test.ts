import {
  mayPlaceForeign,
  mergeParts,
  partKey,
  partKeys,
  placePart,
  providersFor,
  readRect,
  splitPartKey,
} from "@/core/plugins/foreign";
import type { ServerPlugin } from "@/core/api/compat/server-features";

const plugin = (id: string, uses: string[] = [], active = true): ServerPlugin =>
  ({
    id,
    active,
    frame: {
      css: false,
      assetVersion: null,
      locales: ["en"],
      contributes: { uses },
    },
  }) as ServerPlugin;

const plugins = [
  plugin("homepage"),
  plugin("docker", ["homepage.widgets"]),
  plugin("alerts", ["homepage.widgets"], false),
  plugin("file-manager", ["terminal.view", "homepage.widgets"]),
  plugin("ssh-terminal"),
];

test("a page places parts under its own id or listed in uses", () => {
  const home = plugins[0];
  expect(
    mayPlaceForeign("homepage", home, "extension", "homepage.widgets"),
  ).toBe(true);
  expect(mayPlaceForeign("homepage", home, "component", "terminal.view")).toBe(
    false,
  );
  expect(
    mayPlaceForeign("file-manager", plugins[3], "component", "terminal.view"),
  ).toBe(true);
  expect(mayPlaceForeign("homepage", home, "frame", "homepage.widgets")).toBe(
    false,
  );
  expect(mayPlaceForeign("homepage", home, "extension", 4)).toBe(false);
});

test("providers are running plugins that list the id or own it", () => {
  expect(
    providersFor(plugins, "homepage", "homepage.widgets").map((p) => p.id),
  ).toEqual(["docker", "file-manager"]);
  expect(
    providersFor(plugins, "file-manager", "terminal.view").map((p) => p.id),
  ).toEqual([]);
  expect(
    providersFor(plugins, "file-manager", "ssh-terminal.view").map((p) => p.id),
  ).toEqual(["ssh-terminal"]);
});

test("merged parts carry their plugin in every marker", () => {
  const items = mergeParts("extension", [
    {
      pluginId: "docker",
      items: [
        {
          id: "docker",
          components: { view: { $foreign: "docker\u0000view" } },
        },
      ],
    },
  ]);
  expect(items[0].pluginId).toBe("docker");
  const keys = [...partKeys(items)];
  expect(keys).toEqual([partKey("docker", "docker\u0000view")]);
  expect(splitPartKey(keys[0])).toEqual({
    pluginId: "docker",
    itemKey: "docker\u0000view",
  });
  expect(splitPartKey("nokey")).toBeNull();
});

test("slot parts sort by order and a component list keeps one", () => {
  const slot = mergeParts("slot", [
    { pluginId: "b", items: [{ actionId: "b.x", order: 2 }] },
    { pluginId: "a", items: [{ actionId: "a.x", order: 1 }] },
  ]);
  expect(slot.map((item) => item.actionId)).toEqual(["a.x", "b.x"]);
  expect(
    mergeParts("component", [
      { pluginId: "a", items: [{ key: "component" }] },
      { pluginId: "b", items: [{ key: "component" }] },
    ]),
  ).toHaveLength(1);
});

test("a part is clipped to the page and hides when covered or scrolled out", () => {
  const page = { width: 400, height: 800 };
  const base = {
    rect: { x: 0, y: 700, width: 400, height: 200 },
    clip: null,
    visible: true,
    covers: [],
  };
  const out = placePart(page, base);
  expect(out.hidden).toBe(false);
  expect(out.shown).toEqual({ x: 0, y: 700, width: 400, height: 100 });
  // A spot claimed outside the page shows nothing.
  expect(
    placePart(page, {
      ...base,
      rect: { x: -500, y: -500, width: 100, height: 100 },
    }).hidden,
  ).toBe(true);
  expect(
    placePart(page, {
      ...base,
      covers: [{ x: 10, y: 750, width: 10, height: 10 }],
    }).hidden,
  ).toBe(true);
  expect(placePart(page, { ...base, visible: false }).hidden).toBe(true);
  expect(
    placePart(page, { ...base, clip: { x: 0, y: 0, width: 400, height: 600 } })
      .hidden,
  ).toBe(true);
});

test("rects from the page are checked and bounded", () => {
  expect(readRect({ x: 1, y: 2, width: 3, height: 4 })).toEqual({
    x: 1,
    y: 2,
    width: 3,
    height: 4,
  });
  expect(readRect({ x: "1", y: 0, width: 1, height: 1 })).toBeNull();
  expect(readRect({ x: 1e9, y: 0, width: -1, height: 1 })).toEqual({
    x: 100_000,
    y: 0,
    width: 0,
    height: 1,
  });
});
