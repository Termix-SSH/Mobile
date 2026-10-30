import {
  canSplit,
  clampRatio,
  partnerAfterActivate,
  splitEdges,
  splitPartner,
  nearFold,
  FOLD_SNAP,
} from "@/screens/sessions/split";

test("only large screens split", () => {
  expect(canSplit(1024, 768)).toBe(true);
  expect(canSplit(390, 844)).toBe(false);
  expect(canSplit(844, 390)).toBe(false);
});

test("the partner must be another open tab", () => {
  expect(splitPartner(["a", "b"], "a", "b")).toBe("b");
  expect(splitPartner(["a", "b"], "a", "a")).toBeNull();
  expect(splitPartner(["a"], "a", "b")).toBeNull();
  expect(splitPartner(["a", "b"], null, "b")).toBeNull();
  expect(splitPartner(["a", "b"], "a", null)).toBeNull();
});

test("tapping the partner swaps it with the active tab", () => {
  expect(partnerAfterActivate("a", "b", "b")).toBe("a");
  expect(partnerAfterActivate("a", "b", "c")).toBe("b");
  expect(partnerAfterActivate("a", null, "b")).toBeNull();
});

test("the divider stays between 30 and 70 percent", () => {
  expect(clampRatio(0.1)).toBe(0.3);
  expect(clampRatio(0.5)).toBe(0.5);
  expect(clampRatio(0.95)).toBe(0.7);
});

test("the split follows the dragged ratio with no fold", () => {
  expect(splitEdges(800, 0.5, null)).toEqual({
    start: 397,
    end: 403,
    onFold: false,
  });
});

test("a fold across the stage holds the divider", () => {
  expect(splitEdges(867, 0.3, { start: 380, end: 404 })).toEqual({
    start: 380,
    end: 404,
    onFold: true,
  });
});

test("a fold too close to an edge leaves the divider to the ratio", () => {
  expect(splitEdges(500, 0.5, { start: -100, end: -76 }).onFold).toBe(false);
  expect(splitEdges(500, 0.5, { start: 300, end: 324 }).onFold).toBe(false);
});

test("a divider dragged off the fold leaves it to the ratio", () => {
  expect(splitEdges(867, 0.3, { start: 380, end: 404 }, false)).toEqual({
    start: 257,
    end: 263,
    onFold: false,
  });
});

test("a divider let go near the fold snaps back onto it", () => {
  const fold = { start: 380, end: 404 };
  expect(nearFold(392, fold)).toBe(true);
  expect(nearFold(392 + FOLD_SNAP, fold)).toBe(true);
  expect(nearFold(392 + FOLD_SNAP + 1, fold)).toBe(false);
  expect(nearFold(392, null)).toBe(false);
});
