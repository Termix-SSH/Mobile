/**
 * Centralized design tokens for Termix Mobile Sessions UI
 * Ensures visual consistency across all components
 */

// Border widths
export const BORDERS = {
  MAJOR: 2,        // TabBar, BottomToolbar, FileManagerHeader, FileManagerToolbar
  STANDARD: 1,     // Buttons, cards, internal elements
  SEPARATOR: 1,    // KeyboardBar separator, breadcrumb divider
} as const;

// Border colors
export const BORDER_COLORS = {
  PRIMARY: '#303032',     // Main borders (major boundaries)
  SECONDARY: '#373739',   // Secondary borders (internal dividers)
  SEPARATOR: '#404040',   // Separators (keyboard divider, etc.)
  BUTTON: '#303032',      // Button borders
  ACTIVE: '#22C55E',      // Active/selected state
} as const;

// Background colors
export const BACKGROUNDS = {
  DARKEST: '#09090b',     // Terminal, ServerStats main bg
  DARKER: '#0e0e10',      // TabBar
  HEADER: '#131316',      // FileManagerHeader, FileManagerToolbar
  DARK: '#18181b',        // FileManager, general dark bg
  CARD: '#1a1a1a',        // ServerStats cards, file items
  BUTTON: '#2a2a2a',      // Standard button background
  BUTTON_ALT: '#23232a',  // Alternative button background (FileManager)
  ACTIVE: '#4a4a4a',      // Active button state
  HOVER: '#2d2d30',       // Hover state
} as const;

// Border radius
export const RADIUS = {
  BUTTON: 6,      // Standard button radius
  CARD: 12,       // Card/panel radius
  SMALL: 4,       // Small elements (breadcrumb, tiny buttons)
  LARGE: 16,      // Modals, large panels
} as const;

// Spacing
export const SPACING = {
  TOOLBAR_PADDING_PORTRAIT: 12,
  TOOLBAR_PADDING_LANDSCAPE: 8,
  BUTTON_PADDING_PORTRAIT: 8,
  BUTTON_PADDING_LANDSCAPE: 6,
  CARD_GAP: 12,
  BUTTON_GAP: 8,
} as const;

// Text colors
export const TEXT_COLORS = {
  PRIMARY: '#ffffff',
  SECONDARY: '#9CA3AF',
  TERTIARY: '#6B7280',
  DISABLED: '#4B5563',
  ACCENT: '#22C55E',
} as const;

// Icon sizes
export const ICON_SIZES = {
  SMALL: 16,      // Landscape mode
  MEDIUM: 18,     // Standard
  LARGE: 20,      // Portrait mode, important actions
} as const;
