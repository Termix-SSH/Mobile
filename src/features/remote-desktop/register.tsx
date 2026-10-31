import {
  MessagesSquare,
  Monitor,
  MousePointerClick,
} from "lucide-react-native";
import { forwardRef, useMemo } from "react";
import { checkOpen } from "@/core/features/open-check";
import type {
  FeatureDef,
  FeatureIcon,
  HostActionDef,
  SessionTabProps,
} from "@/core/features/types";
import { Terminal, type TerminalHandle } from "@/features/terminal/Terminal";
import KeyRowBar from "@/features/terminal/keys/KeyRowBar";
import BottomToolbar from "@/features/terminal/keyboard/BottomToolbar";
import { displayProtocols } from "@/modules/termix-ssh";
import { ConnectionError } from "@/screens/sessions/shared/ConnectionError";
import type { SSHHost } from "@/types";
import { isSshHost, toTerminalHostConfig } from "@/utils/hosts";
import { NativeRemoteDesktop } from "./native/NativeRemoteDesktop";
import { useRemoteRoute } from "./route";
import { RemoteDesktop, type RemoteDesktopProtocol } from "./RemoteDesktop";
import { REMOTE_DESKTOP_TAB, TELNET_TAB, telnetTabFor } from "./telnet";
import { protocolSection } from "./host-sections";

const PLUGIN = "remote-desktop";
const PROTOCOLS: RemoteDesktopProtocol[] = ["rdp", "vnc", "telnet"];

function asProtocol(value?: string): RemoteDesktopProtocol {
  return PROTOCOLS.includes(value as RemoteDesktopProtocol)
    ? (value as RemoteDesktopProtocol)
    : "rdp";
}

/** Opens on the phone when it can dial the protocol, else through the server. */
function RemoteDesktopTab({
  session,
  isVisible,
  onClose,
  onStatus,
}: SessionTabProps) {
  const protocol = asProtocol(session.remoteProtocol);
  const native = useMemo(() => displayProtocols(), []);
  const { route, switchTo } = useRemoteRoute(
    session.host,
    protocol,
    native,
    session.origin,
  );
  switch (route.via) {
    case "checking":
      return null;
    case "blocked":
      return (
        <ConnectionError
          failure={{ stage: "unavailable", message: route.reason, hint: "" }}
          switchTo={route.fix}
          onSwitch={(o) => switchTo(o, true)}
          onClose={onClose}
        />
      );
    case "server":
      return (
        <RemoteDesktop
          host={route.host}
          isVisible={isVisible}
          title={session.title}
          protocol={protocol}
          onClose={onClose}
          onStatus={onStatus}
        />
      );
    case "device":
      // A server Telnet tab reopened on a phone that can dial it.
      if (protocol === "telnet") {
        return (
          <Terminal
            host={session.host}
            hostConfig={toTerminalHostConfig(session.host)}
            type={TELNET_TAB}
            protocol="telnet"
            isVisible={isVisible}
            title={session.title}
            onClose={onClose}
            onStatus={onStatus}
          />
        );
      }
      return (
        <NativeRemoteDesktop
          host={session.host}
          protocol={protocol}
          transport={route.transport}
          isVisible={isVisible}
          title={session.title}
          onStatus={onStatus}
          onUseServer={route.serverToo ? () => switchTo("server") : undefined}
        />
      );
  }
}

/** Telnet the phone opens itself, in the native terminal. */
const TelnetTab = forwardRef<TerminalHandle, SessionTabProps>(
  (
    {
      session,
      isVisible,
      onClose,
      onTransportResolved,
      onBackgroundColorChange,
      onTitle,
      onMenu,
      onShortcut,
      onStatus,
    },
    ref,
  ) => (
    <Terminal
      ref={ref}
      host={session.host}
      hostConfig={toTerminalHostConfig(session.host)}
      type={session.type}
      origin={session.origin}
      protocol="telnet"
      onTransportResolved={onTransportResolved}
      isVisible={isVisible}
      title={session.title}
      tabInstanceId={session.instanceId}
      onClose={onClose}
      onBackgroundColorChange={onBackgroundColorChange}
      onTitle={onTitle}
      onMenu={onMenu}
      onShortcut={onShortcut}
      restored={session.restored}
      onStatus={onStatus}
    />
  ),
);
TelnetTab.displayName = "TelnetTab";

/**
 * The tab RDP and VNC open, and Telnet through the server. The phone dials RDP
 * and VNC itself, so it works with no server and on servers without the plugin.
 */
export const remoteDesktopFeature: FeatureDef = {
  id: "remote-desktop",
  plugins: ["remote-desktop"],
  title: "Remote Desktop",
  source: "native",
  availableOn: ["local", "server"],
  sessionTabs: [
    {
      type: REMOTE_DESKTOP_TAB,
      icon: Monitor,
      titleSuffix: (s) =>
        s.remoteProtocol ? s.remoteProtocol.toUpperCase() : "Remote",
      shortLabel: (s) => SHORT[asProtocol(s.remoteProtocol)],
      needsOneOf: [["tcp"], ["guacd"]],
      dialsDirectly: true,
      relayRequires: { plugin: PLUGIN },
      serverTabTypes: PROTOCOLS,
      toServerTabType: (s) => asProtocol(s.remoteProtocol),
      fromServerTabType: (tabType) => ({ remoteProtocol: tabType }),
      capabilities: ["own-keyboard"],
      component: RemoteDesktopTab,
    },
  ],
};

const SHORT: Record<RemoteDesktopProtocol, string> = {
  rdp: "RDP",
  vnc: "VNC",
  telnet: "Telnet",
};

function protocolFeature(
  protocol: RemoteDesktopProtocol,
  opts: {
    label: string;
    badge: string;
    description?: string;
    icon: FeatureIcon;
    order: number;
    enabled: (host: SSHHost) => boolean;
    toggleKey: string;
    run?: HostActionDef["run"];
    extra?: Partial<FeatureDef>;
  },
): FeatureDef {
  return {
    id: `remote-desktop.${protocol}`,
    plugins: [PLUGIN],
    title: opts.label,
    source: "native",
    requires: { plugin: PLUGIN, protocol },
    hostActions: [
      {
        id: `remote-desktop.${protocol}.open`,
        label: opts.label,
        icon: opts.icon,
        group: "connect",
        order: 60 + opts.order,
        isAvailable: opts.enabled,
        run:
          opts.run ??
          ((_host, ctx) =>
            ctx.openSession(REMOTE_DESKTOP_TAB, { remoteProtocol: protocol })),
      },
    ],
    hostToggles: [
      {
        key: opts.toggleKey,
        label: opts.label,
        description: opts.description,
        group: "protocol",
        order: 10 + opts.order,
      },
    ],
    hostEditorSections: [protocolSection(protocol)],
    hostBadges: [
      {
        label: opts.badge,
        order: 10 + opts.order,
        show: opts.enabled,
      },
    ],
    hostFilters: [
      {
        group: "protocol",
        value: protocol,
        label: opts.label,
        order: 10 + opts.order,
        matches: opts.enabled,
      },
    ],
    ...opts.extra,
  };
}

// The phone dials these itself, so they need no server plugin.
const PHONE_TOO: Partial<FeatureDef> = {
  requires: undefined,
  availableOn: ["local", "server"],
};

export const rdpFeature = protocolFeature("rdp", {
  label: "RDP",
  badge: "RDP",
  description: "Remote Desktop",
  icon: Monitor,
  order: 0,
  enabled: (host) => !!host.enableRdp,
  toggleKey: "enableRdp",
  extra: PHONE_TOO,
});

export const vncFeature = protocolFeature("vnc", {
  label: "VNC",
  badge: "VNC",
  icon: MousePointerClick,
  order: 1,
  enabled: (host) => !!host.enableVnc,
  toggleKey: "enableVnc",
  extra: PHONE_TOO,
});

// The phone dials Telnet itself, so it works with no server and on servers
// without the remote desktop plugin. Through a server it uses that plugin.
export const telnetFeature = protocolFeature("telnet", {
  label: "Telnet",
  badge: "TEL",
  icon: MessagesSquare,
  order: 2,
  enabled: (host) => !!host.enableTelnet,
  toggleKey: "enableTelnet",
  run: async (host, ctx) => {
    const check = await checkOpen(
      ctx.account.id,
      host,
      isSshHost(host),
      TELNET_TAB,
    );
    const tab = telnetTabFor(check);
    await ctx.openSession(
      tab,
      tab === TELNET_TAB ? undefined : { remoteProtocol: "telnet" },
    );
  },
  extra: {
    ...PHONE_TOO,
    sessionTabs: [
      {
        type: TELNET_TAB,
        icon: MessagesSquare,
        titleSuffix: () => "Telnet",
        shortLabel: () => "Telnet",
        needsOneOf: [["tcp"]],
        dialsDirectly: true,
        // Server tab records named telnet still reopen in the server's view.
        serverTabTypes: [],
        toServerTabType: () => "telnet",
        capabilities: ["terminal-input"],
        component: TelnetTab,
        inputChrome: { keyRow: KeyRowBar, keyPanel: BottomToolbar },
      },
    ],
  },
});
