import { FOLD_COLUMN_MIN, homeColumns } from "@/screens/home/columns";
import type { Fold } from "@/utils/fold";

const book = (start: number, end: number, active = true): Fold => ({
  axis: "vertical",
  start,
  end,
  active,
});

test("flat screens split evenly when there is room for two", () => {
  expect(homeColumns(true, { x: 96, width: 700 }, null)).toEqual({
    two: true,
    fold: null,
  });
  expect(homeColumns(false, { x: 12, width: 360 }, null)).toEqual({
    two: false,
    fold: null,
  });
});

test("a book fold puts the gap between the columns on the crease", () => {
  // Rail on the left: the row starts 96pt into the window.
  expect(homeColumns(true, { x: 96, width: 760 }, book(428, 452))).toEqual({
    two: true,
    fold: { first: 332, gap: 24 },
  });
});

test("right to left, the first column is the right half", () => {
  expect(
    homeColumns(true, { x: 96, width: 760 }, book(428, 452), true),
  ).toEqual({ two: true, fold: { first: 404, gap: 24 } });
});

test("a book fold gives each half a column even on a small screen", () => {
  expect(homeColumns(false, { x: 12, width: 576 }, book(288, 312))).toEqual({
    two: true,
    fold: { first: 276, gap: 24 },
  });
});

test("a flat fold leaves the columns even", () => {
  expect(
    homeColumns(true, { x: 12, width: 576 }, book(288, 312, false)),
  ).toEqual({ two: true, fold: null });
});

test("a laptop fold leaves the columns alone", () => {
  const laptop: Fold = {
    axis: "horizontal",
    start: 400,
    end: 424,
    active: true,
  };
  expect(homeColumns(false, { x: 12, width: 360 }, laptop)).toEqual({
    two: false,
    fold: null,
  });
});

test("a crease too near the row's edge leaves the columns even", () => {
  // The rail takes most of the left half, so the left column would be too thin.
  const row = { x: 200, width: 600 };
  const fold = book(200 + FOLD_COLUMN_MIN - 1, 200 + FOLD_COLUMN_MIN + 23);
  expect(homeColumns(true, row, fold)).toEqual({ two: true, fold: null });
  // Before the row has been measured there is nothing to line up with.
  expect(homeColumns(true, null, book(400, 424))).toEqual({
    two: true,
    fold: null,
  });
});
