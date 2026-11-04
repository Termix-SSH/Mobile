import { verticalBarSide } from "@/utils/vertical-bar";

test("the system's leading and trailing edges become window sides", () => {
  expect(verticalBarSide("trailing", false)).toBe("right");
  expect(verticalBarSide("leading", false)).toBe("left");
  // Right to left flips them.
  expect(verticalBarSide("trailing", true)).toBe("left");
  expect(verticalBarSide("leading", true)).toBe("right");
  expect(verticalBarSide("none", false)).toBeNull();
  expect(verticalBarSide(undefined, false)).toBeNull();
});
