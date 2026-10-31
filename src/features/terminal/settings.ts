import {
  TERMINAL_THEMES,
  type TerminalThemeColors,
} from "@/constants/terminal-themes";
import type { TerminalConfig } from "@/types";
import type {
  TerminalBell,
  TerminalCursor,
  TerminalTheme,
} from "@/modules/termix-terminal";

/** Fonts bundled with the app, by the family name the native view loads. */
export const TERMINAL_FONTS = [
  { value: "CaskaydiaCove NFM", label: "Caskaydia Cove" },
  { value: "JetBrainsMono NFM", label: "JetBrains Mono" },
  { value: "FiraCode Nerd Font Mono", label: "Fira Code" },
  { value: "monospace", label: "System" },
] as const;

export const DEFAULT_TERMINAL_FONT = TERMINAL_FONTS[0].value;

// Names saved before 2.0 and the names the desktop and web use.
const FONT_ALIASES: Record<string, string> = {
  "Caskaydia Cove Nerd Font Mono": "CaskaydiaCove NFM",
  "Cascadia Code": "CaskaydiaCove NFM",
  "JetBrains Mono": "JetBrainsMono NFM",
  "Fira Code": "FiraCode Nerd Font Mono",
  "SF Mono": "monospace",
  Consolas: "monospace",
  Monaco: "monospace",
  "Source Code Pro": "monospace",
};

export function terminalFont(value?: string | null): string {
  if (!value) return DEFAULT_TERMINAL_FONT;
  if (TERMINAL_FONTS.some((f) => f.value === value)) return value;
  return FONT_ALIASES[value] ?? DEFAULT_TERMINAL_FONT;
}

export const CURSOR_STYLES = [
  { value: "block", label: "Block" },
  { value: "bar", label: "Bar" },
  { value: "underline", label: "Underline" },
] as const;

export const BELL_STYLES = [
  { value: "none", label: "Off" },
  { value: "sound", label: "Sound" },
  { value: "visual", label: "Flash" },
  { value: "both", label: "Both" },
] as const;

/** The app theme families, as Termix's "Termix Default" terminal theme follows them. */
const TERMIX_DEFAULT_COLORS: Record<
  string,
  { background: string; foreground: string }
> = {
  dark: { background: "#0c0d0b", foreground: "#fafafa" },
  light: { background: "#ffffff", foreground: "#111210" },
  dracula: { background: "#282a36", foreground: "#f8f8f2" },
  catppuccin: { background: "#1e1e2e", foreground: "#cdd6f4" },
  nord: { background: "#2e3440", foreground: "#eceff4" },
  solarized: { background: "#002b36", foreground: "#839496" },
  "tokyo-night": { background: "#1a1b26", foreground: "#a9b1d6" },
  "one-dark": { background: "#282c34", foreground: "#abb2bf" },
  gruvbox: { background: "#282828", foreground: "#ebdbb2" },
};

/** Same rules as Plugin-SSH-Terminal's resolveTermixThemeColors. */
export function resolveTerminalColors(
  theme: string | undefined,
  appTheme: string,
  custom?: TerminalThemeColors | null,
): TerminalThemeColors {
  const fallback = TERMINAL_THEMES.termixDark.colors;
  if (theme === "custom") return custom ?? fallback;
  if (theme && theme !== "termix") {
    return TERMINAL_THEMES[theme]?.colors ?? fallback;
  }
  const ui = TERMIX_DEFAULT_COLORS[appTheme] ?? TERMIX_DEFAULT_COLORS.dark;
  const base =
    appTheme === "light"
      ? TERMINAL_THEMES.termixLight.colors
      : TERMINAL_THEMES.termixDark.colors;
  return {
    ...base,
    background: ui.background,
    foreground: ui.foreground,
    cursor: ui.foreground,
    cursorAccent: ui.background,
  };
}

export function paletteOf(c: TerminalThemeColors): string[] {
  return [
    c.black,
    c.red,
    c.green,
    c.yellow,
    c.blue,
    c.magenta,
    c.cyan,
    c.white,
    c.brightBlack,
    c.brightRed,
    c.brightGreen,
    c.brightYellow,
    c.brightBlue,
    c.brightMagenta,
    c.brightCyan,
    c.brightWhite,
  ];
}

export function nativeTheme(c: TerminalThemeColors): TerminalTheme {
  return {
    background: c.background,
    foreground: c.foreground,
    cursor: c.cursor ?? c.foreground,
    cursorAccent: c.cursorAccent ?? c.background,
    selectionBackground: c.selectionBackground ?? "#3a3a3d",
    selectionForeground: c.selectionForeground,
    palette: paletteOf(c),
  };
}

export const MIN_FONT_SIZE = 8;
export const MAX_FONT_SIZE = 32;
// Large text in the system settings grows the terminal too, up to this much.
const MAX_FONT_SCALE = 1.6;

export interface TerminalSettings {
  colors: TerminalThemeColors;
  theme: TerminalTheme;
  fontFamily: string;
  /** Base size before large text. */
  fontSize: number;
  /** What the view draws at, with large text. */
  scaledFontSize: number;
  lineHeight: number;
  letterSpacing: number;
  cursor: TerminalCursor;
  scrollback: number;
  bell: TerminalBell;
  optionAsMeta: boolean;
  linkPolicy: "confirm" | "direct";
}

/** One terminal's look: app defaults, then the user's settings, then the host's. */
export function resolveTerminalSettings(
  user: Partial<TerminalConfig>,
  host: Partial<TerminalConfig> | undefined,
  appTheme: string,
  fontScale = 1,
): TerminalSettings {
  const merged: Partial<TerminalConfig> = { ...user, ...(host ?? {}) };
  const colors = resolveTerminalColors(
    merged.theme,
    appTheme,
    merged.customThemeColors,
  );
  // Size is the phone's own choice; a host's desktop size rarely fits a phone.
  const fontSize = clamp(user.fontSize ?? 14, MIN_FONT_SIZE, MAX_FONT_SIZE);
  const scale = clamp(fontScale || 1, 1, MAX_FONT_SCALE);
  return {
    colors,
    theme: nativeTheme(colors),
    // A host may pick its own font; the size stays the phone's.
    fontFamily: terminalFont(host?.fontFamily ?? user.fontFamily),
    fontSize,
    scaledFontSize: Math.round(fontSize * scale * 2) / 2,
    lineHeight: clamp(merged.lineHeight ?? 1, 0.8, 2),
    letterSpacing: clamp(merged.letterSpacing ?? 0, 0, 8),
    cursor: {
      style: merged.cursorStyle ?? "block",
      blink: merged.cursorBlink ?? true,
    },
    scrollback: clamp(merged.scrollback ?? 10000, 100, 100000),
    bell: {
      style: merged.bellStyle ?? "none",
      haptics: user.haptics ?? true,
    },
    optionAsMeta: user.optionAsMeta ?? false,
    linkPolicy: merged.linkClickBehavior === "direct" ? "direct" : "confirm",
  };
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}
