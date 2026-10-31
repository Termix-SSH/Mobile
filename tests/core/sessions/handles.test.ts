import { sessionHandles } from "@/core/sessions/handles";

test("handles are found by session id until unregistered", () => {
  const handle = { sendInput: jest.fn() } as any;
  const off = sessionHandles.register("a", () => handle);
  expect(sessionHandles.get("a")).toBe(handle);
  expect(sessionHandles.get("b")).toBeNull();
  expect(sessionHandles.get(null)).toBeNull();
  // A newer registration for the same id is not removed by the old one.
  const newer = sessionHandles.register("a", () => null);
  off();
  expect(sessionHandles.get("a")).toBeNull();
  newer();
});
