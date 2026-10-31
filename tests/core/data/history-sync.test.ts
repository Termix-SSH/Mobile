import { withServerHistory } from "@/core/data/history-sync";
import type { CommandHistoryRepository } from "@/core/data/types";
import type { SSHHost } from "@/types";

function localRepo() {
  const calls: string[] = [];
  const repo: CommandHistoryRepository = {
    subscribe: () => () => {},
    list: async () => ["local"],
    merge: async (_h, cmds) => {
      calls.push(`merge:${cmds.join(",")}`);
    },
    add: async (_h, c) => {
      calls.push(`add:${c}`);
    },
    remove: async (_h, c) => {
      calls.push(`remove:${c}`);
    },
    clear: async () => {
      calls.push("clear");
    },
  };
  return { repo, calls };
}

function fakeClient(enabled = true) {
  const terminal = {
    getCommandHistory: jest.fn(async () => ["from server"]),
    saveCommandToHistory: jest.fn(async () => {}),
    deleteCommandFromHistory: jest.fn(async () => {}),
    clearCommandHistory: jest.fn(async () => {}),
  };
  return {
    terminal,
    client: {
      isPluginEnabled: () => enabled,
      api: { terminal },
    } as never,
  };
}

const host = { id: 3, serverId: 41 } as SSHHost;
const flush = () => new Promise((r) => setTimeout(r, 0));

test("writes go to the phone and then the server, by the server's host id", async () => {
  const { repo, calls } = localRepo();
  const { client, terminal } = fakeClient();
  const history = withServerHistory(repo, () => client);
  await history.add(host, "ls");
  await history.remove(host, "ls");
  await history.clear(host);
  expect(calls).toEqual(["add:ls", "remove:ls", "clear"]);
  expect(terminal.saveCommandToHistory).toHaveBeenCalledWith(41, "ls");
  expect(terminal.deleteCommandFromHistory).toHaveBeenCalledWith(41, "ls");
  expect(terminal.clearCommandHistory).toHaveBeenCalledWith(41);
});

test("a list merges the server's history, at most every few minutes", async () => {
  const { repo, calls } = localRepo();
  const { client, terminal } = fakeClient();
  let time = 0;
  const history = withServerHistory(
    repo,
    () => client,
    () => time,
  );
  expect(await history.list(host)).toEqual(["local"]);
  await flush();
  expect(calls).toEqual(["merge:from server"]);
  await history.list(host);
  await flush();
  expect(terminal.getCommandHistory).toHaveBeenCalledTimes(1);
  time = 10 * 60 * 1000;
  await history.list(host);
  await flush();
  expect(terminal.getCommandHistory).toHaveBeenCalledTimes(2);
});

test("hosts with no server copy, no client or no plugin stay local", async () => {
  const { repo } = localRepo();
  const off = fakeClient(false);
  await withServerHistory(repo, () => off.client).add(host, "ls");
  expect(off.terminal.saveCommandToHistory).not.toHaveBeenCalled();
  const on = fakeClient();
  await withServerHistory(repo, () => on.client).add(
    { id: 3 } as SSHHost,
    "ls",
  );
  expect(on.terminal.saveCommandToHistory).not.toHaveBeenCalled();
  await withServerHistory(repo, () => null).add(host, "ls");
});

test("a failed server read is tried again on the next list", async () => {
  const { repo } = localRepo();
  const { client, terminal } = fakeClient();
  terminal.getCommandHistory.mockRejectedValueOnce(new Error("offline"));
  const history = withServerHistory(
    repo,
    () => client,
    () => 0,
  );
  await history.list(host);
  await flush();
  await history.list(host);
  await flush();
  expect(terminal.getCommandHistory).toHaveBeenCalledTimes(2);
});
