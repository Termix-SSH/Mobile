/**
 * Theme constants — ported from the Termix web app
 * (../Termix/Termix/src/ui/lib/theme.ts + index.css).
 *
 * Colors are space-separated RGB triplets ("R G B") so they can be fed to
 * NativeWind's vars() helper and resolved by Tailwind tokens that use
 * rgb(var(--token) / <alpha-value>).
 */

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
  "muted-foreground": "115 115 115",
  accent: "245 245 245",
  "accent-foreground": "24 25 23",
  destructive: "231 0 11",
  border: "229 229 229",
  input: "229 229 229",
  ring: "161 161 161",
  surface: "245 245 245",
  "surface-dim": "235 235 235",
  "chart-1": "212 212 212",
  "chart-2": "115 115 115",
  "chart-3": "82 82 82",
  "chart-4": "64 64 64",
  "chart-5": "38 38 38",
  sidebar: "250 250 250",
  "sidebar-foreground": "17 18 16",
  "sidebar-primary": "24 25 23",
  "sidebar-primary-foreground": "250 250 250",
  "sidebar-accent": "245 245 245",
  "sidebar-accent-foreground": "24 25 23",
  "sidebar-border": "229 229 229",
  "sidebar-ring": "161 161 161",
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
  muted: "35 35 35",
  "muted-foreground": "164 164 164",
  accent: "35 35 35",
  "accent-foreground": "250 250 250",
  destructive: "255 100 103",
  border: "50 50 50",
  input: "56 56 56",
  ring: "115 115 115",
  surface: "18 19 17",
  "surface-dim": "14 15 13",
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
  "sidebar-border": "50 50 50",
  "sidebar-ring": "115 115 115",
};

const DRACULA: ThemeVars = {
  background: "40 42 54",
  foreground: "248 248 242",
  card: "33 34 44",
  "card-foreground": "248 248 242",
  popover: "33 34 44",
  "popover-foreground": "248 248 242",
  primary: "248 248 242",
  "primary-foreground": "40 42 54",
  secondary: "68 71 90",
  "secondary-foreground": "248 248 242",
  muted: "68 71 90",
  "muted-foreground": "98 114 164",
  accent: "68 71 90",
  "accent-foreground": "248 248 242",
  destructive: "255 85 85",
  border: "98 114 164",
  input: "98 114 164",
  ring: "98 114 164",
  surface: "33 34 44",
  "surface-dim": "25 26 33",
  "chart-1": "255 121 198",
  "chart-2": "139 233 253",
  "chart-3": "80 250 123",
  "chart-4": "255 184 108",
  "chart-5": "189 147 249",
  sidebar: "33 34 44",
  "sidebar-foreground": "248 248 242",
  "sidebar-primary": "189 147 249",
  "sidebar-primary-foreground": "40 42 54",
  "sidebar-accent": "68 71 90",
  "sidebar-accent-foreground": "248 248 242",
  "sidebar-border": "98 114 164",
  "sidebar-ring": "98 114 164",
};

const CATPPUCCIN: ThemeVars = {
  background: "30 30 46",
  foreground: "205 214 244",
  card: "24 24 37",
  "card-foreground": "205 214 244",
  popover: "24 24 37",
  "popover-foreground": "205 214 244",
  primary: "205 214 244",
  "primary-foreground": "30 30 46",
  secondary: "49 50 68",
  "secondary-foreground": "205 214 244",
  muted: "49 50 68",
  "muted-foreground": "108 112 134",
  accent: "49 50 68",
  "accent-foreground": "205 214 244",
  destructive: "243 139 168",
  border: "108 112 134",
  input: "108 112 134",
  ring: "108 112 134",
  surface: "24 24 37",
  "surface-dim": "17 17 27",
  "chart-1": "243 139 168",
  "chart-2": "137 220 235",
  "chart-3": "166 227 161",
  "chart-4": "250 179 135",
  "chart-5": "203 166 247",
  sidebar: "24 24 37",
  "sidebar-foreground": "205 214 244",
  "sidebar-primary": "203 166 247",
  "sidebar-primary-foreground": "30 30 46",
  "sidebar-accent": "49 50 68",
  "sidebar-accent-foreground": "205 214 244",
  "sidebar-border": "108 112 134",
  "sidebar-ring": "108 112 134",
};

const NORD: ThemeVars = {
  background: "46 52 64",
  foreground: "236 239 244",
  card: "39 44 54",
  "card-foreground": "236 239 244",
  popover: "39 44 54",
  "popover-foreground": "236 239 244",
  primary: "236 239 244",
  "primary-foreground": "46 52 64",
  secondary: "59 66 82",
  "secondary-foreground": "236 239 244",
  muted: "59 66 82",
  "muted-foreground": "76 86 106",
  accent: "59 66 82",
  "accent-foreground": "236 239 244",
  destructive: "191 97 106",
  border: "76 86 106",
  input: "76 86 106",
  ring: "76 86 106",
  surface: "39 44 54",
  "surface-dim": "34 38 46",
  "chart-1": "191 97 106",
  "chart-2": "136 192 208",
  "chart-3": "163 190 140",
  "chart-4": "235 203 139",
  "chart-5": "180 142 173",
  sidebar: "39 44 54",
  "sidebar-foreground": "236 239 244",
  "sidebar-primary": "136 192 208",
  "sidebar-primary-foreground": "46 52 64",
  "sidebar-accent": "59 66 82",
  "sidebar-accent-foreground": "236 239 244",
  "sidebar-border": "76 86 106",
  "sidebar-ring": "76 86 106",
};

const SOLARIZED: ThemeVars = {
  background: "0 43 54",
  foreground: "131 148 150",
  card: "7 54 66",
  "card-foreground": "147 161 161",
  popover: "7 54 66",
  "popover-foreground": "147 161 161",
  primary: "147 161 161",
  "primary-foreground": "0 43 54",
  secondary: "7 54 66",
  "secondary-foreground": "131 148 150",
  muted: "7 54 66",
  "muted-foreground": "88 110 117",
  accent: "7 54 66",
  "accent-foreground": "147 161 161",
  destructive: "220 50 47",
  border: "88 110 117",
  input: "88 110 117",
  ring: "88 110 117",
  surface: "7 54 66",
  "surface-dim": "0 33 43",
  "chart-1": "220 50 47",
  "chart-2": "42 161 152",
  "chart-3": "133 153 0",
  "chart-4": "181 137 0",
  "chart-5": "108 113 196",
  sidebar: "7 54 66",
  "sidebar-foreground": "147 161 161",
  "sidebar-primary": "38 139 210",
  "sidebar-primary-foreground": "0 43 54",
  "sidebar-accent": "7 54 66",
  "sidebar-accent-foreground": "147 161 161",
  "sidebar-border": "88 110 117",
  "sidebar-ring": "88 110 117",
};

const TOKYO_NIGHT: ThemeVars = {
  background: "26 27 38",
  foreground: "169 177 214",
  card: "22 22 30",
  "card-foreground": "169 177 214",
  popover: "22 22 30",
  "popover-foreground": "169 177 214",
  primary: "169 177 214",
  "primary-foreground": "26 27 38",
  secondary: "36 40 59",
  "secondary-foreground": "169 177 214",
  muted: "36 40 59",
  "muted-foreground": "86 95 137",
  accent: "36 40 59",
  "accent-foreground": "169 177 214",
  destructive: "247 118 142",
  border: "86 95 137",
  input: "86 95 137",
  ring: "86 95 137",
  surface: "22 22 30",
  "surface-dim": "19 19 26",
  "chart-1": "247 118 142",
  "chart-2": "125 207 255",
  "chart-3": "158 206 106",
  "chart-4": "224 175 104",
  "chart-5": "187 154 247",
  sidebar: "22 22 30",
  "sidebar-foreground": "169 177 214",
  "sidebar-primary": "122 162 247",
  "sidebar-primary-foreground": "26 27 38",
  "sidebar-accent": "36 40 59",
  "sidebar-accent-foreground": "169 177 214",
  "sidebar-border": "86 95 137",
  "sidebar-ring": "86 95 137",
};

const ONE_DARK: ThemeVars = {
  background: "40 44 52",
  foreground: "171 178 191",
  card: "33 37 43",
  "card-foreground": "171 178 191",
  popover: "33 37 43",
  "popover-foreground": "171 178 191",
  primary: "171 178 191",
  "primary-foreground": "40 44 52",
  secondary: "44 49 58",
  "secondary-foreground": "171 178 191",
  muted: "44 49 58",
  "muted-foreground": "92 99 112",
  accent: "44 49 58",
  "accent-foreground": "171 178 191",
  destructive: "224 108 117",
  border: "92 99 112",
  input: "92 99 112",
  ring: "92 99 112",
  surface: "33 37 43",
  "surface-dim": "27 31 35",
  "chart-1": "224 108 117",
  "chart-2": "86 182 194",
  "chart-3": "152 195 121",
  "chart-4": "229 192 123",
  "chart-5": "198 120 221",
  sidebar: "33 37 43",
  "sidebar-foreground": "171 178 191",
  "sidebar-primary": "97 175 239",
  "sidebar-primary-foreground": "40 44 52",
  "sidebar-accent": "44 49 58",
  "sidebar-accent-foreground": "171 178 191",
  "sidebar-border": "92 99 112",
  "sidebar-ring": "92 99 112",
};

const GRUVBOX: ThemeVars = {
  background: "40 40 40",
  foreground: "235 219 178",
  card: "29 32 33",
  "card-foreground": "235 219 178",
  popover: "29 32 33",
  "popover-foreground": "235 219 178",
  primary: "235 219 178",
  "primary-foreground": "40 40 40",
  secondary: "60 56 54",
  "secondary-foreground": "235 219 178",
  muted: "60 56 54",
  "muted-foreground": "146 131 116",
  accent: "60 56 54",
  "accent-foreground": "235 219 178",
  destructive: "204 36 29",
  border: "146 131 116",
  input: "146 131 116",
  ring: "146 131 116",
  surface: "29 32 33",
  "surface-dim": "24 26 26",
  "chart-1": "204 36 29",
  "chart-2": "104 157 106",
  "chart-3": "152 151 26",
  "chart-4": "215 153 33",
  "chart-5": "177 98 134",
  sidebar: "29 32 33",
  "sidebar-foreground": "235 219 178",
  "sidebar-primary": "250 189 47",
  "sidebar-primary-foreground": "40 40 40",
  "sidebar-accent": "60 56 54",
  "sidebar-accent-foreground": "235 219 178",
  "sidebar-border": "146 131 116",
  "sidebar-ring": "146 131 116",
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

/** Theme picker entries (preview is a swatch hex). Mirrors web UserProfilePanel. */
export const THEMES: { id: ThemeId; preview: string }[] = [
  { id: "system", preview: "auto" },
  { id: "light", preview: "#ffffff" },
  { id: "dark", preview: "#0c0d0b" },
  { id: "dracula", preview: "#282a36" },
  { id: "catppuccin", preview: "#1e1e2e" },
  { id: "nord", preview: "#2e3440" },
  { id: "solarized", preview: "#002b36" },
  { id: "tokyo-night", preview: "#1a1b26" },
  { id: "one-dark", preview: "#282c34" },
  { id: "gruvbox", preview: "#282828" },
];

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

/** 12 accent presets — identical set + order to the web app. */
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
