import { scriptShell } from "@termix-ssh/plugin-sdk/host-scripts";
import { ExecPool } from "@/core/exec/pool";
import { createRunner, resetSudoState } from "@/core/exec/runner";
import { setSudoPrompter, sudoMemory } from "@/core/exec/sudo";
import {
  fakeHostSession,
  fakeSsh,
  type ExecCall,
  type Reply,
} from "../../helpers/exec";

function setup(reply: (call: ExecCall) => Reply, saved?: string) {
  const fake = fakeSsh(reply);
  const { session } = fakeHostSession(fake);
  const open = jest.fn(async () => session);
  const runner = createRunner({
    key: "acc:1",
    hostId: 1,
    hostName: "web",
    open,
    savedSudoPassword: async () => saved,
    pool: new ExecPool(1000),
  });
  return { fake, runner, open };
}

const isRoot = (c: ExecCall) => c.command === scriptShell("root");
const needsPassword = { stderr: "sudo: a password is required", code: 1 };

afterEach(() => {
  resetSudoState();
  sudoMemory.clear();
  setSudoPrompter(null);
});

test("plain and auto runs send the script on stdin", async () => {
  const { fake, runner } = setup(() => ({ stdout: "ok" }));
  expect((await runner.run("uptime\n")).stdout).toBe("ok");
  await runner.run("id\n", { mode: "auto" });
  expect(fake.calls.map((c) => c.command)).toEqual([
    scriptShell("plain"),
    scriptShell("auto"),
  ]);
  expect(fake.calls[0].stdin).toBe("uptime\n");
});

test("a non zero exit throws with the script's own message", async () => {
  const { runner } = setup(() => ({
    stdout: "x\nSCRIPT_ERR:systemctl start failed\n",
    stderr: "noise",
    code: 1,
  }));
  await expect(runner.run("x")).rejects.toMatchObject({
    kind: "exit",
    message: "systemctl start failed",
  });
  const lenient = setup(() => ({ stdout: "partial", code: 2 }));
  expect((await lenient.runner.run("x", { allowFail: true })).code).toBe(2);
});

test("root with passwordless sudo never asks", async () => {
  const prompt = jest.fn();
  setSudoPrompter(prompt);
  const { fake, runner } = setup(() => ({ stdout: "done" }));
  expect(
    (await runner.run("systemctl restart x", { mode: "root" })).stdout,
  ).toBe("done");
  expect(fake.calls).toHaveLength(1);
  expect(isRoot(fake.calls[0])).toBe(true);
  expect(prompt).not.toHaveBeenCalled();
});

test("root uses the saved sudo password over stdin, never argv", async () => {
  const prompt = jest.fn();
  setSudoPrompter(prompt);
  const { fake, runner } = setup(
    (c) => (isRoot(c) ? needsPassword : { stdout: "done" }),
    "hunter2",
  );
  await runner.run("systemctl restart x", { mode: "root" });
  const withPw = fake.calls[1];
  expect(withPw.command).not.toContain("hunter2");
  expect(withPw.stdin.split("\n")[1]).toBe("hunter2");
  expect(withPw.stdin).not.toContain("systemctl restart x");
  expect(prompt).not.toHaveBeenCalled();
  // A saved password is not copied into memory.
  expect(sudoMemory.get("acc:1")).toBeUndefined();
});

test("asks when nothing is saved, remembers it, and asks again when wrong", async () => {
  const answers = ["wrong", "right"];
  const prompt = jest.fn(async () => answers.shift() ?? null);
  setSudoPrompter(prompt);
  const { fake, runner } = setup((c) => {
    if (isRoot(c)) return needsPassword;
    const pw = c.stdin.split("\n")[1];
    return pw === "right"
      ? { stdout: "done" }
      : { stderr: "sudo: 1 incorrect password attempt", code: 1 };
  });
  await runner.run("x", { mode: "root", reason: "Restart x" });
  expect(prompt).toHaveBeenCalledTimes(2);
  expect(prompt.mock.calls[0]).toEqual([
    { hostName: "web", reason: "Restart x", retry: false },
  ]);
  expect(prompt.mock.calls[1]).toEqual([
    expect.objectContaining({ retry: true }),
  ]);
  expect(sudoMemory.get("acc:1")).toBe("right");
  const before = fake.calls.length;
  await runner.run("y", { mode: "root" });
  expect(prompt).toHaveBeenCalledTimes(2);
  // Known to need a password: straight to it, no passwordless try.
  expect(fake.calls.length - before).toBe(1);
});

test("cancelling the prompt cancels the run, and no prompter means cancelled", async () => {
  setSudoPrompter(async () => null);
  const { runner } = setup((c) => (isRoot(c) ? needsPassword : {}));
  await expect(runner.run("x", { mode: "root" })).rejects.toMatchObject({
    kind: "cancelled",
  });
  setSudoPrompter(null);
  await expect(runner.run("x", { mode: "root" })).rejects.toMatchObject({
    kind: "cancelled",
  });
});

test("a user who may not sudo gets a clear error", async () => {
  const { runner } = setup(() => ({
    stderr: "sudo: a password is required\nbob is not in the sudoers file",
    code: 1,
  }));
  await expect(runner.run("x", { mode: "root" })).rejects.toMatchObject({
    kind: "sudo",
  });
});

test("a stale connection is reopened once", async () => {
  const fake = fakeSsh(() => ({ stdout: "ok" }));
  const broken = {
    ...fakeHostSession(fake).session,
    ssh: {
      ...fake.ssh,
      execStream: jest.fn().mockRejectedValue(new Error("closed")),
    },
  };
  const good = fakeHostSession(fake).session;
  const open = jest.fn().mockResolvedValueOnce(broken).mockResolvedValue(good);
  const runner = createRunner({
    key: "k",
    hostId: 1,
    hostName: "h",
    open,
    pool: new ExecPool(1000),
  });
  expect((await runner.run("x")).stdout).toBe("ok");
  expect(open).toHaveBeenCalledTimes(2);
});

test("a login failure keeps its own error", async () => {
  const fail = Object.assign(new Error("Permission denied"), { kind: "auth" });
  const runner = createRunner({
    key: "k",
    hostId: 1,
    hostName: "h",
    open: () => Promise.reject(fail),
    pool: new ExecPool(1000),
  });
  await expect(runner.ready()).rejects.toBe(fail);
});

test("streams use the watchdog friendly wrapper and shells get a terminal", async () => {
  const { fake, runner } = setup(() => "hang");
  const out = jest.fn();
  const handle = await runner.stream(
    "journalctl -f",
    { onStdout: out },
    { mode: "auto" },
  );
  expect(fake.calls[0].command).toContain("sudo -n true");
  expect(fake.calls[0].command).toContain("journalctl -f");
  await handle.close();
  expect(fake.calls[0].closed).toBe(true);
  const shell = await runner.shell(
    { onData: jest.fn() },
    { cols: 80, rows: 24 },
  );
  await shell.resize(100, 30);
  expect(fake.ssh.openShell).toHaveBeenCalledWith(
    { cols: 80, rows: 24 },
    expect.any(Object),
  );
});
