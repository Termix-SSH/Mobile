/**
 * Theme tokens copied from the Classic Themes plugin (themes/*.css).
 *
 * Colors are "R G B" triplets for NativeWind's vars() and Tailwind's
 * rgb(var(--token) / <alpha-value>). Tokens that use alpha on the web
 * (border, input, sidebar-border) are mixed onto the theme background.
 */

import { blend, readableOn } from "./contrast";

export type ThemeId =
  | "system"
  | "light"
  | "dark"
  | "dracula"
  | "catppuccin"
  | "nord"
  | "solarized"
  | "tokyo-night"
  | "one-dark"
  | "gruvbox";

/** Full variable set keyed by token name (without the leading --). */
export type ThemeVars = Record<string, string>;

const LIGHT: ThemeVars = {
  background: "255 255 255",
  foreground: "17 18 16",
  card: "255 255 255",
  "card-foreground": "17 18 16",
  popover: "255 255 255",
  "popover-foreground": "17 18 16",
  primary: "24 25 23",
  "primary-foreground": "250 250 250",
  secondary: "245 245 245",
  "secondary-foreground": "24 25 23",
  muted: "245 245 245",
  "muted-foreground": "82 82 82",
  accent: "245 245 245",
  "accent-foreground": "24 25 23",
  destructive: "231 0 11",
  border: "229 229 229",
  input: "229 229 229",
  ring: "161 161 161",
  "chart-1": "212 212 212",
  "chart-2": "115 115 115",
  "chart-3": "82 82 82",
  "chart-4": "64 64 64",
  "chart-5": "38 38 38",
  surface: "245 245 245",
  sidebar: "250 250 250",
  "sidebar-foreground": "17 18 16",
  "sidebar-primary": "24 25 23",
  "sidebar-primary-foreground": "250 250 250",
  "sidebar-accent": "245 245 245",
  "sidebar-accent-foreground": "24 25 23",
  "sidebar-border": "229 229 229",
  "sidebar-ring": "161 161 161",
  warning: "234 179 5",
  success: "22 163 74",
  "terminal-bg": "255 255 255",
  "surface-dim": "237 237 237",
};

const DARK: ThemeVars = {
  background: "12 13 11",
  foreground: "250 250 250",
  card: "24 25 23",
  "card-foreground": "250 250 250",
  popover: "24 25 23",
  "popover-foreground": "250 250 250",
  primary: "229 229 229",
  "primary-foreground": "24 25 23",
  secondary: "38 38 38",
  "secondary-foreground": "250 250 250",
  surface: "18 19 17",
  "surface-dim": "14 15 13",
  muted: "35 35 35",
  "muted-foreground": "164 164 164",
  accent: "35 35 35",
  "accent-foreground": "250 250 250",
  destructive: "255 100 103",
  border: "41 42 40",
  input: "48 49 48",
  ring: "115 115 115",
  "chart-1": "212 212 212",
  "chart-2": "115 115 115",
  "chart-3": "82 82 82",
  "chart-4": "64 64 64",
  "chart-5": "38 38 38",
  sidebar: "20 21 19",
  "sidebar-foreground": "250 250 250",
  "sidebar-primary": "20 71 230",
  "sidebar-primary-foreground": "250 250 250",
  "sidebar-accent": "35 35 35",
  "sidebar-accent-foreground": "250 250 250",
  "sidebar-border": "41 42 40",
  "sidebar-ring": "115 115 115",
  warning: "243 202 62",
  success: "34 197 94",
  "terminal-bg": "12 13 11",
};

const DRACULA: ThemeVars = {
  background: "40 42 54",
  foreground: "248 248 242",
  card: "45 48 61",
  "card-foreground": "248 248 242",
  popover: "45 48 61",
  "popover-foreground": "248 248 242",
  primary: "139 233 253",
  "primary-foreground": "40 42 54",
  secondary: "80 83 107",
  "secondary-foreground": "248 248 242",
  surface: "45 48 61",
  "surface-dim": "33 34 44",
  muted: "80 83 107",
  "muted-foreground": "168 179 217",
  accent: "90 94 122",
  "accent-foreground": "248 248 242",
  destructive: "255 85 85",
  border: "63 67 83",
  input: "58 61 77",
  ring: "139 233 253",
  "chart-1": "255 121 198",
  "chart-2": "139 233 253",
  "chart-3": "80 250 123",
  "chart-4": "255 184 108",
  "chart-5": "189 147 249",
  sidebar: "33 34 44",
  "sidebar-foreground": "248 248 242",
  "sidebar-primary": "139 233 253",
  "sidebar-primary-foreground": "40 42 54",
  "sidebar-accent": "90 94 122",
  "sidebar-accent-foreground": "248 248 242",
  "sidebar-border": "63 67 83",
  "sidebar-ring": "139 233 253",
  warning: "241 250 140",
  success: "80 250 123",
  "terminal-bg": "40 42 54",
};

const CATPPUCCIN: ThemeVars = {
  background: "30 30 46",
  foreground: "205 214 244",
  card: "32 34 53",
  "card-foreground": "205 214 244",
  popover: "32 34 53",
  "popover-foreground": "205 214 244",
  primary: "137 180 250",
  "primary-foreground": "30 30 46",
  secondary: "59 61 82",
  "secondary-foreground": "205 214 244",
  surface: "32 34 53",
  "surface-dim": "24 24 37",
  muted: "59 61 82",
  "muted-foreground": "184 192 224",
  accent: "69 71 90",
  "accent-foreground": "205 214 244",
  destructive: "243 139 168",
  border: "58 60 78",
  input: "52 53 71",
  ring: "137 180 250",
  "chart-1": "243 139 168",
  "chart-2": "137 220 235",
  "chart-3": "166 227 161",
  "chart-4": "250 179 135",
  "chart-5": "203 166 247",
  sidebar: "24 24 37",
  "sidebar-foreground": "205 214 244",
  "sidebar-primary": "137 180 250",
  "sidebar-primary-foreground": "30 30 46",
  "sidebar-accent": "69 71 90",
  "sidebar-accent-foreground": "205 214 244",
  "sidebar-border": "58 60 78",
  "sidebar-ring": "137 180 250",
  warning: "249 226 175",
  success: "166 227 161",
  "terminal-bg": "30 30 46",
};

const NORD: ThemeVars = {
  background: "46 52 64",
  foreground: "236 239 244",
  card: "53 60 74",
  "card-foreground": "236 239 244",
  popover: "53 60 74",
  "popover-foreground": "236 239 244",
  primary: "136 192 208",
  "primary-foreground": "46 52 64",
  secondary: "67 76 94",
  "secondary-foreground": "236 239 244",
  surface: "53 60 74",
  "surface-dim": "42 48 59",
  muted: "67 76 94",
  "muted-foreground": "180 192 212",
  accent: "76 86 106",
  "accent-foreground": "236 239 244",
  destructive: "191 97 106",
  border: "70 77 91",
  input: "65 72 85",
  ring: "136 192 208",
  "chart-1": "191 97 106",
  "chart-2": "136 192 208",
  "chart-3": "163 190 140",
  "chart-4": "235 203 139",
  "chart-5": "180 142 173",
  sidebar: "42 48 59",
  "sidebar-foreground": "236 239 244",
  "sidebar-primary": "136 192 208",
  "sidebar-primary-foreground": "46 52 64",
  "sidebar-accent": "76 86 106",
  "sidebar-accent-foreground": "236 239 244",
  "sidebar-border": "70 77 91",
  "sidebar-ring": "136 192 208",
  warning: "235 203 139",
  success: "163 190 140",
  "terminal-bg": "46 52 64",
};

const SOLARIZED: ThemeVars = {
  background: "0 43 54",
  foreground: "183 196 196",
  card: "7 54 66",
  "card-foreground": "183 196 196",
  popover: "7 54 66",
  "popover-foreground": "183 196 196",
  primary: "38 139 210",
  "primary-foreground": "0 43 54",
  secondary: "11 70 84",
  "secondary-foreground": "183 196 196",
  surface: "7 54 66",
  "surface-dim": "0 33 43",
  muted: "11 70 84",
  "muted-foreground": "159 179 179",
  accent: "16 86 103",
  "accent-foreground": "213 221 221",
  destructive: "220 50 47",
  border: "32 70 79",
  input: "25 65 74",
  ring: "38 139 210",
  "chart-1": "220 50 47",
  "chart-2": "42 161 152",
  "chart-3": "133 153 0",
  "chart-4": "181 137 0",
  "chart-5": "108 113 196",
  sidebar: "7 54 66",
  "sidebar-foreground": "183 196 196",
  "sidebar-primary": "38 139 210",
  "sidebar-primary-foreground": "0 43 54",
  "sidebar-accent": "16 86 103",
  "sidebar-accent-foreground": "213 221 221",
  "sidebar-border": "32 70 79",
  "sidebar-ring": "38 139 210",
  warning: "181 137 0",
  success: "133 153 0",
  "terminal-bg": "0 43 54",
};

const TOKYO_NIGHT: ThemeVars = {
  background: "26 27 38",
  foreground: "192 202 245",
  card: "31 35 53",
  "card-foreground": "192 202 245",
  popover: "31 35 53",
  "popover-foreground": "192 202 245",
  primary: "122 162 247",
  "primary-foreground": "26 27 38",
  secondary: "42 47 71",
  "secondary-foreground": "192 202 245",
  surface: "31 35 53",
  "surface-dim": "22 22 30",
  muted: "42 47 71",
  "muted-foreground": "139 147 189",
  accent: "47 54 84",
  "accent-foreground": "192 202 245",
  destructive: "247 118 142",
  border: "49 51 68",
  input: "44 46 62",
  ring: "122 162 247",
  "chart-1": "247 118 142",
  "chart-2": "125 207 255",
  "chart-3": "158 206 106",
  "chart-4": "224 175 104",
  "chart-5": "187 154 247",
  sidebar: "22 22 30",
  "sidebar-foreground": "192 202 245",
  "sidebar-primary": "122 162 247",
  "sidebar-primary-foreground": "26 27 38",
  "sidebar-accent": "47 54 84",
  "sidebar-accent-foreground": "192 202 245",
  "sidebar-border": "49 51 68",
  "sidebar-ring": "122 162 247",
  warning: "224 175 104",
  success: "158 206 106",
  "terminal-bg": "26 27 38",
};

const ONE_DARK: ThemeVars = {
  background: "40 44 52",
  foreground: "171 178 191",
  card: "47 52 61",
  "card-foreground": "171 178 191",
  popover: "47 52 61",
  "popover-foreground": "171 178 191",
  primary: "97 175 239",
  "primary-foreground": "40 44 52",
  secondary: "58 64 75",
  "secondary-foreground": "171 178 191",
  surface: "47 52 61",
  "surface-dim": "33 37 43",
  muted: "58 64 75",
  "muted-foreground": "154 163 178",
  accent: "66 73 87",
  "accent-foreground": "171 178 191",
  destructive: "224 108 117",
  border: "61 65 75",
  input: "56 61 70",
  ring: "97 175 239",
  "chart-1": "224 108 117",
  "chart-2": "86 182 194",
  "chart-3": "152 195 121",
  "chart-4": "229 192 123",
  "chart-5": "198 120 221",
  sidebar: "33 37 43",
  "sidebar-foreground": "171 178 191",
  "sidebar-primary": "97 175 239",
  "sidebar-primary-foreground": "40 44 52",
  "sidebar-accent": "66 73 87",
  "sidebar-accent-foreground": "171 178 191",
  "sidebar-border": "61 65 75",
  "sidebar-ring": "97 175 239",
  warning: "229 192 123",
  success: "152 195 121",
  "terminal-bg": "40 44 52",
};

const GRUVBOX: ThemeVars = {
  background: "40 40 40",
  foreground: "235 219 178",
  card: "50 48 47",
  "card-foreground": "235 219 178",
  popover: "50 48 47",
  "popover-foreground": "235 219 178",
  primary: "250 189 47",
  "primary-foreground": "40 40 40",
  secondary: "69 64 61",
  "secondary-foreground": "235 219 178",
  surface: "50 48 47",
  "surface-dim": "29 32 33",
  muted: "69 64 61",
  "muted-foreground": "196 181 157",
  accent: "80 73 69",
  "accent-foreground": "235 219 178",
  destructive: "251 73 52",
  border: "68 65 61",
  input: "62 60 56",
  ring: "250 189 47",
  "chart-1": "251 73 52",
  "chart-2": "142 192 124",
  "chart-3": "184 187 38",
  "chart-4": "250 189 47",
  "chart-5": "211 134 155",
  sidebar: "29 32 33",
  "sidebar-foreground": "235 219 178",
  "sidebar-primary": "250 189 47",
  "sidebar-primary-foreground": "40 40 40",
  "sidebar-accent": "80 73 69",
  "sidebar-accent-foreground": "235 219 178",
  "sidebar-border": "68 65 61",
  "sidebar-ring": "250 189 47",
  warning: "250 189 47",
  success: "184 187 38",
  "terminal-bg": "40 40 40",
};

/** Resolved variable map per concrete theme (excludes "system"). */
export const THEME_VARS: Record<Exclude<ThemeId, "system">, ThemeVars> = {
  light: LIGHT,
  dark: DARK,
  dracula: DRACULA,
  catppuccin: CATPPUCCIN,
  nord: NORD,
  solarized: SOLARIZED,
  "tokyo-night": TOKYO_NIGHT,
  "one-dark": ONE_DARK,
  gruvbox: GRUVBOX,
};

/** Whether a concrete theme is dark (drives status bar + xterm defaults). */
export const THEME_IS_DARK: Record<Exclude<ThemeId, "system">, boolean> = {
  light: false,
  dark: true,
  dracula: true,
  catppuccin: true,
  nord: true,
  solarized: true,
  "tokyo-night": true,
  "one-dark": true,
  gruvbox: true,
};

export const DEFAULT_THEME: Exclude<ThemeId, "system"> = "dark";

export interface ThemeSwatch {
  background: string;
  panel: string;
  text: string;
}

/** Picker swatches, same as the Classic Themes manifest. */
export const THEME_SWATCHES: Record<Exclude<ThemeId, "system">, ThemeSwatch> = {
  dark: { background: "#1a1c22", panel: "#25272e", text: "#e5e7eb" },
  light: { background: "#ffffff", panel: "#eef0f3", text: "#1f2937" },
  dracula: { background: "#282a36", panel: "#44475a", text: "#f8f8f2" },
  catppuccin: { background: "#1e1e2e", panel: "#313244", text: "#cdd6f4" },
  nord: { background: "#2e3440", panel: "#3b4252", text: "#eceff4" },
  solarized: { background: "#002b36", panel: "#073642", text: "#93a1a1" },
  "tokyo-night": {
    background: "#1a1b26",
    panel: "#24283b",
    text: "#c0caf5",
  },
  "one-dark": { background: "#282c34", panel: "#21252b", text: "#abb2bf" },
  gruvbox: { background: "#282828", panel: "#3c3836", text: "#ebdbb2" },
};

/** Picker order. "system" follows the OS light or dark setting. */
export const THEMES: ThemeId[] = [
  "system",
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

export function resolveTheme(
  theme: ThemeId,
  systemScheme: string | null | undefined,
): Exclude<ThemeId, "system"> {
  if (theme === "system") return systemScheme === "light" ? "light" : "dark";
  return THEME_VARS[theme] ? theme : DEFAULT_THEME;
}

/** "245 145 69" -> "#f59145". */
export function tripletToHex(triplet: string): string {
  return (
    "#" +
    triplet
      .split(" ")
      .map((n) => Number(n).toString(16).padStart(2, "0"))
      .join("")
  );
}

export const THEME_LABELS: Record<ThemeId, string> = {
  system: "System",
  light: "Light",
  dark: "Dark",
  dracula: "Dracula",
  catppuccin: "Catppuccin",
  nord: "Nord",
  solarized: "Solarized",
  "tokyo-night": "Tokyo Night",
  "one-dark": "One Dark",
  gruvbox: "Gruvbox",
};

/** 12 accent presets - identical set + order to the web app. */
export const ACCENT_PRESET_COLORS = [
  { label: "Orange", value: "#f59145" },
  { label: "Blue", value: "#3b82f6" },
  { label: "Green", value: "#22c55e" },
  { label: "Purple", value: "#a855f7" },
  { label: "Pink", value: "#ec4899" },
  { label: "Cyan", value: "#06b6d4" },
  { label: "Red", value: "#ef4444" },
  { label: "Yellow", value: "#eab308" },
  { label: "Teal", value: "#14b8a6" },
  { label: "Indigo", value: "#6366f1" },
  { label: "Rose", value: "#f43f5e" },
  { label: "Lime", value: "#84cc16" },
];

export const DEFAULT_ACCENT = "#f59145";

export const FOLDER_COLORS = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#3b82f6",
  "#a855f7",
  "#ec4899",
  "#6b7280",
];

/** "#f59145" -> "245 145 69" (RGB triplet for vars()). Returns null if invalid. */
export function hexToRgbTriplet(hex: string): string | null {
  let h = hex.trim().replace("#", "");
  if (h.length === 3)
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `${r} ${g} ${b}`;
}

/** AsyncStorage keys (mirror the web localStorage keys conceptually). */
export const STORAGE_KEYS = {
  theme: "termix-theme",
  accent: "termix-accent",
} as const;

/**
 * Text versions of the accent, warning, destructive and success colors, darkened or
 * lightened until they read at 4.5:1 on the theme background. The theme
 * tokens stay as Classic Themes has them; only text uses these.
 */
export function textTokens(
  themeVars: ThemeVars,
  accentTriplet: string,
): Record<
  "accent-text" | "warning-text" | "destructive-text" | "success-text",
  string
> {
  const bg = themeVars.background;
  return {
    "accent-text": readableOn(accentTriplet, bg),
    "warning-text": readableOn(themeVars.warning, bg),
    "destructive-text": readableOn(themeVars.destructive, bg),
    "success-text": readableOn(themeVars.success, bg),
  };
}

export interface UiColors {
  background: string;
  surface: string;
  card: string;
  muted: string;
  active: string;
  border: string;
  text: string;
  textMuted: string;
  textFaint: string;
  brand: string;
  success: string;
  warning: string;
  destructive: string;
  terminal: string;
}

export function uiColorsFor(
  theme: Exclude<ThemeId, "system">,
  accent: string,
): UiColors {
  const v = THEME_VARS[theme];
  const hex = (token: string) => tripletToHex(v[token]);
  return {
    background: hex("background"),
    surface: hex("sidebar"),
    card: hex("card"),
    muted: hex("muted"),
    active: hex("accent"),
    border: hex("border"),
    text: hex("foreground"),
    textMuted: hex("muted-foreground"),
    // Faded, but never under 4.5:1.
    textFaint: tripletToHex(
      readableOn(blend(v["muted-foreground"], v.background, 0.7), v.background),
    ),
    brand: tripletToHex(
      hexToRgbTriplet(accent) ?? hexToRgbTriplet(DEFAULT_ACCENT)!,
    ),
    success: hex("success"),
    warning: hex("warning"),
    destructive: hex("destructive"),
    terminal: hex("terminal-bg"),
  };
}
