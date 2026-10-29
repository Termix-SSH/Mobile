/**
 * Layout tokens from core's classic layout (panel-layout.tsx, list-kit.tsx).
 * Control heights are a step taller than the web so they stay easy to tap.
 */

export const SPACING = {
  /** Panel body padding (core p-2.5). */
  body: 10,
  /** Gap between stacked items (core gap-2). */
  gap: 8,
  /** Header and band padding (core px-3 py-2). */
  bandX: 12,
  bandY: 8,
} as const;

export const HEIGHTS = {
  /** Screen header and tab bar (core h-12.5). */
  header: 50,
  controlXs: 28,
  controlSm: 32,
  control: 36,
  /** Text fields (Input default size). */
  field: 40,
  controlLg: 44,
  /** Smallest comfortable touch target. */
  touch: 44,
} as const;

export const TYPE = {
  label: 10,
  meta: 11,
  body: 12,
  rowTitle: 13,
  heading: 14,
  title: 17,
} as const;

export const ICON_SIZES = {
  sm: 14,
  md: 16,
  lg: 20,
} as const;

/** Extra touch area around controls smaller than HEIGHTS.touch. */
export function hitSlopFor(height: number): number {
  return Math.max(0, Math.ceil((HEIGHTS.touch - height) / 2));
}
