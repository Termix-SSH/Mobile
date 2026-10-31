import { act, renderHook } from "@testing-library/react-native";
import { scriptShell } from "@termix-ssh/plugin-sdk/host-scripts";
import { execPool } from "@/core/exec/pool";
import {
  resolveExecTarget,
  useCardTarget,
  useExecTarget,
} from "@/core/exec/target";
import { SshError } from "@/modules/termix-ssh";
import { fakeHostSession, fakeSsh } from "../../helpers/exec";

const mockCheckOpen = jest.fn();
jest.mock("@/core/features/open-check", () => ({
  checkOpen: (...args: unknown[]) => mockCheckOpen(...args),
}));
jest.mock("@/core/sync", () => ({
  isSynced: () => true,
  asServerHost: async (_a: string, host: any) => ({ ...host, id: 99 }),
}));
jest.mock("@/core/accounts/session", () => ({
  useSessionAccountId: () => "s",
}));
jest.mock("@/core/data/hooks", () => ({
  useSessionRepositories: () => ({
    hosts: { get: async () => ({ sudoPassword: "saved" }) },
  }),
}));

beforeEach(() => mockCheckOpen.mockReset());
afterEach(() => execPool.dispose());

const host = {
  id: 1,
  name: "web",
  ip: "10.0.0.2",
  port: 22,
  username: "u",
} as any;
const relay = { kind: "relay", provides: ["server"], available: true } as any;
const local = (openSession: jest.Mock) =>
  ({ kind: "local", provides: ["exec"], available: true, openSession }) as any;

async function settle() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

test("a blocked plan fails with its reason and fix", async () => {
  mockCheckOpen.mockResolvedValue({
    attempts: [],
    blocked: { reason: "Docker is off on this server", fix: "device" },
  });
  const target = await resolveExecTarget({
    accountId: "s",
    host,
    type: "docker",
  });
  expect(target).toMatchObject({
    phase: "failed",
    failure: { message: "Docker is off on this server" },
    fix: "device",
  });
});

test("the relay gets the server's own host", async () => {
  mockCheckOpen.mockResolvedValue({ attempts: [relay] });
  const target = await resolveExecTarget({
    accountId: "s",
    host,
    type: "docker",
  });
  expect(target).toEqual({
    phase: "relay",
    host: expect.objectContaining({ id: 99 }),
  });
});

test("local logs in first and falls through on a network failure", async () => {
  const open = jest
    .fn()
    .mockRejectedValueOnce(new SshError("timeout", "timed out"))
    .mockResolvedValue(fakeHostSession(fakeSsh()).session);
  mockCheckOpen.mockResolvedValue({ attempts: [local(open), relay] });
  const target = await resolveExecTarget({
    accountId: "s",
    host,
    type: "docker",
  });
  expect(target.phase).toBe("relay");
});

test("a login failure that the next way can't fix stops there", async () => {
  const open = jest.fn().mockRejectedValue(new SshError("auth", "denied"));
  mockCheckOpen.mockResolvedValue({ attempts: [local(open), relay] });
  const target = await resolveExecTarget({
    accountId: "s",
    host,
    type: "docker",
  });
  expect(target).toMatchObject({
    phase: "failed",
    failure: { origin: "local" },
  });
});

test("the hook connects when the tab shows and passes the saved sudo password", async () => {
  const fake = fakeSsh((c) =>
    c.command === scriptShell("root")
      ? { stderr: "sudo: a password is required", code: 1 }
      : { stdout: "ok" },
  );
  const open = jest.fn(async () => fakeHostSession(fake).session);
  mockCheckOpen.mockResolvedValue({ attempts: [local(open)] });
  const { result, rerender } = await renderHook(
    ({ active }: { active: boolean }) => useExecTarget(host, "docker", active),
    { initialProps: { active: false } },
  );
  await settle();
  expect(mockCheckOpen).not.toHaveBeenCalled();
  await rerender({ active: true });
  await settle();
  const target = result.current.target;
  expect(target.phase).toBe("local");
  if (target.phase !== "local") return;
  await target.runner.run("x", { mode: "root" });
  expect(fake.calls[1].stdin.split("\n")[1]).toBe("saved");
});

test("a card target waits until active, skips the login, and lets go on unmount", async () => {
  const open = jest.fn(async () => fakeHostSession(fakeSsh()).session);
  mockCheckOpen.mockResolvedValue({ attempts: [local(open)] });
  const { result, rerender, unmount } = await renderHook(
    ({ active }: { active: boolean }) =>
      useCardTarget(host, "s", "docker", active),
    { initialProps: { active: false } },
  );
  await settle();
  expect(mockCheckOpen).not.toHaveBeenCalled();
  await rerender({ active: true });
  await settle();
  expect(result.current.phase).toBe("local");
  expect(open).not.toHaveBeenCalled();
  await unmount();
  expect(execPool.size()).toBe(0);
});
