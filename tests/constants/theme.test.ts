import fs from "node:fs";
import path from "node:path";
import {
  DEFAULT_THEME,
  THEMES,
  THEME_IS_DARK,
  THEME_LABELS,
  THEME_SWATCHES,
  THEME_VARS,
  hexToRgbTriplet,
  resolveTheme,
  tripletToHex,
  uiColorsFor,
  textTokens,
} from "@/constants/theme";

const vars = THEME_VARS as Record<string, Record<string, string>>;
const IDS = [
  "light",
  "dark",
  "dracula",
  "catppuccin",
  "nord",
  "solarized",
  "tokyo-night",
  "one-dark",
  "gruvbox",
];
const TOKENS = Object.keys(vars.dark).sort();

test("every theme has the same full token set", () => {
  expect(Object.keys(vars).sort()).toEqual([...IDS].sort());
  for (const id of IDS) expect(Object.keys(vars[id]).sort()).toEqual(TOKENS);
  for (const t of ["warning", "terminal-bg", "surface", "surface-dim"]) {
    expect(TOKENS).toContain(t);
  }
});

test("every token is a valid RGB triplet", () => {
  for (const id of IDS) {
    for (const v of Object.values(vars[id])) {
      const parts = v.split(" ").map(Number);
      expect(parts).toHaveLength(3);
      for (const n of parts) {
        expect(Number.isInteger(n) && n >= 0 && n <= 255).toBe(true);
      }
    }
  }
});

test("values match core classic themes", () => {
  expect(vars.dark.background).toBe("12 13 11");
  expect(vars.dark["terminal-bg"]).toBe("12 13 11");
  expect(vars.light.background).toBe("255 255 255");
  expect(vars.dracula.primary).toBe("139 233 253");
  expect(vars.gruvbox.warning).toBe("250 189 47");
  // dracula border is rgba(168,179,217,0.18) over #282a36
  expect(vars.dracula.border).toBe("63 67 83");
});

test("only light is a light theme", () => {
  for (const id of IDS) {
    expect((THEME_IS_DARK as Record<string, boolean>)[id]).toBe(id !== "light");
  }
});

test("default theme is dark and system follows the OS", () => {
  expect(DEFAULT_THEME).toBe("dark");
  expect(resolveTheme("system", "light")).toBe("light");
  expect(resolveTheme("system", "dark")).toBe("dark");
  expect(resolveTheme("system", null)).toBe("dark");
  expect(resolveTheme("nord" as any, "light")).toBe("nord");
  expect(resolveTheme("gone" as any, "light")).toBe("dark");
});

test("picker lists every theme with a swatch", () => {
  expect(THEMES[0]).toBe("system");
  expect([...THEMES.slice(1)].sort()).toEqual([...IDS].sort());
  for (const id of IDS) {
    const sw = (THEME_SWATCHES as Record<string, any>)[id];
    for (const c of [sw.background, sw.panel, sw.text]) {
      expect(c).toMatch(/^#[0-9a-f]{6}$/);
    }
    expect((THEME_LABELS as Record<string, string>)[id]).toBeTruthy();
  }
});

test("hex and triplet helpers round trip", () => {
  expect(hexToRgbTriplet("#f59145")).toBe("245 145 69");
  expect(hexToRgbTriplet("fff")).toBe("255 255 255");
  expect(hexToRgbTriplet("nope")).toBeNull();
  expect(tripletToHex("245 145 69")).toBe("#f59145");
  expect(tripletToHex("0 1 2")).toBe("#000102");
});

test("uiColorsFor maps tokens to hex colors", () => {
  const ui = uiColorsFor("dark", "#fff");
  expect(ui.background).toBe("#0c0d0b");
  expect(ui.terminal).toBe("#0c0d0b");
  expect(ui.brand).toBe("#ffffff");
  // Faded text is a solid color that still reads at 4.5:1.
  expect(ui.textFaint).toMatch(/^#[0-9a-f]{6}$/);
  expect(uiColorsFor("light", "nope").brand).toBe("#f59145");
});

test("global.css baselines match the light and dark themes", () => {
  const css = fs.readFileSync(path.join(__dirname, "../../global.css"), "utf8");
  const block = (sel: string) => {
    const body = css.split(sel + " {")[1].split("}")[0];
    const out: Record<string, string> = {};
    for (const m of body.matchAll(/--([\w-]+):\s*([^;]+);/g)) out[m[1]] = m[2];
    return out;
  };
  const root = block(":root");
  expect(root["accent-brand"]).toBe("245 145 69");
  delete root["accent-brand"];
  expect(root).toEqual({
    ...vars.light,
    ...textTokens(vars.light, "245 145 69"),
  });
  expect(block(".dark")).toEqual({
    ...vars.dark,
    ...textTokens(vars.dark, "245 145 69"),
  });
});
