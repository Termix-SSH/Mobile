import { blend, contrastRatio, readableOn } from "@/constants/contrast";
import {
  DEFAULT_ACCENT,
  hexToRgbTriplet,
  THEME_VARS,
  textTokens,
  uiColorsFor,
} from "@/constants/theme";

const AA = 4.5;
const themes = Object.entries(THEME_VARS);

test("the math matches known WCAG values", () => {
  expect(contrastRatio("0 0 0", "255 255 255")).toBeCloseTo(21, 1);
  expect(contrastRatio("255 255 255", "255 255 255")).toBe(1);
  expect(blend("0 0 0", "255 255 255", 0.5)).toBe("128 128 128");
});

test.each(themes)("%s: body and muted text read on every surface", (_, v) => {
  for (const surface of ["background", "card", "popover"]) {
    expect(contrastRatio(v.foreground, v[surface])).toBeGreaterThanOrEqual(AA);
    expect(
      contrastRatio(v["muted-foreground"], v[surface]),
    ).toBeGreaterThanOrEqual(AA);
  }
});

// Accents people pick, plus the default, which is too light for the light theme.
const ACCENTS = [DEFAULT_ACCENT, "#facc15", "#3b82f6", "#22c55e", "#a855f7"];

test.each(themes)("%s: accent, warning and destructive text read", (id, v) => {
  for (const accent of ACCENTS) {
    const t = textTokens(v, hexToRgbTriplet(accent)!);
    for (const value of Object.values(t)) {
      expect(contrastRatio(value, v.background)).toBeGreaterThanOrEqual(AA);
    }
  }
  const faint = hexToRgbTriplet(
    uiColorsFor(id as never, DEFAULT_ACCENT).textFaint,
  )!;
  expect(contrastRatio(faint, v.background)).toBeGreaterThanOrEqual(AA);
});

test("a color that already reads is kept as is", () => {
  expect(readableOn("0 0 0", "255 255 255")).toBe("0 0 0");
  const fixed = readableOn("255 255 0", "255 255 255");
  expect(fixed).not.toBe("255 255 0");
  expect(contrastRatio(fixed, "255 255 255")).toBeGreaterThanOrEqual(AA);
});
