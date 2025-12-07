/**
 * Includes a default value for all margins, borders, design elements, etc.
 * These can be used across all components as a default inside the style tag in a component
 * Any styling not included as a default here, can be set inside a className using NativeWind
 */

export const BORDERS = {
  MAJOR: 2,
  STANDARD: 1,
  SEPARATOR: 1,
} as const;

export const BORDER_COLORS = {
  PRIMARY: "#303032",
  SECONDARY: "#373739",
  SEPARATOR: "#404040",
  BUTTON: "#303032",
  ACTIVE: "#22C55E",
} as const;

export const BACKGROUNDS = {
  DARKEST: "#09090b",
  DARKER: "#0e0e10",
  HEADER: "#131316",
  DARK: "#18181b",
  CARD: "#1a1a1a",
  BUTTON: "#2a2a2a",
  BUTTON_ALT: "#23232a",
  ACTIVE: "#4a4a4a",
  HOVER: "#2d2d30",
} as const;

export const RADIUS = {
  BUTTON: 6,
  CARD: 12,
  SMALL: 4,
  LARGE: 16,
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
  PRIMARY: "#ffffff",
  SECONDARY: "#9CA3AF",
  TERTIARY: "#6B7280",
  DISABLED: "#4B5563",
  ACCENT: "#22C55E",
} as const;

export const ICON_SIZES = {
  SMALL: 16,
  MEDIUM: 18,
  LARGE: 20,
} as const;
