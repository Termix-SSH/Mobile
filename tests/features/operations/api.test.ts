import {
  appliesTo,
  runControl,
  type Action,
  type Run,
} from "@/features/operations/api";

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

const run = (overrides: Partial<Run> = {}): Run => ({
  id: "r1",
  actionId: "docker.restart-container",
  hostName: "web",
  username: "admin",
  status: "success",
  summary: null,
  error: null,
  dryRun: false,
  createdAt: "2026-11-18T00:00:00Z",
  input: {},
  ...overrides,
});

test("running and waiting runs can be cancelled", () => {
  expect(runControl(run({ status: "running" }))).toBe("cancel");
  expect(runControl(run({ status: "pending_approval" }))).toBe("cancel");
});

test("only finished runs with an undo can be undone", () => {
  expect(runControl(run({ undoAvailable: true }))).toBe("undo");
  expect(runControl(run())).toBeNull();
  expect(runControl(run({ undoAvailable: true, dryRun: true }))).toBeNull();
  expect(runControl(run({ status: "failed", undoAvailable: true }))).toBeNull();
});
