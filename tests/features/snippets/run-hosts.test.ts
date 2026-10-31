import {
  runOnHost,
  runOnHosts,
  type RunBackend,
} from "@/features/snippets/run-hosts";
import type { Snippet, SSHHost } from "@/types";

const snippet = {
  id: 1,
  name: "disk",
  content: "df -h $HOST ${INPUT_1:Path}",
} as Snippet;

const host = (id: number, ip = `10.0.0.${id}`) =>
  ({ id, ip, name: `h${id}`, username: "root", port: 22 }) as SSHHost;

function backend(over: Partial<RunBackend> = {}) {
  const calls: string[] = [];
  const b: RunBackend = {
    attempts: async () => ["phone"],
    phone: async (h, command) => {
      calls.push(`${h.id}:${command}`);
      return { stdout: "ok", stderr: "", exitCode: 0 };
    },
    server: async (h) => {
      calls.push(`server:${h.id}`);
      return { success: true, output: "from server" };
    },
    ...over,
  };
  return { b, calls };
}

test("the phone runs the resolved command", async () => {
  const { b, calls } = backend();
  const res = await runOnHost(b, snippet, host(1), { INPUT_1: "/var" });
  expect(calls).toEqual(["1:df -h 10.0.0.1 /var"]);
  expect(res).toMatchObject({ ok: true, via: "phone", output: "ok" });
});

test("a non zero exit is a failure with the error text", async () => {
  const { b } = backend({
    phone: async () => ({ stdout: "", stderr: "boom", exitCode: 2 }),
  });
  expect(await runOnHost(b, snippet, host(1))).toMatchObject({
    ok: false,
    error: "boom",
  });
  const quiet = backend({
    phone: async () => ({ stdout: "", stderr: "", exitCode: 3 }),
  });
  expect((await runOnHost(quiet.b, snippet, host(1))).error).toBe(
    "Exited with 3",
  );
});

test("a missing exit code counts as success", async () => {
  const { b } = backend({
    phone: async () => ({ stdout: "x", stderr: "", exitCode: null }),
  });
  expect((await runOnHost(b, snippet, host(1))).ok).toBe(true);
});

test("the server runs it when that is the way", async () => {
  const { b, calls } = backend({ attempts: async () => ["server"] });
  const res = await runOnHost(b, snippet, host(2));
  expect(calls).toEqual(["server:2"]);
  expect(res).toMatchObject({ ok: true, via: "server", output: "from server" });
});

test("the server's failure is reported", async () => {
  const { b } = backend({
    attempts: async () => ["server"],
    server: async () => ({ success: false, output: "", error: "denied" }),
  });
  expect(await runOnHost(b, snippet, host(2))).toMatchObject({
    ok: false,
    error: "denied",
  });
});

test("a later way is tried when the first cannot reach the host", async () => {
  const { b, calls } = backend({
    attempts: async () => ["phone", "server"],
    phone: async () => {
      throw new Error("timed out");
    },
  });
  const res = await runOnHost(b, snippet, host(3));
  expect(calls).toEqual(["server:3"]);
  expect(res.via).toBe("server");
});

test("when every way fails the last error is kept", async () => {
  const { b } = backend({
    attempts: async () => ["phone", "server"],
    phone: async () => {
      throw new Error("first");
    },
    server: async () => {
      throw new Error("second");
    },
  });
  expect(await runOnHost(b, snippet, host(3))).toMatchObject({
    ok: false,
    error: "second",
  });
});

test("a host with no way in says so, and a blocked plan passes its reason", async () => {
  const none = backend({ attempts: async () => [] });
  expect((await runOnHost(none.b, snippet, host(1))).error).toContain(
    "No way to reach",
  );
  const blocked = backend({
    attempts: async () => {
      throw new Error("No SSH engine");
    },
  });
  expect((await runOnHost(blocked.b, snippet, host(1))).error).toBe(
    "No SSH engine",
  );
});

test("many hosts run a few at a time and results keep host order", async () => {
  let active = 0;
  let peak = 0;
  const { b } = backend({
    phone: async (h) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, h.id === 1 ? 20 : 1));
      active--;
      return { stdout: String(h.id), stderr: "", exitCode: 0 };
    },
  });
  const seen: number[] = [];
  const results = await runOnHosts(
    b,
    snippet,
    [1, 2, 3, 4, 5].map((id) => host(id)),
    { concurrency: 2, onResult: (r) => seen.push(r.host.id) },
  );
  expect(peak).toBeLessThanOrEqual(2);
  expect(results.map((r) => r.host.id).sort()).toEqual([1, 2, 3, 4, 5]);
  expect(seen).toHaveLength(5);
});

test("an aborted run stops starting new hosts", async () => {
  const controller = new AbortController();
  const { b } = backend({
    phone: async (h) => {
      if (h.id === 1) controller.abort();
      return { stdout: "", stderr: "", exitCode: 0 };
    },
  });
  const results = await runOnHosts(
    b,
    snippet,
    [1, 2, 3].map((id) => host(id)),
    { concurrency: 1, signal: controller.signal },
  );
  expect(results).toHaveLength(1);
});

test("no hosts gives no results", async () => {
  expect(await runOnHosts(backend().b, snippet, [])).toEqual([]);
});
