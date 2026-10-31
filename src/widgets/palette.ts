import {
  THEME_IS_DARK,
  THEME_VARS,
  resolveTheme,
  tripletToHex,
  type ThemeId,
} from "@/constants/theme";
import type { WidgetPalette } from "./types";

/** The colors a widget draws with, taken from the app theme. */
export function widgetPalette(
  theme: ThemeId,
  systemScheme: string | null | undefined = "dark",
): WidgetPalette {
  const id = resolveTheme(theme, systemScheme);
  const v = THEME_VARS[id];
  const hex = (token: string) => tripletToHex(v[token]);
  return {
    id,
    isDark: THEME_IS_DARK[id],
    background: hex("background"),
    surface: hex("sidebar"),
    card: hex("card"),
    raised: hex("muted"),
    border: hex("border"),
    text: hex("foreground"),
    textSecondary: hex("muted-foreground"),
    textTertiary: hex("muted-foreground") + "b3",
  };
}
