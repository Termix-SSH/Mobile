/**
 * Static design tokens for the dark session surfaces (terminal, stats, file
 * manager, tunnels, tab bar). These mirror the redesigned web app's dark
 * theme. They are intentionally static (not theme-context driven) because the
 * terminal/console area stays dark in every app theme — matching the web,
 * where the terminal canvas is always dark. For themable chrome elsewhere in
 * the app, use Tailwind tokens + useTheme() instead.
 */

export const BORDERS = {
  MAJOR: 1,
  STANDARD: 1,
  SEPARATOR: 1,
} as const;

// Brand accent (orange) — replaces the old terminal green.
export const ACCENT = "#f59145";

export const BORDER_COLORS = {
  PRIMARY: "#323232",
  SECONDARY: "#383838",
  SEPARATOR: "#2a2a2a",
  BUTTON: "#323232",
  PANEL: "#262626",
  ACTIVE: ACCENT,
} as const;

export const BACKGROUNDS = {
  DARKEST: "#0c0d0b",
  DARKER: "#141513",
  HEADER: "#141513",
  DARK: "#0c0d0b",
  CARD: "#181917",
  PANEL: "#181917",
  BUTTON: "#232323",
  BUTTON_ALT: "#232323",
  ACTIVE: "#2a2a2a",
  HOVER: "#232323",
} as const;

export const RADIUS = {
  // Square corners everywhere — matches the web redesign.
  BUTTON: 0,
  CARD: 0,
  SMALL: 0,
  LARGE: 0,
} as const;

export const SPACING = {
  TOOLBAR_PADDING_PORTRAIT: 12,
  TOOLBAR_PADDING_LANDSCAPE: 8,
  BUTTON_PADDING_PORTRAIT: 8,
  BUTTON_PADDING_LANDSCAPE: 6,
  CARD_GAP: 12,
  BUTTON_GAP: 8,
} as const;

export const TEXT_COLORS = {
  PRIMARY: "#fafafa",
  SECONDARY: "#a4a4a4",
  TERTIARY: "#737373",
  DISABLED: "#525252",
  ACCENT,
} as const;

export const ICON_SIZES = {
  SMALL: 16,
  MEDIUM: 18,
  LARGE: 20,
} as const;
