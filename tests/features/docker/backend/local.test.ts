import type { ExecRunner, RunOptions } from "@/core/exec";
import {
  createLocalDockerBackend,
  detectScript,
  parseDetect,
} from "@/features/docker/backend/local";
import { execLine } from "@/features/docker/consoleLink";

function fakeRunner(reply: (script: string, o: RunOptions) => string) {
  const runs: { script: string; options: RunOptions }[] = [];
  const runner = {
    hostId: 1,
    ready: jest.fn(),
    run: jest.fn(async (script: string, options: RunOptions = {}) => {
      runs.push({ script, options });
      return {
        stdout: reply(script, options),
        stderr: "",
        code: 0,
        truncated: false,
      };
    }),
    stream: jest.fn(),
    shell: jest.fn(),
    release: jest.fn(),
  } as unknown as ExecRunner;
  return { runner, runs };
}

test("detection tries the preferred runtime first", () => {
  expect(detectScript("podman")).toContain("for r in podman docker");
  expect(detectScript("docker")).toContain("for r in docker podman");
});

test("reads what detection prints", () => {
  expect(
    parseDetect(
      "runtime=docker\nversion=Docker version 27.3.1, build x\nok=1\n",
    ),
  ).toEqual({
    available: true,
    version: "27.3.1",
    runtime: "docker",
  });
  expect(parseDetect("runtime=none\n")).toMatchObject({
    available: false,
    code: "NOT_INSTALLED",
  });
  expect(
    parseDetect(
      "runtime=docker\nversion=Docker version 27\nerror=permission denied while trying to connect to the Docker daemon socket\n",
    ),
  ).toMatchObject({ available: false, code: "PERMISSION_DENIED" });
});

test("lists containers and switches to the runtime it found", async () => {
  const { runner, runs } = fakeRunner((script) =>
    script.includes("for r in")
      ? "runtime=podman\nversion=podman version 5.2.0\nok=1\n"
      : '{"id":"a1","name":"web","image":"nginx","status":"Up","state":"running"}\n',
  );
  const backend = createLocalDockerBackend(runner);
  expect(await backend.check()).toMatchObject({ runtime: "podman" });
  const list = await backend.containers();
  expect(list[0]).toMatchObject({ id: "a1", name: "web" });
  expect(runs[1].script).toContain(" podman ps -a --format");
  expect(runs[1].options.mode).toBe("plain");
});

test("actions, logs and stats build safe commands", async () => {
  const { runner, runs } = fakeRunner((script) =>
    script.includes("stats")
      ? '{"cpu":"1%","memory":"1MiB / 2GiB","memoryPercent":"0.1%","netIO":"0B / 0B","blockIO":"0B / 0B","pids":"2"}'
      : "",
  );
  const backend = createLocalDockerBackend(runner);
  await backend.action("web", "restart");
  await backend.action("web", "remove");
  await backend.logs("web", 300);
  expect((await backend.stats("web")).memoryLimit).toBe("2GiB");
  expect(runs.map((r) => r.script.trim().split(" docker ")[1])).toEqual([
    "restart web",
    "rm -f web",
    "logs web --tail 300 2>&1",
    expect.stringContaining("stats web --no-stream"),
  ]);
  await expect(backend.action("web;id", "start")).rejects.toThrow();
  expect(runs).toHaveLength(4);
});

test("sudo runs everything as root", async () => {
  const { runner, runs } = fakeRunner(() => "");
  const backend = createLocalDockerBackend(runner, { sudo: true });
  await backend.containers();
  expect(runs[0].options.mode).toBe("root");
  expect(backend.console()).toMatchObject({ kind: "local", sudo: true });
});

test("stacks come from compose ls and a stack reads its compose file", async () => {
  const { runner, runs } = fakeRunner((script) => {
    if (script.includes("compose ls")) {
      return JSON.stringify([
        {
          Name: "web",
          Status: "running(1)",
          ConfigFiles: "/opt/stacks/web/compose.yaml",
        },
      ]);
    }
    if (script.includes("compose -p web ps")) {
      return JSON.stringify({
        Service: "app",
        Name: "web-app-1",
        State: "running",
      });
    }
    if (script.startsWith("head -c")) return "services:\n  app:\n";
    return "";
  });
  const backend = createLocalDockerBackend(runner);
  const [stack] = await backend.stacks();
  const detail = await backend.stack(stack);
  expect(detail).toMatchObject({
    compose: "services:\n  app:\n",
    running: 1,
    total: 1,
  });
  expect(runs[2].script).toContain("'/opt/stacks/web/compose.yaml'");
  await expect(backend.stack({ ...stack, name: "bad name" })).rejects.toThrow();
});

test("the console line checks the id and can use sudo", () => {
  expect(execLine("docker", "web", false)).toMatch(
    /^clear; exec PATH=".*" docker exec -it web sh -c/,
  );
  expect(execLine("podman", "web", true)).toMatch(
    /^clear; exec sudo podman exec -it web /,
  );
  expect(() => execLine("docker", "$(id)", false)).toThrow();
});

test("stacks follow the host switch", async () => {
  const { runner } = fakeRunner(() => "");
  expect(await createLocalDockerBackend(runner).stacksEnabled()).toBe(false);
  expect(
    await createLocalDockerBackend(runner, { stacks: true }).stacksEnabled(),
  ).toBe(true);
});
