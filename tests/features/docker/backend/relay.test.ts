import { createRelayDockerBackend } from "@/features/docker/backend/relay";

function client() {
  const docker = {
    dockerValidate: jest.fn(async () => ({ available: true, version: "27" })),
    getDockerContainers: jest.fn(async () => [{ id: "a" }]),
    dockerContainerAction: jest.fn(async () => {}),
    getDockerContainerStats: jest.fn(async () => ({ cpu: "1%" })),
    getDockerContainerLogs: jest.fn(async () => "log"),
    getDockerStacksEnabled: jest.fn(async () => true),
    getDockerStacks: jest.fn(async () => ({
      root: "/opt/stacks",
      stacks: [{ name: "web" }],
    })),
    getDockerStack: jest.fn(async () => ({
      name: "web",
      managed: true,
      composeFile: "compose.yaml",
      compose: "services: {}",
      services: [],
      running: 0,
      total: 0,
    })),
  };
  return { c: { api: { docker } } as any, docker };
}

test("every call uses the current docker session", async () => {
  const { c, docker } = client();
  let sid = "s1";
  const host = { id: 9 } as any;
  const backend = createRelayDockerBackend(c, () => sid, host);
  await backend.containers();
  sid = "s2";
  await backend.action("a", "stop");
  await backend.logs("a", 50);
  expect(docker.getDockerContainers).toHaveBeenCalledWith("s1");
  expect(docker.dockerContainerAction).toHaveBeenCalledWith("s2", "a", "stop");
  expect(docker.getDockerContainerLogs).toHaveBeenCalledWith("s2", "a", 50);
  expect(await backend.stacks()).toEqual([{ name: "web" }]);
  expect(await backend.stack({ name: "web" } as any)).toMatchObject({
    compose: "services: {}",
  });
  expect(backend.console()).toEqual({ kind: "relay", host });
  expect(backend.via).toBe("relay");
});

test("stacks need the host switch and the admin switch", async () => {
  const { c, docker } = client();
  const off = createRelayDockerBackend(c, () => "s", { id: 1 } as any);
  expect(await off.stacksEnabled()).toBe(false);
  expect(docker.getDockerStacksEnabled).not.toHaveBeenCalled();

  const host = { id: 1, pluginSettings: { docker: { enableStacks: true } } };
  const on = createRelayDockerBackend(c, () => "s", host as any);
  expect(await on.stacksEnabled()).toBe(true);
  docker.getDockerStacksEnabled.mockResolvedValueOnce(false);
  expect(await on.stacksEnabled()).toBe(false);
});
