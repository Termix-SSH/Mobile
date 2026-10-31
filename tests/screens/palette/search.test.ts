import {
  rankPalette,
  scoreItem,
  type PaletteItem,
} from "@/screens/palette/search";

const item = (
  id: string,
  section: PaletteItem["section"],
  label: string,
  extra: Partial<PaletteItem> = {},
): PaletteItem => ({ id, section, label, run: jest.fn(), ...extra });

const items = [
  item("h1", "hosts", "web-prod", { detail: "root@10.0.0.5", suggested: true }),
  item("h2", "hosts", "prod db", { keywords: ["Servers", "postgres"] }),
  item("h3", "hosts", "staging", { keywords: ["prod"] }),
  item("s1", "snippets", "Restart nginx", { detail: "systemctl restart" }),
  item("a1", "actions", "Add host", { suggested: true }),
  item("t1", "settings", "Terminal", { detail: "Font, theme" }),
];

test("prefix beats word start beats substring beats other fields", () => {
  expect(scoreItem(items[1], "prod")).toBe(0);
  expect(scoreItem(items[0], "prod")).toBe(1);
  expect(scoreItem(items[2], "prod")).toBe(3);
  expect(scoreItem(items[0], "xyz")).toBeNull();
});

test("every word of the query has to match", () => {
  expect(scoreItem(items[1], "prod postgres")).toBe(3);
  expect(scoreItem(items[1], "prod mysql")).toBeNull();
});

test("results come grouped in section order, best first", () => {
  const groups = rankPalette(items, "prod");
  expect(groups.map((g) => g.section)).toEqual(["hosts"]);
  expect(groups[0].items.map((i) => i.id)).toEqual(["h2", "h1", "h3"]);
  expect(rankPalette(items, "10.0.0.5")[0].items[0].id).toBe("h1");
  expect(rankPalette(items, "font")[0].section).toBe("settings");
});

test("an empty query shows only suggested items", () => {
  const groups = rankPalette(items, "  ");
  expect(groups.flatMap((g) => g.items.map((i) => i.id))).toEqual(["h1", "a1"]);
});

test("each section is capped", () => {
  const many = Array.from({ length: 20 }, (_, i) =>
    item(`h${i}`, "hosts", `host ${i}`),
  );
  expect(rankPalette(many, "host", 5)[0].items).toHaveLength(5);
});
