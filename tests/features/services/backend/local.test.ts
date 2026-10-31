import { utf8Encode } from "@termix-ssh/plugin-sdk/host-scripts";
import type { ExecRunner, RunOptions, StreamHandlers } from "@/core/exec";
import {
  LineBuffer,
  createLocalServicesBackend,
} from "@/features/services/backend/local";

function fakeRunner(
  init: "systemd" | "openrc",
  reply: (s: string) => string = () => "",
) {
  const runs: { script: string; options: RunOptions }[] = [];
  let handlers: StreamHandlers | null = null;
  const streams: string[] = [];
  const close = jest.fn(async () => {});
  const runner = {
    hostId: 1,
    ready: jest.fn(),
    run: jest.fn(async (script: string, options: RunOptions = {}) => {
      runs.push({ script, options });
      const stdout = script.includes("INIT=none")
        ? `init=${init}\nversion=257\nuid=1000\njournal=1\nfailed=1\n`
        : reply(script);
      return { stdout, stderr: "", code: 0, truncated: false };
    }),
    stream: jest.fn(async (script: string, h: StreamHandlers) => {
      streams.push(script);
      handlers = h;
      return { write: jest.fn(), close };
    }),
    shell: jest.fn(),
    release: jest.fn(),
  } as unknown as ExecRunner;
  return {
    runner,
    runs,
    streams,
    close,
    emit: (t: string) => handlers?.onStdout(utf8Encode(t)),
    exit: () => handlers?.onExit?.(0),
  };
}

test("detects the init system as root when it can, without asking", async () => {
  const { runner, runs } = fakeRunner("systemd");
  const backend = createLocalServicesBackend(runner);
  expect(await backend.status()).toMatchObject({
    init: "systemd",
    failed: 1,
    journal: true,
  });
  expect(runs[0].options.mode).toBe("auto");
});

test("lists systemd units and reads one", async () => {
  const { runner, runs } = fakeRunner("systemd", (s) =>
    s.includes("list-units")
      ? "cron.service loaded active running Cron\n@@TERMIX_FILES@@\ncron.service enabled enabled\n"
      : "Id=cron.service\nActiveState=active\n@@TERMIX_STATUS@@\n● cron.service\n",
  );
  const backend = createLocalServicesBackend(runner);
  const units = await backend.units("service");
  expect(units[0]).toMatchObject({
    name: "cron.service",
    active: "active",
    fileState: "enabled",
  });
  expect((await backend.unit("cron.service")).props.ActiveState).toBe("active");
  expect(runs.every((r) => r.options.mode === "auto")).toBe(true);
  await expect(backend.unit("bad;name.service")).rejects.toThrow();
});

test("actions run as root and say what they are for", async () => {
  const { runner, runs } = fakeRunner("systemd", (s) =>
    s.includes("systemctl restart") ? "state=active\n" : "",
  );
  const backend = createLocalServicesBackend(runner);
  expect(await backend.action("nginx.service", "restart")).toBe("active");
  const last = runs[runs.length - 1];
  expect(last.options).toMatchObject({
    mode: "root",
    reason: "Restart nginx.service",
  });
  expect(last.script).toContain("systemctl restart -- 'nginx.service'");
});

test("OpenRC hosts use rc-service", async () => {
  const { runner, runs } = fakeRunner("openrc", (s) =>
    s.includes("rc-status")
      ? " sshd [ started ]\n@@TERMIX_RUNLEVELS@@\n sshd | default\n"
      : s.includes("rc-service 'sshd' restart")
        ? "state=active\n"
        : "status: started",
  );
  const backend = createLocalServicesBackend(runner);
  expect((await backend.units("service"))[0]).toMatchObject({
    name: "sshd",
    active: "active",
  });
  expect(await backend.action("sshd", "restart")).toBe("active");
  expect((await backend.unit("sshd")).status).toBe("status: started");
  const work = runs.filter((r) => !r.script.includes("INIT=none"));
  expect(work.some((r) => r.script.includes("systemctl"))).toBe(false);
});

test("the journal reads JSON lines with quoted filters", async () => {
  const line = JSON.stringify({
    __REALTIME_TIMESTAMP: "1000000",
    MESSAGE: "hi",
    PRIORITY: "3",
  });
  const { runner, runs } = fakeRunner("systemd", () => `${line}\n`);
  const backend = createLocalServicesBackend(runner);
  const entries = await backend.journal({
    units: ["nginx.service"],
    priority: 3,
    lines: 50,
  });
  expect(entries).toEqual([
    expect.objectContaining({ message: "hi", priority: 3, time: 1000 }),
  ]);
  expect(runs[0].script).toContain("-u 'nginx.service'");
  expect(runs[0].script).toContain("-p 3");
  await expect(
    backend.journal({ units: ["$(id)"], lines: 5 }),
  ).rejects.toThrow();
});

test("follow streams whole entries and stops on demand", async () => {
  const fake = fakeRunner("systemd");
  const backend = createLocalServicesBackend(fake.runner);
  const got: string[] = [];
  const onEnd = jest.fn();
  const follow = backend.follow(
    { units: [] },
    (e) => got.push(...e.map((x) => x.message)),
    onEnd,
  );
  await new Promise((r) => setTimeout(r, 0));
  expect(fake.streams[0]).toContain("journalctl");
  expect(fake.streams[0]).toContain("-f");
  expect(fake.streams[0]).toContain("cat >/dev/null");
  const a = JSON.stringify({ MESSAGE: "one" });
  const b = JSON.stringify({ MESSAGE: "two" });
  fake.emit(`${a}\n${b.slice(0, 5)}`);
  fake.emit(`${b.slice(5)}\n`);
  expect(got).toEqual(["one", "two"]);
  follow.stop();
  expect(fake.close).toHaveBeenCalled();
  fake.exit();
  expect(onEnd).not.toHaveBeenCalled();
});

test("the line buffer keeps a cut line", () => {
  const buf = new LineBuffer();
  expect(buf.push("a\nb")).toEqual(["a"]);
  expect(buf.push("c\n")).toEqual(["bc"]);
});
