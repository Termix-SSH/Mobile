import { frameFold, sameFold } from "@/core/plugins/frame-fold";
import type { Fold } from "@/utils/fold";

// The iPhone Duo's inner screen bent like a book: the crease at x 400.
const book: Fold = { axis: "vertical", start: 388, end: 412, active: true };

test("no fold or no size yet gives nothing", () => {
  expect(frameFold(null, { x: 0, y: 0, width: 800, height: 600 })).toBeNull();
  expect(frameFold(book, null)).toBeNull();
  expect(frameFold(book, { x: 0, y: 0, width: 0, height: 0 })).toBeNull();
});

test("a full screen page gets the fold where the window has it", () => {
  expect(frameFold(book, { x: 0, y: 90, width: 800, height: 510 })).toEqual({
    axis: "vertical",
    start: 388,
    end: 412,
    active: true,
  });
});

test("a page beside a host list gets the fold in its own coordinates", () => {
  expect(frameFold(book, { x: 300, y: 0, width: 500, height: 600 })).toEqual({
    axis: "vertical",
    start: 88,
    end: 112,
    active: true,
  });
});

test("a horizontal fold is offset by the page's top", () => {
  const laptop: Fold = {
    axis: "horizontal",
    start: 388,
    end: 412,
    active: false,
  };
  expect(frameFold(laptop, { x: 40, y: 100, width: 760, height: 500 })).toEqual(
    { axis: "horizontal", start: 288, end: 312, active: false },
  );
});

test("a page on one side of the crease gets nothing", () => {
  expect(frameFold(book, { x: 412, y: 0, width: 388, height: 600 })).toBeNull();
  expect(frameFold(book, { x: 0, y: 0, width: 388, height: 600 })).toBeNull();
});

test("the clear area is cut to the page and rounded", () => {
  expect(
    frameFold(book, { x: 395.4, y: 0, width: 404.6, height: 600 }),
  ).toEqual({ axis: "vertical", start: 0, end: 17, active: true });
});

test("sameFold compares by value", () => {
  const a = frameFold(book, { x: 0, y: 0, width: 800, height: 600 });
  const b = frameFold(book, { x: 0, y: 10, width: 800, height: 590 });
  expect(sameFold(a, b)).toBe(true);
  expect(sameFold(a, { ...a!, active: false })).toBe(false);
  expect(sameFold(a, null)).toBe(false);
  expect(sameFold(null, null)).toBe(true);
});
