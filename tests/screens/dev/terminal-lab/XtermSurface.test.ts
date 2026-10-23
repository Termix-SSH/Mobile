import { surfaceTheme } from "@/screens/dev/terminal-lab/surface";
import { xtermHtml, xtermTheme } from "@/screens/dev/terminal-lab/XtermSurface";

const assets = {
  xtermJs: "/*xterm*/",
  xtermCss: ".xterm{}",
  fitAddonJs: "/*fit*/",
  nerdFontBase64: "AAAA",
};

test("theme has xterm's ANSI names", () => {
  const t = xtermTheme(surfaceTheme());
  expect(t.background).toBe("#0c0d0b");
  expect(t.black).toBe("#2e3436");
  expect(t.brightWhite).toBeDefined();
  expect(Object.keys(t)).toHaveLength(20);
});

test("page embeds assets, font and settings", () => {
  const html = xtermHtml(assets, surfaceTheme(), 15);
  expect(html).toContain("/*xterm*/");
  expect(html).toContain("/*fit*/");
  expect(html).toContain('src:url("data:font/ttf;base64,AAAA")');
  expect(html).toContain("fontSize: 15");
  expect(html).toContain("window.lab = {");
});

test("page works without the nerd font", () => {
  const html = xtermHtml(
    { ...assets, nerdFontBase64: undefined },
    surfaceTheme(),
    14,
  );
  expect(html).not.toContain("@font-face");
});
