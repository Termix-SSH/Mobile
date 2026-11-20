import { forwardRef } from "react";
import { Network } from "lucide-react-native";
import type { FeatureDef, SessionTabProps } from "@/core/features/types";
import { isSshHost } from "@/utils/hosts";
import { TunnelManager, type TunnelManagerHandle } from "./TunnelManager";
import { hostTunnelsEditor } from "./HostTunnelsSection";
import { TunnelsCard } from "./TunnelsCard";
import { t } from "@/i18n";

const TunnelsTab = forwardRef<TunnelManagerHandle, SessionTabProps>(
  ({ session, isVisible, onClose }, ref) => (
    <TunnelManager
      ref={ref}
      hostConfig={{
        id: parseInt(session.host.id.toString()),
        name: session.host.name,
        ip: session.host.ip,
        username: session.host.username,
        enableTunnel: session.host.enableTunnel,
        tunnelConnections: session.host.tunnelConnections,
      }}
      host={session.host}
      isVisible={isVisible}
      title={session.title}
      onClose={onClose}
    />
  ),
);
TunnelsTab.displayName = "TunnelsTab";

const tunnelsOn = (host: Parameters<typeof isSshHost>[0]) =>
  isSshHost(host) &&
  !!host.enableTunnel &&
  (host.tunnelConnections?.length ?? 0) > 0;

export const tunnelsFeature: FeatureDef = {
  id: "tunnels",
  plugins: ["tunnels"],
  title: t("tunnels.register.tunnels"),
  source: "native",
  availableOn: ["local", "server"],
  sessionTabs: [
    {
      type: "tunnel",
      icon: Network,
      titleSuffix: () => "Tunnels",
      shortLabel: () => "Tunnel",
      needsOneOf: [["forward"], ["server"]],
      relayRequires: { plugin: "tunnels" },
      serverTabTypes: ["tunnel"],
      activityType: () => "tunnel",
      toServerTabType: () => "tunnel",
      component: TunnelsTab,
    },
  ],
  hostActions: [
    {
      id: "tunnels.open",
      label: t("tunnels.register.tunnels"),
      icon: Network,
      group: "connect",
      order: 40,
      isAvailable: tunnelsOn,
      run: (_host, ctx) => ctx.openSession("tunnel"),
    },
  ],
  homeCards: [
    {
      id: "tunnels",
      title: t("tunnels.register.tunnels"),
      icon: Network,
      order: 88,
      component: TunnelsCard,
    },
  ],
  tools: [
    {
      id: "tunnels",
      label: t("tunnels.register.tunnels"),
      description: t("tunnels.register.startAndStopSavedTunnels"),
      icon: Network,
      order: 60,
      tabType: "tunnel",
      isAvailable: tunnelsOn,
    },
  ],
  hostToggles: [
    {
      key: "enableTunnel",
      label: t("tunnels.register.tunnels"),
      group: "feature",
      order: 30,
    },
  ],
  hostEditorSections: [
    {
      id: "tunnels",
      label: t("tunnels.register.tunnels"),
      group: "ssh",
      order: 20,
      toggle: "enableTunnel",
      editor: hostTunnelsEditor,
    },
  ],
  hostBadges: [
    {
      label: t("tunnels.register.tunnel"),
      order: 40,
      show: (host, ssh) => ssh && !!host.enableTunnel,
    },
  ],
  hostFilters: [
    {
      group: "features",
      value: "tunnel",
      label: t("tunnels.register.tunnel2"),
      order: 30,
      matches: (host) => !!host.enableTunnel,
    },
  ],
};
