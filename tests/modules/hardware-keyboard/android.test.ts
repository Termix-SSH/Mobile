import fs from "node:fs";
import path from "node:path";
import { APP_SHORTCUTS } from "@/core/shortcuts";

// The Android module parses what JS sends by string. A modifier name that
// changes on one side only would silently never match.
const root = path.join(__dirname, "../../..", "modules/hardware-keyboard");
const kotlin = fs.readFileSync(
  path.join(
    root,
    "android/src/main/java/expo/modules/hardwarekeyboard/AppShortcut.kt",
  ),
  "utf8",
);

test("the Android module reads every modifier JS sends", () => {
  const sent = new Set(APP_SHORTCUTS.flatMap((s) => s.android.modifiers));
  for (const name of sent) {
    expect(kotlin).toContain(`"${name}" in modifiers`);
  }
});

test("the module is registered for Android and uses the shared events", () => {
  const config = JSON.parse(
    fs.readFileSync(path.join(root, "expo-module.config.json"), "utf8"),
  );
  expect(config.platforms).toContain("android");
  expect(config.android.modules).toEqual([
    "expo.modules.hardwarekeyboard.HardwareKeyboardModule",
  ]);
  const module = fs.readFileSync(
    path.join(
      root,
      "android/src/main/java/expo/modules/hardwarekeyboard/HardwareKeyboardModule.kt",
    ),
    "utf8",
  );
  expect(module).toContain('Name("HardwareKeyboard")');
  expect(module).toContain('"onAppShortcut"');
  expect(module).toContain('"setAppShortcuts"');
});

test("Android shortcut keys are single characters", () => {
  for (const s of APP_SHORTCUTS) expect(s.android.input).toHaveLength(1);
});
