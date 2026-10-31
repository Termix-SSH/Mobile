import {
  TERMINAL_SHORTCUTS,
  nextFontSize,
  shortcutHelp,
} from "@/features/terminal/shortcuts";
import { tabNumber } from "@/contexts/session-tabs";

test("tab shortcuts carry their number", () => {
  expect(tabNumber("tab1")).toBe(1);
  expect(tabNumber("tab9")).toBe(9);
  expect(tabNumber("tab0")).toBeNull();
  expect(tabNumber("newTab")).toBeNull();
});

test("the terminal keeps find and font size, the rest go to the tab bar", () => {
  expect(TERMINAL_SHORTCUTS.has("find")).toBe(true);
  expect(TERMINAL_SHORTCUTS.has("fontReset")).toBe(true);
  expect(TERMINAL_SHORTCUTS.has("closeTab")).toBe(false);
});

test("font shortcuts step by one and stay in range", () => {
  const range = { min: 8, max: 32, reset: 14 };
  expect(nextFontSize(14, "fontBigger", range)).toBe(15);
  expect(nextFontSize(8, "fontSmaller", range)).toBe(8);
  expect(nextFontSize(32, "fontBigger", range)).toBe(32);
  expect(nextFontSize(20, "fontReset", range)).toBe(14);
});

test("each platform lists its own keys", () => {
  expect(shortcutHelp("ios")[0].keys).toBe("Cmd T");
  expect(shortcutHelp("android")[0].keys).toBe("Ctrl Shift T");
});
