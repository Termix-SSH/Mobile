import {
  APP_SHORTCUTS,
  comboFor,
  nativeShortcuts,
  shortcutSections,
  shortcutSheet,
  SHORTCUT_ROUTES,
} from "@/core/shortcuts";
import { runShortcut } from "@/core/shortcuts/useAppShortcuts";
import { palette } from "@/screens/palette/store";

jest.mock("expo-router", () => ({ useRouter: () => ({}) }));

const PLATFORMS = ["ios", "android"] as const;

test.each(PLATFORMS)("no two shortcuts share a key on %s", (os) => {
  const seen = APP_SHORTCUTS.map((s) => {
    const combo = comboFor(s, os)!;
    return `${[...combo.modifiers].sort().join("+")}+${combo.input}`;
  });
  expect(new Set(seen).size).toBe(seen.length);
});

test("iOS app shortcuts avoid the keys the terminal already uses", () => {
  const taken = ["t", "w", "f", "v", "0", "-", "=", "."];
  for (const s of APP_SHORTCUTS) {
    if (s.ios.modifiers.length === 1 && s.ios.modifiers[0] === "cmd") {
      expect(taken).not.toContain(s.ios.input);
    }
  }
});

test("Android combos never take a bare Ctrl key from the shell", () => {
  for (const s of APP_SHORTCUTS) {
    const mods = s.android.modifiers;
    expect(mods).toContain("ctrl");
    expect(mods.length).toBeGreaterThan(1);
  }
});

test("Android keeps off the terminal's Ctrl Shift 1 to 9 tab keys", () => {
  for (const s of APP_SHORTCUTS) {
    const { modifiers, input } = s.android;
    const isTab =
      modifiers.includes("shift") &&
      modifiers.length === 2 &&
      /^[1-9]$/.test(input);
    expect(isTab).toBe(false);
  }
});

test.each(PLATFORMS)(
  "the native list has a title for every shortcut on %s",
  (os) => {
    const native = nativeShortcuts(os);
    expect(native).toHaveLength(APP_SHORTCUTS.length);
    expect(native.every((n) => n.title.length > 0)).toBe(true);
  },
);

test("other platforms register nothing", () => {
  expect(nativeShortcuts("web")).toEqual([]);
});

test("the sheet lists app and terminal shortcuts on iOS and Android", () => {
  for (const os of PLATFORMS) {
    expect(shortcutSections(os).map((s) => s.title)).toEqual([
      "App",
      "Go to",
      "Terminal",
    ]);
  }
  expect(shortcutSections("web").map((s) => s.title)).toEqual(["Terminal"]);
});

test("the sheet shows each platform's own keys", () => {
  const ios = shortcutSections("ios")[0].rows.map((r) => r.keys);
  const android = shortcutSections("android")[0].rows.map((r) => r.keys);
  expect(ios[0]).toBe("Cmd K");
  expect(android[0]).toBe("Ctrl Shift K");
});

test("running a shortcut opens the palette, the sheet or a route", () => {
  const go = jest.fn();
  expect(runShortcut("palette", go)).toBe(true);
  expect(palette.isOpen()).toBe(true);
  palette.close();
  expect(runShortcut("shortcuts", go)).toBe(true);
  expect(shortcutSheet.isOpen()).toBe(true);
  shortcutSheet.close();
  expect(runShortcut("goHosts", go)).toBe(true);
  expect(go).toHaveBeenCalledWith(SHORTCUT_ROUTES.goHosts);
  expect(runShortcut("nope", go)).toBe(false);
});
