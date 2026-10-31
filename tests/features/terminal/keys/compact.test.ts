import { compactKeySize, keyBarHeight } from "@/features/terminal/keys/compact";

test("keys go one size down in a short window", () => {
  expect(compactKeySize("large", true)).toBe("medium");
  expect(compactKeySize("medium", true)).toBe("small");
  expect(compactKeySize("small", true)).toBe("small");
  expect(compactKeySize("large", false)).toBe("large");
});

test("the key row is tighter when the window is short", () => {
  expect(keyBarHeight(true, true)).toBe(40);
  expect(keyBarHeight(true, false)).toBe(48);
  expect(keyBarHeight(false, false)).toBe(52);
});
