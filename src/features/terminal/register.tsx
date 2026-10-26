import { forwardRef } from "react";
import {
  Keyboard,
  Layers,
  ScrollText,
  Search,
  SquareTerminal,
  Terminal as TerminalIcon,
} from "lucide-react-native";
import type { FeatureDef, SessionTabProps } from "@/core/features/types";
import { isSshHost, toTerminalHostConfig } from "@/utils/hosts";
import { Terminal, type TerminalHandle } from "./Terminal";
import HistoryBar from "./history/HistoryBar";
import { hostTerminalEditor } from "./HostTerminalTab";
import { HostKeyRowsView } from "./keys/HostKeyRowsView";
import KeyRowBar from "./keys/KeyRowBar";
import BottomToolbar from "./keyboard/BottomToolbar";

const TerminalTab = forwardRef<TerminalHandle, SessionTabProps>(
  (
    {
      session,
      isVisible,
      onClose,
      onBackendSessionId,
      onTransportResolved,
      onBackgroundColorChange,
      onTitle,
      onMenu,
      onShortcut,
      onStatus,
      onResumeData,
    },
    ref,
  ) => (
    <Terminal
      ref={ref}
      host={session.host}
      hostConfig={toTerminalHostConfig(session.host)}
      type={session.type}
      origin={session.origin}
      onTransportResolved={onTransportResolved}
      isVisible={isVisible}
      title={session.title}
      tabInstanceId={session.instanceId}
      initialSessionId={session.restoredSessionId}
      onSessionIdChange={onBackendSessionId}
      onClose={onClose}
      onBackgroundColorChange={onBackgroundColorChange}
      onTitle={onTitle}
      onMenu={onMenu}
      onShortcut={onShortcut}
      restored={session.restored}
      resumeData={session.resumeData}
      onStatus={onStatus}
      onResumeData={onResumeData}
    />
  ),
);
TerminalTab.displayName = "TerminalTab";

export const terminalFeature: FeatureDef = {
  id: "terminal",
  plugins: ["ssh-terminal"],
  title: "Terminal",
  source: "native",
  requires: { plugin: "ssh-terminal" },
  // This device opens SSH itself through modules/termix-ssh.
  availableOn: ["local", "server"],
  sessionTabs: [
    {
      type: "terminal",
      icon: SquareTerminal,
      titleSuffix: () => "",
      shortLabel: () => "SSH",
      needs: ["shell"],
      serverTabTypes: ["terminal"],
      toServerTabType: () => "terminal",
      capabilities: ["terminal-input"],
      component: TerminalTab,
      inputChrome: { keyRow: KeyRowBar, keyPanel: BottomToolbar },
    },
  ],
  hostActions: [
    {
      id: "terminal.open",
      label: "Terminal",
      icon: TerminalIcon,
      group: "connect",
      order: 10,
      isAvailable: (host) => isSshHost(host) && host.enableTerminal !== false,
      run: (_host, ctx) => ctx.openSession("terminal"),
    },
  ],
  hostToggles: [
    {
      key: "enableTerminal",
      label: "Terminal",
      group: "feature",
      order: 10,
      defaultOn: true,
    },
  ],
  hostEditorSections: [
    {
      id: "terminal",
      label: "Terminal and keepalive",
      group: "ssh",
      order: 10,
      toggle: "enableTerminal",
      editor: hostTerminalEditor,
    },
  ],
  hostBadges: [
    {
      label: "TERM",
      order: 20,
      show: (host, ssh) => ssh && !!host.enableTerminal,
    },
  ],
  hostFilters: [
    {
      group: "features",
      value: "terminal",
      label: "Terminal",
      order: 10,
      matches: (host) => host.enableTerminal !== false,
    },
  ],
  keyboardTabs: [
    { id: "history", label: "HISTORY", order: 20, component: HistoryBar },
  ],
  sessionMenuItems: [
    {
      id: "terminal.find",
      label: "Find",
      icon: Search,
      order: 10,
      // Find needs the native terminal.
      isAvailable: ({ session, handle }) =>
        session.type === "terminal" && !!handle?.keyTarget?.(),
      run: ({ handle }) => handle?.command?.("search"),
    },
    {
      id: "terminal.tmuxWindows",
      label: "tmux windows",
      icon: Layers,
      order: 20,
      isAvailable: ({ session }) => session.type === "terminal",
      run: ({ handle }) => handle?.command?.("tmux.windows"),
    },
    {
      id: "terminal.connectionLog",
      label: "Connection log",
      icon: ScrollText,
      order: 25,
      isAvailable: ({ session }) => session.type === "terminal",
      run: ({ handle }) => handle?.command?.("connection.log"),
    },
    {
      id: "terminal.keyRows",
      label: "Key rows for this host",
      icon: Keyboard,
      order: 30,
      isAvailable: ({ session }) => session.type === "terminal",
      view: HostKeyRowsView,
    },
  ],
  capabilities: ["host.quickConnect"],
};
