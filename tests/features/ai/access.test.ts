import { accessFromHttpError, accessFromStatus } from "@/features/ai/access";

test.each([true, false])(
  "maps status with read-only commands %s",
  (allowReadOnlyCommands) => {
    for (const enabled of [true, false]) {
      expect(
        accessFromStatus({
          globallyEnabled: false,
          enabled,
          allowReadOnlyCommands,
        }),
      ).toEqual({ state: "disabled-globally" });
      expect(
        accessFromStatus({
          globallyEnabled: true,
          enabled,
          allowReadOnlyCommands,
        }),
      ).toEqual({
        state: enabled ? "ready" : "needs-opt-in",
        allowReadOnlyCommands,
      });
    }
  },
);

test("invalid status becomes an error", () => {
  expect(accessFromStatus(null)).toEqual({
    state: "error",
    message: "Unexpected response",
  });
});

test.each([
  [401, { error: "Expired" }, { state: "signed-out" }],
  [403, { error: "Denied" }, { state: "forbidden" }],
  [404, { error: "Not found" }, { state: "not-installed" }],
  [502, " \n<!DOCTYPE html><html></html>", { state: "not-installed" }],
  [500, "<HTML></HTML>", { state: "not-installed" }],
  [
    500,
    { error: "Provider unavailable" },
    { state: "error", message: "Provider unavailable" },
  ],
  [503, null, { state: "error", message: "AI request failed (503)" }],
  [502, { error: " " }, { state: "error", message: "AI request failed (502)" }],
  [
    undefined,
    undefined,
    { state: "error", message: "Unable to reach the AI service" },
  ],
  [undefined, { error: "Offline" }, { state: "error", message: "Offline" }],
] as const)("maps HTTP %s with %j", (status, data, expected) => {
  expect(accessFromHttpError(status, data)).toEqual(expected);
});
