import { barColumnSide, verticalBarSide } from "@/utils/vertical-bar";

test("the system's leading and trailing edges become window sides", () => {
  expect(verticalBarSide("trailing", false)).toBe("right");
  expect(verticalBarSide("leading", false)).toBe("left");
  // Right to left flips them.
  expect(verticalBarSide("trailing", true)).toBe("left");
  expect(verticalBarSide("leading", true)).toBe("right");
  expect(verticalBarSide("none", false)).toBeNull();
  expect(verticalBarSide(undefined, false)).toBeNull();
});

test("the bar column counts only while the safe area keeps room for it", () => {
  const bar = { edge: "trailing" as const, insetLeft: 0, insetRight: 86 };
  expect(barColumnSide(bar, false)).toBe("right");
  // The system still names its preferred edge while bars stay horizontal.
  expect(barColumnSide({ ...bar, insetRight: 0 }, false)).toBeNull();
  expect(barColumnSide({ edge: "trailing" }, false)).toBeNull();
  expect(barColumnSide({ ...bar, edge: "none" }, false)).toBeNull();
  expect(barColumnSide(null, false)).toBeNull();
  expect(
    barColumnSide({ edge: "leading", insetLeft: 86, insetRight: 0 }, false),
  ).toBe("left");
});
