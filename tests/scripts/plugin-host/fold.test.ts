/**
 * @jest-environment jsdom
 */
import { applyFold } from "../../../scripts/plugin-host/fold";

const html = () => document.documentElement;
const win = window as Window & { termixFold?: unknown };

test("a fold becomes CSS variables, attributes, a global and an event", () => {
  const seen: unknown[] = [];
  const listener = (e: Event) => seen.push((e as CustomEvent).detail);
  window.addEventListener("termix:fold", listener);

  const fold = { axis: "vertical", start: 88, end: 112, active: true } as const;
  applyFold(fold);
  expect(html().style.getPropertyValue("--termix-fold-start")).toBe("88px");
  expect(html().style.getPropertyValue("--termix-fold-end")).toBe("112px");
  expect(html().style.getPropertyValue("--termix-fold-size")).toBe("24px");
  expect(html().getAttribute("data-termix-fold")).toBe("vertical");
  expect(html().hasAttribute("data-termix-fold-active")).toBe(true);
  expect(win.termixFold).toEqual(fold);

  applyFold({ ...fold, active: false });
  expect(html().hasAttribute("data-termix-fold-active")).toBe(false);
  expect(html().getAttribute("data-termix-fold")).toBe("vertical");

  applyFold(null);
  expect(html().style.getPropertyValue("--termix-fold-start")).toBe("");
  expect(html().hasAttribute("data-termix-fold")).toBe(false);
  expect(win.termixFold).toBeNull();

  expect(seen).toEqual([fold, { ...fold, active: false }, null]);
  window.removeEventListener("termix:fold", listener);
});

test("a fold that is gone leaves nothing behind", () => {
  applyFold({ axis: "horizontal", start: 300, end: 324, active: true });
  expect(html().hasAttribute("data-termix-fold-active")).toBe(true);

  applyFold(null);
  expect(html().getAttribute("style") ?? "").not.toContain("--termix-fold");
  expect(html().hasAttribute("data-termix-fold")).toBe(false);
  expect(html().hasAttribute("data-termix-fold-active")).toBe(false);
  expect(win.termixFold).toBeNull();
});
