import { TERMINAL_THEMES } from "@/constants/terminal-themes";
import {
  nativeTheme,
  paletteOf,
  resolveTerminalColors,
  resolveTerminalSettings,
  terminalFont,
} from "@/features/terminal/settings";

const FAMILIES = [
  "dark",
  "light",
  "dracula",
  "catppuccin",
  "nord",
  "solarized",
  "tokyo-night",
  "one-dark",
  "gruvbox",
];

describe("resolveTerminalColors", () => {
  test("Termix Default takes the app theme's background in all nine families", () => {
    const seen = new Set<string>();
    for (const family of FAMILIES) {
      const c = resolveTerminalColors("termix", family);
      seen.add(c.background);
      expect(c.cursor).toBe(c.foreground);
      expect(c.cursorAccent).toBe(c.background);
    }
    expect(seen.size).toBe(FAMILIES.length);
  });

  test("the light family uses the light palette, the rest the dark one", () => {
    expect(resolveTerminalColors("termix", "light").red).toBe(
      TERMINAL_THEMES.termixLight.colors.red,
    );
    expect(resolveTerminalColors("termix", "nord").red).toBe(
      TERMINAL_THEMES.termixDark.colors.red,
    );
  });

  test("a named theme ignores the app theme", () => {
    expect(resolveTerminalColors("dracula", "light")).toEqual(
      TERMINAL_THEMES.dracula.colors,
    );
  });

  test("custom uses its colors, or the dark default without any", () => {
    const custom = { ...TERMINAL_THEMES.nord.colors, background: "#123456" };
    expect(resolveTerminalColors("custom", "dark", custom).background).toBe(
      "#123456",
    );
    expect(resolveTerminalColors("custom", "dark", null)).toEqual(
      TERMINAL_THEMES.termixDark.colors,
    );
  });

  test("an unknown theme falls back to Termix Dark", () => {
    expect(resolveTerminalColors("gone", "dark")).toEqual(
      TERMINAL_THEMES.termixDark.colors,
    );
  });
});

test("the native theme has the 16 colors in ANSI order", () => {
  const c = TERMINAL_THEMES.gruvboxDark.colors;
  const t = nativeTheme(c);
  expect(t.palette).toHaveLength(16);
  expect(t.palette[1]).toBe(c.red);
  expect(t.palette[15]).toBe(c.brightWhite);
  expect(paletteOf(c)[8]).toBe(c.brightBlack);
  expect(t.cursor).toBe(c.cursor ?? c.foreground);
});

test("old and desktop font names map to the bundled fonts", () => {
  expect(terminalFont(undefined)).toBe("CaskaydiaCove NFM");
  expect(terminalFont("Caskaydia Cove Nerd Font Mono")).toBe(
    "CaskaydiaCove NFM",
  );
  expect(terminalFont("JetBrains Mono")).toBe("JetBrainsMono NFM");
  expect(terminalFont("Fira Code")).toBe("FiraCode Nerd Font Mono");
  expect(terminalFont("Monaco")).toBe("monospace");
  expect(terminalFont("Comic Mono")).toBe("CaskaydiaCove NFM");
  expect(terminalFont("monospace")).toBe("monospace");
});

describe("resolveTerminalSettings", () => {
  test("the host's look wins, but the size stays the phone's", () => {
    const s = resolveTerminalSettings(
      { theme: "nord", fontSize: 13, cursorStyle: "block" },
      { theme: "dracula", fontSize: 20, cursorStyle: "bar" },
      "dark",
    );
    expect(s.colors).toEqual(TERMINAL_THEMES.dracula.colors);
    expect(s.cursor.style).toBe("bar");
    expect(s.fontSize).toBe(13);
  });

  test("a host may pick its own font", () => {
    const s = resolveTerminalSettings(
      { fontFamily: "JetBrainsMono NFM" },
      { fontFamily: "Fira Code" },
      "dark",
    );
    expect(s.fontFamily).toBe("FiraCode Nerd Font Mono");
    expect(
      resolveTerminalSettings({ fontFamily: "JetBrainsMono NFM" }, {}, "dark")
        .fontFamily,
    ).toBe("JetBrainsMono NFM");
  });

  test("large text grows the drawn size, capped", () => {
    expect(
      resolveTerminalSettings({ fontSize: 14 }, undefined, "dark", 1.3)
        .scaledFontSize,
    ).toBe(18);
    expect(
      resolveTerminalSettings({ fontSize: 14 }, undefined, "dark", 3)
        .scaledFontSize,
    ).toBe(22.5);
    expect(
      resolveTerminalSettings({ fontSize: 14 }, undefined, "dark", 0.8)
        .scaledFontSize,
    ).toBe(14);
  });

  test("values out of range are clamped", () => {
    const s = resolveTerminalSettings(
      { fontSize: 200, lineHeight: 9, scrollback: 5 },
      undefined,
      "dark",
    );
    expect(s.fontSize).toBe(32);
    expect(s.lineHeight).toBe(2);
    expect(s.scrollback).toBe(100);
  });

  test("defaults when nothing is set", () => {
    const s = resolveTerminalSettings({}, undefined, "dark");
    expect(s).toMatchObject({
      fontFamily: "CaskaydiaCove NFM",
      fontSize: 14,
      cursor: { style: "block", blink: true },
      bell: { style: "none", haptics: true },
      linkPolicy: "confirm",
      optionAsMeta: false,
    });
  });

  test("links open directly only when asked", () => {
    expect(
      resolveTerminalSettings(
        { linkClickBehavior: "direct" },
        undefined,
        "dark",
      ).linkPolicy,
    ).toBe("direct");
    expect(
      resolveTerminalSettings(
        { linkClickBehavior: "default" },
        undefined,
        "dark",
      ).linkPolicy,
    ).toBe("confirm");
  });
});
