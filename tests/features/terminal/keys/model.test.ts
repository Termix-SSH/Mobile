import {
  KEY_PALETTE,
  defaultLayout,
  migrateLegacy,
  paletteKey,
  readLayout,
} from "@/features/terminal/keys/model";

test("the default layout has the asked for keys and a tmux row", () => {
  const layout = defaultLayout();
  const main = layout.rows[0].groups.flatMap((g) => g.keys.map((k) => k.id));
  for (const id of [
    "escape",
    "tab",
    "ctrl",
    "alt",
    "arrowUp",
    "arrowDown",
    "arrowLeft",
    "arrowRight",
    "pipe",
    "tilde",
  ]) {
    expect(main).toContain(id);
  }
  const tmux = layout.rows.find((r) => r.id === "tmux")!;
  const ids = tmux.groups.flatMap((g) => g.keys.map((k) => k.id));
  expect(ids).toEqual(
    expect.arrayContaining([
      "tmuxPrefix",
      "tmuxSplitH",
      "tmuxSplitV",
      "tmuxNext",
      "tmuxWindows",
      "tmuxPaneLeft",
      "tmuxCopy",
    ]),
  );
  expect(layout.tmuxPrefix).toBe("b");
});

test("every default key comes from the palette", () => {
  for (const row of defaultLayout().rows) {
    for (const group of row.groups) {
      for (const key of group.keys) expect(KEY_PALETTE[key.id]).toBeDefined();
    }
  }
});

test("keys with variants get them, repeating arrows do not", () => {
  expect(paletteKey("minus")?.variants?.map((v) => v.label)).toEqual([
    "_",
    "=",
    "+",
  ]);
  expect(paletteKey("arrowUp")?.variants).toBeUndefined();
  expect(paletteKey("nope")).toBeNull();
});

test("a saved layout reads back and bad parts are dropped", () => {
  const layout = defaultLayout();
  expect(readLayout(JSON.stringify(layout))).toEqual(layout);
  const read = readLayout({
    tmuxPrefix: "ZZ",
    rows: [
      {
        id: "r",
        label: "R",
        groups: [
          {
            id: "g",
            label: "G",
            keys: [
              { id: "ok", label: "OK", action: { type: "text", text: "x" } },
              { id: "bad", action: { type: "nope" } },
              { id: "c", action: { type: "ctrl", char: "ab" } },
            ],
          },
          "junk",
        ],
      },
      { label: "no id" },
    ],
  });
  expect(read?.rows).toHaveLength(1);
  expect(read?.rows[0].groups[0].keys.map((k) => k.id)).toEqual(["ok"]);
  expect(read?.tmuxPrefix).toBe("b");
  expect(readLayout("not json")).toBeNull();
  expect(readLayout({ rows: [] })).toBeNull();
});

test("the 1.x key bar and keyboard rows move over", () => {
  const moved = migrateLegacy({
    topBar: {
      pinnedKeys: [{ id: "escape", label: "Esc", value: "\x1b" }],
      keys: [{ id: "custom1", label: "Hi", value: "hi" }, { id: 3 }],
    },
    fullKeyboard: {
      rows: [
        { id: "nav", label: "Nav", visible: true, keys: [{ id: "home" }] },
        { id: "off", label: "Off", visible: false, keys: [{ id: "end" }] },
      ],
    },
  })!;
  expect(moved.rows.map((r) => r.id)).toEqual(["main", "nav", "tmux"]);
  expect(moved.rows[0].groups[0].keys.map((k) => k.id)).toEqual([
    "escape",
    "custom1",
  ]);
  expect(moved.rows[0].groups[0].keys[1].action).toEqual({
    type: "raw",
    data: "hi",
  });
  expect(migrateLegacy(null)).toBeNull();
  expect(migrateLegacy({ topBar: { keys: [] } })).toBeNull();
});
