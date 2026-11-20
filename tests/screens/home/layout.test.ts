import { mergeLayout, parseLayout, resolveLayout } from "@/screens/home/layout";

const entry = (key: string, order: number, defaultOn = true) => ({
  key,
  order,
  defaultOn,
});

test("bad saved data means the default layout", () => {
  expect(parseLayout(null)).toBeNull();
  expect(parseLayout("x")).toBeNull();
  expect(parseLayout({ version: 2, slots: [] })).toBeNull();
  expect(parseLayout({ version: 1, slots: "no" })).toBeNull();
});

test("parsing drops broken and repeated slots", () => {
  expect(
    parseLayout({
      version: 1,
      slots: [
        { key: "a", hidden: true },
        { key: "a" },
        { key: 3 },
        null,
        { key: "b", hidden: "yes" },
      ],
    }),
  ).toEqual({
    version: 1,
    slots: [
      { key: "a", hidden: true },
      { key: "b", hidden: false },
    ],
  });
});

test("no saved layout shows cards by order, hiding the ones off by default", () => {
  const out = resolveLayout(null, [
    entry("c", 30),
    entry("a", 10),
    entry("b", 20, false),
  ]);
  expect(out.map((p) => [p.entry.key, p.hidden])).toEqual([
    ["a", false],
    ["b", true],
    ["c", false],
  ]);
});

test("saved order wins, new cards go last, missing ones are skipped", () => {
  const out = resolveLayout(
    {
      version: 1,
      slots: [
        { key: "c", hidden: false },
        { key: "gone", hidden: false },
        { key: "a", hidden: true },
      ],
    },
    [entry("a", 10), entry("b", 20), entry("c", 30), entry("d", 5, false)],
  );
  expect(out.map((p) => [p.entry.key, p.hidden])).toEqual([
    ["c", false],
    ["a", true],
    ["d", true],
    ["b", false],
  ]);
});

test("saving keeps cards that weren't shown so they come back later", () => {
  const merged = mergeLayout(
    {
      version: 1,
      slots: [
        { key: "gone", hidden: false },
        { key: "a", hidden: false },
      ],
    },
    [
      { key: "b", hidden: false },
      { key: "a", hidden: true },
    ],
  );
  expect(merged.slots).toEqual([
    { key: "b", hidden: false },
    { key: "a", hidden: true },
    { key: "gone", hidden: false },
  ]);
});
