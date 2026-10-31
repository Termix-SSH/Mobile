import { hasUsableData } from "@/core/accounts/usable";

const server = (options: Record<string, unknown>) =>
  ({ id: "a", kind: "server", options }) as never;

test("This device and synced servers have hosts to show, even signed out", () => {
  expect(hasUsableData({ id: "local", kind: "local" }, false)).toBe(true);
  expect(hasUsableData(server({ sync: true }), false)).toBe(true);
  expect(hasUsableData(server({ sync: false }), false)).toBe(false);
  expect(hasUsableData(server({}), true)).toBe(true);
});
