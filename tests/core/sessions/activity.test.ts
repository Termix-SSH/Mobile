import { logTabOpened } from "@/core/sessions/activity";

const mockLog = jest.fn(async () => ({ message: "ok", id: 1 }));
const mockAdd = jest.fn(async () => {});
let mockClient: unknown = { api: { homepage: { logActivity: mockLog } } };
let mockSynced = false;

jest.mock("@/core/accounts", () => ({
  accounts: { find: () => ({ id: "local", kind: "local" }) },
  clientFor: () => mockClient,
}));
jest.mock("@/core/data/repositories", () => ({
  repositoriesFor: () => ({ recentActivity: { add: mockAdd } }),
}));
jest.mock("@/core/sync", () => ({
  isSynced: () => mockSynced,
  asServerHost: async (_id: string, host: { id: number }) => ({
    ...host,
    id: 70,
  }),
}));
jest.mock("@/core/features", () => {
  const tabs: Record<string, unknown> = {
    files: { activityType: () => "file_manager" },
    "remote-desktop": {
      activityType: (s: { remoteProtocol?: string }) =>
        s.remoteProtocol ?? "rdp",
    },
    terminal: {},
  };
  return { features: { sessionTab: (type: string) => tabs[type] ?? null } };
});

const host = { id: 7, name: "web" } as any;

beforeEach(() => {
  mockLog.mockClear();
  mockAdd.mockClear();
  mockClient = { api: { homepage: { logActivity: mockLog } } };
  mockSynced = false;
});

test("opening files logs file activity on the server", async () => {
  await logTabOpened("acct", host, "files");
  expect(mockLog).toHaveBeenCalledWith("file_manager", 7, "web");
});

test("a synced account logs the server's host id", async () => {
  mockSynced = true;
  await logTabOpened("acct", host, "files");
  expect(mockLog).toHaveBeenCalledWith("file_manager", 70, "web");
});

test("remote desktops log their protocol", async () => {
  await logTabOpened("acct", host, "remote-desktop", "vnc");
  expect(mockLog).toHaveBeenCalledWith("vnc", 7, "web");
});

test("the terminal logs on its own, so opening it logs nothing here", async () => {
  await logTabOpened("acct", host, "terminal");
  expect(mockLog).not.toHaveBeenCalled();
});

test("This device keeps its own activity list", async () => {
  mockClient = null;
  await logTabOpened("local", host, "files");
  expect(mockAdd).toHaveBeenCalledWith({ kind: "file_manager", title: "web" });
});

test("a server without the activity feed does not break opening", async () => {
  mockLog.mockRejectedValueOnce(new Error("404"));
  await expect(logTabOpened("acct", host, "files")).resolves.toBeUndefined();
});
