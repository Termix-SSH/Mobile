import { loadFont } from "@remotion/google-fonts/JetBrainsMono";
import {
  DEFAULT_ACCENT,
  THEME_IS_DARK,
  THEME_VARS,
  tripletToHex,
} from "../../src/constants/theme";

export const { fontFamily } = loadFont("normal", {
  weights: ["400", "500", "700", "800"],
  subsets: ["latin"],
});

export interface Palette {
  background: string;
  foreground: string;
  muted: string;
  border: string;
  accent: string;
  dark: boolean;
}

type ThemeName = keyof typeof THEME_VARS;

/** Colors from the app's own theme tokens, so slides match the screenshots. */
export function palette(theme: string, accent = DEFAULT_ACCENT): Palette {
  const id = (theme in THEME_VARS ? theme : "dark") as ThemeName;
  const vars = THEME_VARS[id];
  return {
    background: tripletToHex(vars.background),
    foreground: tripletToHex(vars.foreground),
    muted: tripletToHex(vars["muted-foreground"]),
    border: tripletToHex(vars.border),
    accent: accent.startsWith("#") ? accent : `#${accent}`,
    dark: THEME_IS_DARK[id],
  };
}
