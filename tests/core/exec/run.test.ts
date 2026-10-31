import { execOnce } from "@/core/exec/run";
import { ExecError } from "@/core/exec/types";
import { fakeSsh } from "../../helpers/exec";

test("sends stdin, closes it and collects the output", async () => {
  const fake = fakeSsh((call) => ({
    stdout: `got:${call.stdin}`,
    stderr: "warn",
    code: 3,
  }));
  const result = await execOnce(fake.ssh as never, "bash -s", "echo hi\n");
  expect(fake.calls[0].command).toBe("bash -s");
  expect(result).toEqual({
    stdout: "got:echo hi\n",
    stderr: "warn",
    code: 3,
    truncated: false,
  });
});

test("decodes UTF-8 and caps big output", async () => {
  const fake = fakeSsh(() => ({ stdout: "héllo wörld" }));
  expect((await execOnce(fake.ssh as never, "x", "")).stdout).toBe(
    "héllo wörld",
  );
  const big = fakeSsh(() => ({ stdout: "abcdefghij" }));
  const capped = await execOnce(big.ssh as never, "x", "", { maxBytes: 4 });
  expect(capped).toMatchObject({ stdout: "abcd", truncated: true });
});

test("a timeout closes the channel and says so", async () => {
  jest.useFakeTimers();
  try {
    const fake = fakeSsh(() => "hang");
    const running = execOnce(fake.ssh as never, "x", "", { timeoutMs: 1000 });
    await Promise.resolve();
    jest.advanceTimersByTime(1000);
    await expect(running).rejects.toMatchObject({ kind: "timeout" });
    await Promise.resolve();
    expect(fake.calls[0].closed).toBe(true);
  } finally {
    jest.useRealTimers();
  }
});

test("an abort cancels the run", async () => {
  const fake = fakeSsh(() => "hang");
  const controller = new AbortController();
  const running = execOnce(fake.ssh as never, "x", "", {
    signal: controller.signal,
  });
  await new Promise((r) => setTimeout(r, 0));
  controller.abort();
  await expect(running).rejects.toMatchObject({ kind: "cancelled" });
  expect(fake.calls[0].closed).toBe(true);

  const pre = new AbortController();
  pre.abort();
  await expect(
    execOnce(fake.ssh as never, "x", "", { signal: pre.signal }),
  ).rejects.toBeInstanceOf(ExecError);
});

test("a channel that can't open is a network error", async () => {
  const ssh = {
    execStream: jest.fn().mockRejectedValue(new Error("session closed")),
  };
  await expect(execOnce(ssh as never, "x", "")).rejects.toMatchObject({
    kind: "network",
    message: "session closed",
  });
});
