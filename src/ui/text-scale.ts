// Font sizes and line heights of the text classes the app uses (see tailwind.config.js).
const SIZES: Record<string, [number, number]> = {
  "text-2xs": [10, 14],
  "text-meta": [11, 15],
  "text-xs": [12, 16],
  "text-row": [13, 17],
  "text-sm": [14, 20],
  "text-base": [16, 24],
  "text-lg": [18, 28],
  "text-xl": [20, 28],
  "text-2xl": [24, 32],
  "text-3xl": [30, 36],
  "text-title": [17, 22],
};

const ARBITRARY = /^text-\[(\d+(?:\.\d+)?)px\]$/;

/**
 * Size of the last size class in a className, or null when it has none.
 * NativeWind owns the class styles, so scaling has to come from an explicit style.
 */
export function classSize(className?: string): [number, number] | null {
  if (!className) return null;
  let found: [number, number] | null = null;
  for (const token of className.split(/\s+/)) {
    const known = SIZES[token];
    if (known) {
      found = known;
      continue;
    }
    const m = ARBITRARY.exec(token);
    if (m) {
      const px = Number(m[1]);
      found = [px, Math.round(px * 1.35)];
    }
  }
  return found;
}

export function scaledTextStyle(
  className: string | undefined,
  scale: number,
): { fontSize: number; lineHeight: number } | null {
  if (scale === 1) return null;
  const size = classSize(className);
  if (!size) return null;
  return {
    fontSize: Math.round(size[0] * scale * 10) / 10,
    lineHeight: Math.round(size[1] * scale * 10) / 10,
  };
}
