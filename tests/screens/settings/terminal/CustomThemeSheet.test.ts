import { TERMINAL_THEMES } from "@/constants/terminal-themes";
import { checkColors } from "@/screens/settings/terminal/CustomThemeSheet";

test("a full set of hex colors is accepted", () => {
  const result = checkColors(TERMINAL_THEMES.nord.colors);
  expect(result.ok).toBe(true);
});

test("cursor and selection may be left empty", () => {
  const { cursor, cursorAccent, selectionBackground, ...rest } =
    TERMINAL_THEMES.termixDark.colors;
  void cursor;
  void cursorAccent;
  void selectionBackground;
  expect(checkColors({ ...rest, cursor: "" }).ok).toBe(true);
});

test("names the first color that is not hex", () => {
  expect(checkColors({ ...TERMINAL_THEMES.nord.colors, red: "red" })).toEqual({
    ok: false,
    label: "Red",
  });
  expect(
    checkColors({ ...TERMINAL_THEMES.nord.colors, background: "#12345" }),
  ).toEqual({ ok: false, label: "Background" });
});
