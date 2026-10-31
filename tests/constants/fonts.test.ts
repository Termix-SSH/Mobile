import { TERMINAL_FONTS } from "@/features/terminal/settings";
import fs from "node:fs";
import path from "node:path";

const root = path.join(__dirname, "../..");
const config = JSON.parse(
  fs.readFileSync(path.join(root, "app.json"), "utf8"),
).expo;
const fontPlugin = config.plugins.find(
  (p: unknown) => Array.isArray(p) && p[0] === "expo-font",
)[1];
const fontsTs = fs.readFileSync(
  path.join(root, "src/constants/fonts.ts"),
  "utf8",
);
const terminalFont = () => fontsTs.match(/TERMINAL_FONT = "([^"]+)"/)![1];

// Every font the terminal offers, with the files and license that ship it.
const BUNDLED = [
  {
    family: "CaskaydiaCove NFM",
    base: "CaskaydiaCoveNerdFontMono",
    styles: ["Regular", "Bold", "Italic", "BoldItalic"],
    license: "LICENSE-CaskaydiaCove.txt",
  },
  {
    family: "JetBrainsMono NFM",
    base: "JetBrainsMonoNerdFontMono",
    styles: ["Regular", "Bold"],
    license: "LICENSE-JetBrainsMono.txt",
  },
  {
    family: "FiraCode Nerd Font Mono",
    base: "FiraCodeNerdFontMono",
    styles: ["Regular", "Bold"],
    license: "LICENSE-FiraCode.txt",
  },
];
const file = (base: string, s: string) => `./assets/fonts/${base}-${s}.ttf`;
const STYLE_DEF: Record<string, [number, string]> = {
  Regular: [400, "normal"],
  Bold: [700, "normal"],
  Italic: [400, "italic"],
  BoldItalic: [700, "italic"],
};

// Family name stored in the font files (name table id 1).
function familyName(rel: string) {
  const d = fs.readFileSync(path.join(root, rel));
  const tables = d.readUInt16BE(4);
  for (let i = 0; i < tables; i++) {
    const rec = 12 + 16 * i;
    if (d.toString("ascii", rec, rec + 4) !== "name") continue;
    const off = d.readUInt32BE(rec + 8);
    const count = d.readUInt16BE(off + 2);
    const strings = off + d.readUInt16BE(off + 4);
    for (let j = 0; j < count; j++) {
      const r = off + 6 + 12 * j;
      if (d.readUInt16BE(r) !== 3 || d.readUInt16BE(r + 6) !== 1) continue;
      const len = d.readUInt16BE(r + 8);
      const start = strings + d.readUInt16BE(r + 10);
      return Buffer.from(d.subarray(start, start + len))
        .swap16()
        .toString("utf16le");
    }
  }
  return null;
}

test("every bundled style ships with its license", () => {
  for (const font of BUNDLED) {
    for (const s of font.styles)
      expect(fs.existsSync(path.join(root, file(font.base, s)))).toBe(true);
    expect(fs.existsSync(path.join(root, "assets/fonts", font.license))).toBe(
      true,
    );
  }
});

test("iOS embeds every style", () => {
  expect(fontPlugin.ios.fonts).toEqual(
    BUNDLED.flatMap((f) => f.styles.map((s) => file(f.base, s))),
  );
});

test("Android groups each font's styles under its family", () => {
  const families = fontPlugin.android.fonts.map((f: any) => f.fontFamily);
  expect(families).toEqual(BUNDLED.map((f) => f.family));
  for (const font of BUNDLED) {
    const entry = fontPlugin.android.fonts.find(
      (f: any) => f.fontFamily === font.family,
    );
    const defs = entry.fontDefinitions.map((d: any) => [
      d.path,
      d.weight,
      d.style ?? "normal",
    ]);
    expect(defs).toEqual(
      font.styles.map((s) => [file(font.base, s), ...STYLE_DEF[s]]),
    );
  }
});

test("family names match the font files, so iOS finds them too", () => {
  for (const font of BUNDLED)
    for (const s of font.styles)
      expect(familyName(file(font.base, s))).toBe(font.family);
});

test("the settings list exactly the bundled fonts plus the system one", () => {
  expect(TERMINAL_FONTS.map((f) => f.value)).toEqual([
    ...BUNDLED.map((f) => f.family),
    "monospace",
  ]);
  expect(BUNDLED[0].family).toBe(terminalFont());
});
