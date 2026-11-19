import { Cog, ServerCog } from "lucide-react-native";
import type { FeatureDef, SessionTabProps } from "@/core/features/types";
import { isSshHost } from "@/utils/hosts";
import { Services } from "./Services";
import { ServicesCard } from "./ServicesCard";
import { t } from "@/i18n";

const servicesOn = (host: Parameters<typeof isSshHost>[0]) =>
  isSshHost(host) && !!host.enableServices;

function ServicesTab({ session, isVisible }: SessionTabProps) {
  return <Services host={session.host} isVisible={isVisible} />;
}

export const servicesFeature: FeatureDef = {
  id: "service-manager",
  plugins: ["service-manager"],
  title: t("services.register.services"),
  source: "native",
  // Over the phone's SSH, or the server's Service Manager when that is the way in.
  availableOn: ["local", "server"],
  sessionTabs: [
    {
      type: "services",
      icon: ServerCog,
      titleSuffix: () => "Services",
      shortLabel: () => "Services",
      needsOneOf: [["exec"], ["server"]],
      relayRequires: { plugin: "service-manager" },
      serverTabTypes: ["service-manager"],
      toServerTabType: () => "service-manager",
      component: ServicesTab,
    },
  ],
  hostActions: [
    {
      id: "services.open",
      label: t("services.register.services"),
      icon: Cog,
      group: "connect",
      order: 35,
      isAvailable: servicesOn,
      run: (_host, ctx) => ctx.openSession("services"),
    },
  ],
  tools: [
    {
      id: "services",
      label: t("services.register.services"),
      description: t("services.register.startStopAndReadLogs"),
      icon: Cog,
      order: 40,
      tabType: "services",
      isAvailable: servicesOn,
    },
  ],
  dashboardCards: [
    {
      id: "service-manager",
      title: t("services.register.services"),
      order: 30,
      tabType: "services",
      isAvailable: (host) => isSshHost(host) && !!host.enableServices,
      component: ServicesCard,
    },
  ],
  hostToggles: [
    {
      key: "enableServices",
      label: t("services.register.services"),
      group: "feature",
      order: 45,
    },
  ],
  hostBadges: [
    {
      label: "SVC",
      order: 55,
      show: (host) => !!host.enableServices,
    },
  ],
  hostFilters: [
    {
      group: "features",
      value: "services",
      label: t("services.register.services"),
      order: 45,
      matches: (host) => !!host.enableServices,
    },
  ],
};
