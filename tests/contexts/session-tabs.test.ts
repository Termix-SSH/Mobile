import {
  displayTitle,
  moveTab,
  neighborTab,
  pickActiveTab,
} from "@/contexts/session-tabs";

const tabs = [{ id: "a" }, { id: "b" }, { id: "c" }];

test("a name the user gave wins, then the shell's title, then the tab's own", () => {
  expect(displayTitle({ title: "web" })).toBe("web");
  expect(displayTitle({ title: "web", shellTitle: "vim" })).toBe("vim");
  expect(
    displayTitle({ title: "web", shellTitle: "vim", customTitle: "prod" }),
  ).toBe("prod");
  expect(displayTitle({ title: "web", customTitle: "  " })).toBe("web");
});

test("tabs move to a new place, clamped to the ends", () => {
  expect(moveTab(tabs, "a", 2).map((t) => t.id)).toEqual(["b", "c", "a"]);
  expect(moveTab(tabs, "c", -5).map((t) => t.id)).toEqual(["c", "a", "b"]);
  expect(moveTab(tabs, "b", 1)).toBe(tabs);
  expect(moveTab(tabs, "zz", 0)).toBe(tabs);
});

test("swipes go to the next or previous tab and wrap around", () => {
  expect(neighborTab(tabs, "a", 1)?.id).toBe("b");
  expect(neighborTab(tabs, "a", -1)?.id).toBe("c");
  expect(neighborTab(tabs, "c", 1)?.id).toBe("a");
  expect(neighborTab([{ id: "a" }], "a", 1)).toBeNull();
});

test("an open tab is always active, even when the active id went stale", () => {
  expect(pickActiveTab(tabs, "b")).toBe("b");
  expect(pickActiveTab(tabs, "gone")).toBe("c");
  expect(pickActiveTab(tabs, null)).toBe("c");
  expect(
    pickActiveTab([{ id: "a", isActive: true }, { id: "b" }], "gone"),
  ).toBe("a");
  expect(pickActiveTab([], "a")).toBeNull();
});
