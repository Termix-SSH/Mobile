import type { FrameFold } from "../../src/core/plugins/frame-protocol";

const VARS = ["--termix-fold-start", "--termix-fold-end", "--termix-fold-size"];

/**
 * Tells the page where a foldable screen bends: CSS custom properties and
 * attributes on <html> for layouts in plain CSS, window.termixFold for code,
 * and a "termix:fold" event on window whenever it changes.
 */
export function applyFold(
  fold: FrameFold | null,
  win: Window & { termixFold?: FrameFold | null } = window,
): void {
  const html = win.document.documentElement;
  if (fold) {
    html.style.setProperty(VARS[0], `${fold.start}px`);
    html.style.setProperty(VARS[1], `${fold.end}px`);
    html.style.setProperty(VARS[2], `${fold.end - fold.start}px`);
    html.setAttribute("data-termix-fold", fold.axis);
    html.toggleAttribute("data-termix-fold-active", fold.active);
  } else {
    VARS.forEach((name) => html.style.removeProperty(name));
    html.removeAttribute("data-termix-fold");
    html.removeAttribute("data-termix-fold-active");
  }
  win.termixFold = fold;
  win.dispatchEvent(new CustomEvent("termix:fold", { detail: fold }));
}
