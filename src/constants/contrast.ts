// WCAG contrast math on "R G B" triplets, the format theme tokens use.

type RGB = [number, number, number];

function parse(triplet: string): RGB {
  const [r, g, b] = triplet.trim().split(/\s+/).map(Number);
  return [r, g, b];
}

function luminance([r, g, b]: RGB): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** Contrast ratio of two colors, 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(parse(a));
  const lb = luminance(parse(b));
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** The color laid at `alpha` over a background, like text-muted/70. */
export function blend(
  color: string,
  background: string,
  alpha: number,
): string {
  const c = parse(color);
  const bg = parse(background);
  return c.map((v, i) => Math.round(v * alpha + bg[i] * (1 - alpha))).join(" ");
}

/**
 * The color, darkened on a light background or lightened on a dark one just
 * enough to be readable as text. Colors that already pass come back as is.
 */
export function readableOn(
  color: string,
  background: string,
  min = 4.5,
): string {
  if (contrastRatio(color, background) >= min) return color;
  const target = luminance(parse(background)) > 0.5 ? "0 0 0" : "255 255 255";
  for (let step = 1; step <= 20; step++) {
    const mixed = blend(target, color, step / 20);
    if (contrastRatio(mixed, background) >= min) return mixed;
  }
  return target;
}
