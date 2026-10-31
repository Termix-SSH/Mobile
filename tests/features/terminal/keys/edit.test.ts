import {
  addGroup,
  addKey,
  addRow,
  customKey,
  describeAction,
  reorder,
  updateGroup,
  updateRow,
} from "@/features/terminal/keys/edit";
import { defaultLayout, paletteKey } from "@/features/terminal/keys/model";
import { nextSticky } from "@/features/terminal/keys/useKeyPad";

test("reorder moves one item and leaves bad moves alone", () => {
  expect(reorder([1, 2, 3], 0, 2)).toEqual([2, 3, 1]);
  expect(reorder([1, 2, 3], 2, 0)).toEqual([3, 1, 2]);
  expect(reorder([1, 2], 5, 0)).toEqual([1, 2]);
});

test("rows, groups and keys can be added, renamed and removed", () => {
  let layout = addRow(defaultLayout(), "  Git ");
  const row = layout.rows[layout.rows.length - 1];
  expect(row.label).toBe("Git");
  layout = addGroup(layout, row.id, "");
  const groups = layout.rows.find((r) => r.id === row.id)!.groups;
  expect(groups.map((g) => g.label)).toEqual(["Keys", "Keys"]);
  layout = addKey(layout, row.id, groups[0].id, paletteKey("escape")!);
  layout = updateGroup(layout, row.id, groups[1].id, () => null);
  layout = updateRow(layout, row.id, (r) => ({ ...r, label: "Git 2" }));
  const after = layout.rows.find((r) => r.id === row.id)!;
  expect(after.label).toBe("Git 2");
  expect(after.groups).toHaveLength(1);
  expect(after.groups[0].keys[0].id).toBe("escape");
  layout = updateRow(layout, row.id, () => null);
  expect(layout.rows.some((r) => r.id === row.id)).toBe(false);
});

test("custom keys type text, run a command or send Ctrl", () => {
  expect(customKey("", "text", "git ")?.action).toEqual({
    type: "text",
    text: "git ",
  });
  expect(customKey("Top", "command", "htop")).toMatchObject({
    label: "Top",
    action: { type: "raw", data: "htop\r" },
  });
  expect(customKey("", "ctrl", "X")).toMatchObject({
    label: "^X",
    action: { type: "ctrl", char: "x" },
  });
  expect(customKey("a", "text", "")).toBeNull();
  expect(customKey("a", "ctrl", " ")).toBeNull();
  expect(describeAction({ type: "raw", data: "htop\r" })).toBe('Runs "htop"');
  expect(describeAction({ type: "tmux", text: "%" })).toBe(
    'tmux prefix, then "%"',
  );
});

test("sticky modifiers arm, lock on a quick second tap, then turn off", () => {
  expect(nextSticky("inactive", 10_000)).toBe("armed");
  expect(nextSticky("armed", 100)).toBe("locked");
  expect(nextSticky("armed", 1000)).toBe("inactive");
  expect(nextSticky("locked", 100)).toBe("inactive");
});
