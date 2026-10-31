import { Box, Container } from "lucide-react-native";
import type { FeatureDef, SessionTabProps } from "@/core/features/types";
import { isSshHost } from "@/utils/hosts";
import { Docker } from "./Docker";
import { DockerCard } from "./DockerCard";

function DockerTab({ session, isVisible }: SessionTabProps) {
  return <Docker host={session.host} isVisible={isVisible} />;
}

const dockerOn = (host: Parameters<typeof isSshHost>[0]) =>
  isSshHost(host) && !!host.enableDocker;

export const dockerFeature: FeatureDef = {
  id: "docker",
  plugins: ["docker"],
  title: "Docker",
  source: "native",
  // Runs over the phone's SSH, or the server's Docker plugin when that is the way in.
  availableOn: ["local", "server"],
  sessionTabs: [
    {
      type: "docker",
      icon: Container,
      titleSuffix: () => "Docker",
      shortLabel: () => "Docker",
      needsOneOf: [["exec"], ["server"]],
      relayRequires: { plugin: "docker" },
      serverTabTypes: ["docker"],
      toServerTabType: () => "docker",
      component: DockerTab,
    },
  ],
  hostActions: [
    {
      id: "docker.open",
      label: "Docker",
      icon: Box,
      group: "connect",
      order: 30,
      isAvailable: dockerOn,
      run: (_host, ctx) => ctx.openSession("docker"),
    },
  ],
  tools: [
    {
      id: "docker",
      label: "Docker",
      description: "Containers, logs and stats",
      icon: Box,
      order: 30,
      tabType: "docker",
      isAvailable: dockerOn,
    },
  ],
  dashboardCards: [
    {
      id: "docker",
      title: "Docker",
      order: 20,
      tabType: "docker",
      isAvailable: dockerOn,
      component: DockerCard,
    },
  ],
  hostToggles: [
    { key: "enableDocker", label: "Docker", group: "feature", order: 40 },
  ],
  hostBadges: [
    { label: "DKR", order: 50, show: (host) => !!host.enableDocker },
  ],
  hostFilters: [
    {
      group: "features",
      value: "docker",
      label: "Docker",
      order: 40,
      matches: (host) => !!host.enableDocker,
    },
  ],
};
