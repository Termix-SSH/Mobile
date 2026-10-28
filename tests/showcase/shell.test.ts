import type { ShellOptions } from "@/core/transport/types";
import { latestShell, setFirstCommand, ShowcaseShell } from "@/showcase/shell";
import { runCommand } from "@/showcase/shell-output";

const strip = (s: string) => s.replace(/\x1b\[[0-9;]*[mJH]/g, "");

function shell() {
  const data: string[] = [];
  const states: string[] = [];
  const options = {
    hostConfig: {
      id: 1,
      name: "web-01",
      ip: "10.0.0.1",
      port: 22,
      username: "admin",
      authType: "password",
    },
    onData: (d: string) => data.push(d),
    onStateChange: (s: string) => states.push(s),
    onPostConnectionSetup: jest.fn(),
  } as unknown as ShellOptions;
  return { sh: new ShowcaseShell(options), data, states };
}

afterEach(() => setFirstCommand("fastfetch"));

test("connects with a banner, the first command and a prompt", async () => {
  const { sh, data, states } = shell();
  await sh.connect();
  expect(states).toEqual(["connecting", "connected", "dataReceived"]);
  const out = strip(data.join(""));
  expect(out).toContain("Linux web-01");
  expect(out).toContain("Debian 13");
  expect(out.endsWith("admin@web-01:~$ ")).toBe(true);
  expect(latestShell()).toBe(sh);
  sh.destroy();
  expect(latestShell()).not.toBe(sh);
});

test("echoes keys and answers known commands", async () => {
  setFirstCommand(null);
  const { sh, data } = shell();
  await sh.connect();
  data.length = 0;
  sh.sendInput("docker ps\r");
  const out = strip(data.join(""));
  expect(out).toContain("docker ps");
  expect(out).toContain("postgres");
  data.length = 0;
  sh.sendInput("nope\r");
  expect(strip(data.join(""))).toContain("nope: command not found");
  sh.destroy();
});

test("canned output fits a phone", () => {
  for (const cmd of [
    "fastfetch",
    "docker ps",
    "git log",
    "ls",
    "df -h",
    "systemctl status nginx",
  ]) {
    const out = runCommand(cmd, "admin", "web-01") ?? "";
    for (const line of strip(out).split("\r\n")) {
      expect(Array.from(line).length).toBeLessThanOrEqual(44);
    }
  }
});
