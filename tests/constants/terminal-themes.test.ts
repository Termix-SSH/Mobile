import fs from "node:fs";
import path from "node:path";
import { TERMINAL_THEMES } from "@/constants/terminal-themes";

const plugin = path.join(
  __dirname,
  "../../../Plugins/Plugin-SSH-Terminal/src/frontend/look/terminal-themes.ts",
);

// Only the TERMINAL_THEMES literal, without spacing, so formatting can't differ.
function themesBlock(source: string) {
  const start = source.indexOf("export const TERMINAL_THEMES");
  const end = source.indexOf("\n};\n", start);
  return source.slice(start, end).replace(/\s+/g, "");
}

test("every theme has a name and all 16 colors", () => {
  for (const theme of Object.values(TERMINAL_THEMES)) {
    expect(theme.name).toBeTruthy();
    for (const key of [
      "background",
      "foreground",
      "black",
      "red",
      "green",
      "yellow",
      "blue",
      "magenta",
      "cyan",
      "white",
      "brightBlack",
      "brightRed",
      "brightGreen",
      "brightYellow",
      "brightBlue",
      "brightMagenta",
      "brightCyan",
      "brightWhite",
    ] as const) {
      expect(theme.colors[key]).toMatch(/^#[0-9a-f]{6}$/i);
    }
  }
});

const ownTest = fs.existsSync(plugin) ? test : test.skip;

// The plugin sits next to the app in the workspace, not in CI.
ownTest("the themes match Plugin-SSH-Terminal", () => {
  const own = fs.readFileSync(
    path.join(__dirname, "../../src/constants/terminal-themes.ts"),
    "utf8",
  );
  expect(themesBlock(own)).toBe(themesBlock(fs.readFileSync(plugin, "utf8")));
});
