import { XTERM_FALLBACK, shouldUseXterm } from "@/features/terminal/fallback";

test("the native terminal unless the engine is missing", () => {
  expect(shouldUseXterm(true)).toBe(false);
  expect(shouldUseXterm(false)).toBe(true);
});

test("tests have no engine, so they get the fallback", () => {
  expect(XTERM_FALLBACK).toBe(true);
});
