import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BackHandler, View } from "react-native";
import { CloudOff } from "lucide-react-native";
import { useActiveClient } from "@/core/accounts";
import type { SessionTabProps } from "@/core/features/types";
import type { FrameViewTarget, ShellCall } from "@/core/plugins/frame-protocol";
import type { FramePlugin } from "@/core/plugins/webview";
import { useTerminalSessions } from "@/contexts/TerminalSessionsContext";
import { EmptyState } from "@/ui";
import { PluginWebView, type PluginWebViewHandle } from "./PluginWebView";
import { handleShellCall } from "./shell";

/** A plugin view about one host, as a session tab. */
export function PluginSessionTab({
  session,
  isVisible,
  onClose,
  onStatus,
  plugin,
  view,
}: SessionTabProps & { plugin: FramePlugin; view: string }) {
  const client = useActiveClient();
  const { navigateToSessions } = useTerminalSessions();
  const web = useRef<PluginWebViewHandle>(null);
  const [target, setTarget] = useState<FrameViewTarget>({
    view,
    hostId: String(session.host.serverId ?? session.host.id),
  });

  useEffect(() => {
    onStatus?.({ state: "connected" });
  }, [onStatus]);

  // Android back steps back inside the plugin before leaving the tab.
  useEffect(() => {
    if (!isVisible) return;
    let handling = false;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (handling) return true;
      handling = true;
      void web.current?.goBack().then((handled) => {
        handling = false;
        if (!handled) onClose();
      });
      return true;
    });
    return () => sub.remove();
  }, [isVisible, onClose]);

  const onShell = useCallback(
    (call: ShellCall, args: unknown[]) => {
      if (!client) return;
      handleShellCall(
        {
          client,
          plugin,
          navigateToSessions: (host, type) => navigateToSessions(host, type),
          showView: setTarget,
          close: onClose,
        },
        call,
        args,
      );
    },
    [client, plugin, navigateToSessions, onClose],
  );

  const style = useMemo(
    () => ({
      flex: 1,
      display: isVisible ? ("flex" as const) : ("none" as const),
    }),
    [isVisible],
  );

  if (!client) {
    return (
      <EmptyState
        className="flex-1"
        icon={CloudOff}
        title="Link a server to use it"
        hint={`${plugin.name} runs on your Termix server.`}
      />
    );
  }

  return (
    <View style={style}>
      <PluginWebView
        ref={web}
        client={client}
        plugin={plugin}
        view={target}
        onShell={onShell}
      />
    </View>
  );
}
