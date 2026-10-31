import { sessionsMark, TABS } from "@/screens/shell/BottomBar";

test("the bar has five tabs in order", () => {
  expect(TABS.map((t) => t.name)).toEqual([
    "home",
    "hosts",
    "sessions",
    "tools",
    "settings",
  ]);
});

test("the Sessions mark shows the worst open tab", () => {
  expect(sessionsMark([], {})).toBeNull();
  expect(sessionsMark(["a"], { a: { state: "connected" } })).toBeNull();
  expect(
    sessionsMark(["a", "b"], {
      a: { state: "connected" },
      b: { state: "reconnecting" },
    }),
  ).toBe("trouble");
  expect(
    sessionsMark(["a", "b"], {
      a: { state: "offline" },
      b: { state: "failed" },
    }),
  ).toBe("failed");
  // Closed tabs left in the store do not count.
  expect(sessionsMark(["a"], { b: { state: "failed" } })).toBeNull();
});
