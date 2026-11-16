import { appliesTo, type Action } from "@/features/operations/api";

const action = (overrides: Partial<Action> = {}): Action => ({
  id: "docker.restart-container",
  pluginId: "docker",
  pluginName: "Docker",
  title: "Restart container",
  scope: "resource",
  risk: "change",
  inputs: [],
  when: { settings: { enableDocker: true } },
  available: true,
  ...overrides,
});

test("an action shows only where its plugin is on", () => {
  expect(appliesTo(action(), { docker: { enableDocker: true } })).toBe(true);
  expect(appliesTo(action(), { docker: {} })).toBe(false);
  expect(appliesTo(action(), undefined)).toBe(false);
});

test("server actions and missing plugins never show on a host", () => {
  expect(appliesTo(action({ scope: "server", when: undefined }), {})).toBe(
    false,
  );
  expect(
    appliesTo(action({ available: false }), { docker: { enableDocker: true } }),
  ).toBe(false);
  expect(appliesTo(action({ when: undefined }), {})).toBe(true);
});
