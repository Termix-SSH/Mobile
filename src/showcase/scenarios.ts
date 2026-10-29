import { router } from "expo-router";
import type { SessionType } from "@/contexts/TerminalSessionsContext";
import { openTab } from "@/screens/shell/navigate";
import type { SSHHost } from "@/types";
import { DOCKER_HOST, MAIN_HOST, SECOND_HOST } from "./seed";
import { setFirstCommand, waitForShell } from "./shell";
import { requestSplit } from "./split";

/** What a scenario can do with the app. */
export interface ShowcaseControl {
  host(name: string): SSHHost;
  open(host: SSHHost, type: SessionType): Promise<void>;
  /** Ids of the open tabs, oldest first. */
  sessionIds(): string[];
  activate(sessionId: string): void;
  wait(ms: number): Promise<void>;
  /** A point in the video a caption starts at. */
  mark(name: string): void;
}

export interface Scenario {
  id: string;
  /** Puts the app in the state the screenshot shows. */
  setup(ctl: ShowcaseControl): Promise<void>;
}

const FILES = "filemanager";

async function terminal(ctl: ShowcaseControl, name = MAIN_HOST) {
  await ctl.open(ctl.host(name), "terminal");
}

export const SCENARIOS: Scenario[] = [
  {
    id: "hosts",
    setup: async () => openTab("/(tabs)/hosts"),
  },
  {
    id: "home",
    setup: async () => openTab("/(tabs)/home"),
  },
  {
    id: "terminal",
    setup: async (ctl) => terminal(ctl),
  },
  {
    id: "split",
    async setup(ctl) {
      setFirstCommand("docker ps");
      await terminal(ctl, DOCKER_HOST);
      setFirstCommand("fastfetch");
      await terminal(ctl);
      const [first] = ctl.sessionIds();
      await ctl.wait(400);
      requestSplit(first ?? null);
    },
  },
  {
    id: "files",
    setup: async (ctl) => ctl.open(ctl.host(DOCKER_HOST), FILES),
  },
  {
    id: "metrics",
    setup: async (ctl) => ctl.open(ctl.host(MAIN_HOST), "stats"),
  },
  {
    id: "docker",
    setup: async (ctl) => ctl.open(ctl.host(DOCKER_HOST), "docker"),
  },
  {
    id: "snippets",
    setup: async () => {
      router.push("/tabs/settings/Snippets" as never);
    },
  },
  {
    id: "tools",
    setup: async () => openTab("/(tabs)/tools"),
  },
];

/** The App Preview: about 25 seconds through the main screens. */
export async function tour(ctl: ShowcaseControl): Promise<void> {
  openTab("/(tabs)/hosts");
  ctl.mark("hosts");
  await ctl.wait(3500);

  setFirstCommand(null);
  ctl.mark("terminal");
  await terminal(ctl);
  const shell = await waitForShell();
  await ctl.wait(1200);
  await shell?.type("fastfetch");
  await ctl.wait(1800);
  await shell?.type("docker ps");
  await ctl.wait(2200);

  ctl.mark("files");
  await ctl.open(ctl.host(DOCKER_HOST), FILES);
  await ctl.wait(4000);

  ctl.mark("metrics");
  await ctl.open(ctl.host(SECOND_HOST), "stats");
  await ctl.wait(4500);

  ctl.mark("docker");
  await ctl.open(ctl.host(DOCKER_HOST), "docker");
  await ctl.wait(4000);
}

export function findScenario(id: string): Scenario | null {
  return SCENARIOS.find((s) => s.id === id) ?? null;
}
