import { Box, Container } from "lucide-react-native";
import type { FeatureDef, SessionTabProps } from "@/core/features/types";
import { isSshHost } from "@/utils/hosts";
import { Docker } from "./Docker";
import { DockerCard } from "./DockerCard";
import { t } from "@/i18n";

function DockerTab({ session, isVisible }: SessionTabProps) {
  return <Docker host={session.host} isVisible={isVisible} />;
}

const dockerOn = (host: Parameters<typeof isSshHost>[0]) =>
  isSshHost(host) && !!host.enableDocker;

export const dockerFeature: FeatureDef = {
  id: "docker",
  plugins: ["docker"],
  title: t("docker.register.docker"),
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
      activityType: () => "docker",
      toServerTabType: () => "docker",
      component: DockerTab,
    },
  ],
  hostActions: [
    {
      id: "docker.open",
      label: t("docker.register.docker"),
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
      label: t("docker.register.docker"),
      description: t("docker.register.containersLogsAndStats"),
      icon: Box,
      order: 30,
      tabType: "docker",
      isAvailable: dockerOn,
    },
  ],
  dashboardCards: [
    {
      id: "docker",
      title: t("docker.register.docker"),
      order: 20,
      tabType: "docker",
      isAvailable: dockerOn,
      component: DockerCard,
    },
  ],
  hostToggles: [
    {
      key: "enableDocker",
      label: t("docker.register.docker"),
      group: "feature",
      order: 40,
    },
  ],
  hostBadges: [
    {
      label: "DKR",
      order: 50,
      show: (host) => !!host.enableDocker,
    },
  ],
  hostFilters: [
    {
      group: "features",
      value: "docker",
      label: t("docker.register.docker"),
      order: 40,
      matches: (host) => !!host.enableDocker,
    },
  ],
};
