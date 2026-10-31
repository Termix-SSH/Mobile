import { accountBackend } from "@/features/snippets/run-hosts";
import type { Snippet, SSHHost } from "@/types";

const mockPlan = jest.fn();
const mockExecute = jest.fn();

jest.mock("@/core/transport", () => ({
  planFor: (...args: unknown[]) => mockPlan(...args),
}));
jest.mock("@/core/accounts", () => ({
  accounts: {
    active: () => ({ id: "acct", kind: "server" }),
    client: () => ({ api: { snippets: { executeSnippet: mockExecute } } }),
  },
}));
jest.mock("@/core/sync/host-ids", () => ({
  serverHostId: async (_id: string, host: { id: number }) => host.id + 100,
  serverSnippetId: async (_id: string, s: { id: number }) => s.id + 200,
}));

const host = {
  id: 1,
  name: "h",
  ip: "10.0.0.1",
  port: 22,
  username: "root",
  authType: "password",
} as SSHHost;

const encode = (text: string) => new TextEncoder().encode(text);

function local(exec: jest.Mock, close = jest.fn()) {
  return {
    kind: "local",
    available: true,
    provides: ["exec"],
    openSession: jest.fn(async () => ({ exec, close })),
  };
}

beforeEach(() => {
  mockPlan.mockReset();
  mockExecute.mockReset();
});

test("attempts follow the plan, phone for local and server for relay", async () => {
  mockPlan.mockResolvedValue({
    origin: "auto",
    attempts: [{ kind: "local" }, { kind: "relay" }],
  });
  expect(await accountBackend("acct").attempts(host)).toEqual([
    "phone",
    "server",
  ]);
});

test("a blocked plan throws its reason", async () => {
  mockPlan.mockResolvedValue({
    origin: "device",
    attempts: [],
    blocked: { reason: "No SSH engine" },
  });
  await expect(accountBackend("acct").attempts(host)).rejects.toThrow(
    "No SSH engine",
  );
});

test("the phone opens a session, runs the command and closes it", async () => {
  const exec = jest.fn(async () => ({
    stdout: encode("hello"),
    stderr: encode(""),
    exitCode: 0,
  }));
  const close = jest.fn();
  const transport = local(exec as never, close);
  mockPlan.mockResolvedValue({ origin: "device", attempts: [transport] });
  const backend = accountBackend("acct");
  await backend.attempts(host);
  const res = await backend.phone(host, "uptime");
  expect(res).toEqual({ stdout: "hello", stderr: "", exitCode: 0 });
  expect(exec).toHaveBeenCalledWith("uptime", { timeoutSecs: 60 });
  expect(close).toHaveBeenCalled();
});

test("running on the phone without a planned session fails plainly", async () => {
  await expect(accountBackend("acct").phone(host, "x")).rejects.toThrow(
    "can't run it",
  );
});

test("the server runs by its own ids and passes the inputs", async () => {
  mockExecute.mockResolvedValue({ success: true, output: "done" });
  const res = await accountBackend("acct").server(host, { id: 5 } as Snippet, {
    INPUT_1: "x",
  });
  expect(mockExecute).toHaveBeenCalledWith(205, 101, { INPUT_1: "x" });
  expect(res.output).toBe("done");
});
