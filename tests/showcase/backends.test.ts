import type { ExecRunner } from "@/core/exec";
import {
  showcaseDocker,
  showcaseFiles,
  showcaseMetricsSample,
} from "@/showcase/backends";

test("metrics look like a busy server", () => {
  const { metrics, point } = showcaseMetricsSample(1, 0);
  expect(metrics.cpu.cores).toBe(16);
  expect(metrics.cpu.percent).toBeGreaterThan(0);
  expect(point.cpu).toBe(metrics.cpu.percent);
});

test("docker lists containers", async () => {
  const docker = showcaseDocker({} as ExecRunner);
  expect((await docker.check()).available).toBe(true);
  const list = await docker.containers();
  expect(list.some((c) => c.state === "exited")).toBe(true);
  expect((await docker.counts()).total).toBe(list.length);
});

test("files have a home folder with a compose file", async () => {
  const files = showcaseFiles();
  const home = await files.home();
  const { files: entries } = await files.list(home);
  const compose = entries.find((e) => e.name === "compose.yml");
  expect(compose?.type).toBe("file");
  expect((await files.readText(compose!.path, 1e6)).text).toContain(
    "services:",
  );
  expect((await files.list(`${home}/stacks`)).files).toHaveLength(3);
});
