import {
  clampCompanion,
  MIN_COMPANION,
} from "@/screens/sessions/CompanionPane";

test("a panel stays between its smallest width and 60 percent of the screen", () => {
  expect(clampCompanion(100, 1000)).toBe(MIN_COMPANION);
  expect(clampCompanion(900, 1000)).toBe(600);
  expect(clampCompanion(380.4, 1000)).toBe(380);
  expect(clampCompanion(500, 300)).toBe(MIN_COMPANION);
});
