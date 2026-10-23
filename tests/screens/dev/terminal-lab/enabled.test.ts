import { labEnabled } from "@/screens/dev/terminal-lab/enabled";

test("on in dev builds", () => {
  expect(labEnabled(true, undefined)).toBe(true);
});

test("off in release builds unless CI sets the flag", () => {
  expect(labEnabled(false, undefined)).toBe(false);
  expect(labEnabled(false, "0")).toBe(false);
  expect(labEnabled(false, "1")).toBe(true);
});
