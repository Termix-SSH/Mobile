import * as BackgroundTask from "expo-background-task";
import { accounts } from "@/core/accounts";
import {
  BACKGROUND_SYNC_TASK,
  backgroundSync,
  updateBackgroundSync,
} from "@/core/sync/background";
import { sync } from "@/core/sync/manager";
import * as TaskManager from "expo-task-manager";
import { resetStorage } from "../../helpers/http";

jest.mock("expo-task-manager", () => {
  const defined = new Map<string, () => Promise<unknown>>();
  const registered = new Set<string>();
  return {
    __defined: defined,
    __registered: registered,
    isTaskDefined: (name: string) => defined.has(name),
    defineTask: (name: string, fn: () => Promise<unknown>) =>
      defined.set(name, fn),
    isTaskRegisteredAsync: async (name: string) => registered.has(name),
  };
});

jest.mock("expo-background-task", () => {
  const tasks = () => require("expo-task-manager").__registered as Set<string>;
  return {
    BackgroundTaskStatus: { Restricted: 1, Available: 2 },
    BackgroundTaskResult: { Success: 1, Failed: 2 },
    getStatusAsync: async () => 2,
    registerTaskAsync: jest.fn(async (name: string) => tasks().add(name)),
    unregisterTaskAsync: jest.fn(async (name: string) => tasks().delete(name)),
  };
});

jest.mock("@/core/sync/manager", () => ({
  sync: { runInBackground: jest.fn(async () => 1) },
}));

const mockDefined = (TaskManager as any).__defined as Map<string, unknown>;
const mockRegistered = (TaskManager as any).__registered as Set<string>;

beforeEach(resetStorage);

afterEach(async () => {
  for (const a of accounts.list()) {
    if (a.kind === "server") await accounts.remove(a.id).catch(() => {});
  }
});

test("the task is mockDefined when the app loads", () => {
  expect(mockDefined.get(BACKGROUND_SYNC_TASK)).toBe(backgroundSync);
});

test("it is mockRegistered only while a server syncs", async () => {
  expect(await updateBackgroundSync()).toBe(false);
  expect(mockRegistered.size).toBe(0);
  const account = await accounts.add("https://termix.example");
  await accounts.update(account.id, { options: { sync: true } });
  expect(await updateBackgroundSync()).toBe(true);
  expect(BackgroundTask.registerTaskAsync).toHaveBeenCalledWith(
    BACKGROUND_SYNC_TASK,
    { minimumInterval: 15 },
  );
  await accounts.update(account.id, { options: { sync: false } });
  await updateBackgroundSync();
  expect(mockRegistered.size).toBe(0);
});

test("a run syncs within its budget and reports success", async () => {
  expect(await backgroundSync()).toBe(
    BackgroundTask.BackgroundTaskResult.Success,
  );
  expect(sync.runInBackground).toHaveBeenCalledWith(25_000);
  (sync.runInBackground as jest.Mock).mockRejectedValueOnce(new Error("x"));
  expect(await backgroundSync()).toBe(
    BackgroundTask.BackgroundTaskResult.Failed,
  );
});
